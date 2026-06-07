export type HordeRequestState = 'idle' | 'queueing' | 'generating' | 'retrying' | 'error';

export interface HordeTextGenerationOptions {
  model: string;
  prompt: string;
  maxContextLength?: number;
  maxLength?: number;
  temperature?: number;
  timeoutMs?: number;
  onStateChange?: (state: HordeRequestState, detail?: string) => void;
}

export interface HordeTextGenerationResult {
  model: string;
  requestId: string;
  text: string;
  workerName?: string;
}

interface HordeAsyncResponse {
  id: string;
  message?: string;
}

interface HordeStatusResponse {
  done: boolean;
  faulted?: boolean;
  queue_position?: number;
  wait_time?: number;
  is_possible?: boolean;
  message?: string;
  generations?: Array<{
    text?: string;
    worker_name?: string;
    model?: string;
    state?: string;
  }>;
}

export const AI_HORDE_API_BASE =
  import.meta.env.VITE_AIHORDE_API_BASE || 'https://aihorde.net/api';
export const AI_HORDE_CHAT_MODEL =
  import.meta.env.VITE_AIHORDE_CHAT_MODEL || 'aphrodite/TheDrummer/Cydonia-24B-v4.3';
export const AI_HORDE_GOD_MODEL =
  import.meta.env.VITE_AIHORDE_GOD_MODEL || 'aphrodite/TheDrummer/Skyfall-31B-v4.2';

const DEFAULT_TIMEOUT_MS = 40_000;
const POLL_INTERVAL_MS = 2_000;

const REQUEST_HEADERS: HeadersInit = {
  apikey: '0000000000',
  'Client-Agent': 'aigf4:1:web',
  'Content-Type': 'application/json',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    if (typeof parsed === 'object' && parsed && 'message' in parsed) {
      throw new Error(String((parsed as { message?: unknown }).message || response.statusText));
    }

    if (typeof parsed === 'string' && parsed.trim()) {
      throw new Error(parsed);
    }

    throw new Error(`${response.status} ${response.statusText}`);
  }

  return parsed as T;
}

export async function generateHordeText(
  options: HordeTextGenerationOptions,
): Promise<HordeTextGenerationResult> {
  const {
    model,
    prompt,
    maxContextLength = 4096,
    maxLength = 180,
    temperature = 0.7,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onStateChange,
  } = options;

  onStateChange?.('queueing', '排隊中');

  const start = await fetchJson<HordeAsyncResponse>(`${AI_HORDE_API_BASE}/v2/generate/text/async`, {
    method: 'POST',
    headers: REQUEST_HEADERS,
    body: JSON.stringify({
      prompt,
      models: [model],
      params: {
        max_context_length: maxContextLength,
        max_length: maxLength,
        temperature,
      },
    }),
  });

  if (!start?.id) {
    throw new Error(start?.message || 'AI Horde 沒有回傳有效請求 ID。');
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    const status = await fetchJson<HordeStatusResponse>(
      `${AI_HORDE_API_BASE}/v2/generate/text/status/${start.id}`,
      {
        method: 'GET',
        headers: REQUEST_HEADERS,
      },
    );

    if (status.faulted) {
      throw new Error(status.message || 'AI Horde 生成失敗。');
    }

    if (!status.done) {
      onStateChange?.(
        'generating',
        typeof status.queue_position === 'number'
          ? `生成中（前方 ${status.queue_position}）`
          : '生成中',
      );
      continue;
    }

    const firstGeneration = status.generations?.[0];
    if (!firstGeneration) {
      throw new Error('AI Horde 已完成，但沒有產生文字結果。');
    }

    return {
      model,
      requestId: start.id,
      text: firstGeneration.text || '',
      workerName: firstGeneration.worker_name,
    };
  }

  throw new Error('AI Horde 40 秒內未完成。');
}

function stripCodeFences(text: string): string {
  return text.replace(/```(?:json|markdown|md|text)?/gi, '').replace(/```/g, '').trim();
}

function trimWrappedQuotes(text: string): string {
  return text.replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '').trim();
}

export function cleanHordeChatReply(rawText: string): string {
  let text = stripCodeFences(rawText).replace(/\r/g, '').trim();

  if (!text) {
    return '';
  }

  text = text
    .replace(/^\uFEFF/, '')
    .replace(/^THINK[\s\S]*?(?=\n{2,}|$)/i, '')
    .replace(/^\s*\[[A-Z_]+:[\s\S]*?\]\s*$/gim, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/^\d+\.\s.*$/gm, '')
    .replace(/^\|\s.*$/gm, '')
    .replace(/^(?:assistant|reply|answer|角色|回覆|回答)\s*[:：]\s*/i, '')
    .trim();

  const stopAtPattern = /(?:^|\n)(?:user|question|問題|使用者)\s*[:：]/i;
  if (stopAtPattern.test(text)) {
    text = text.split(stopAtPattern)[0].trim();
  }

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^THINK\b/i.test(line))
    .filter(line => !/^\[[A-Z_]+:/i.test(line))
    .filter(line => !/^#+/.test(line))
    .filter(line => !/^\d+\.\s/.test(line))
    .filter(line => !/^\|\s/.test(line))
    .map(line => line.replace(/^(?:assistant|reply|answer|角色|回覆|回答)\s*[:：]\s*/i, ''));

  return trimWrappedQuotes(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

export function isInvalidHordeChatReply(text: string): boolean {
  const normalized = text.trim();

  if (!normalized) {
    return true;
  }

  const invalidPatterns = [
    /\[PERSONA_UPDATE:/i,
    /\[ONE-TIME INSTRUCTION:/i,
    /^THINK\b/i,
    /^#+\s/m,
    /^```/,
    /^This is a very interesting question/i,
    /^(?:question|user|使用者)\s*[:：]/i,
    /^\d{20,}$/,
    /^(.)\1{20,}$/,
    /^\?+$/,
  ];

  return invalidPatterns.some(pattern => pattern.test(normalized));
}

function objectToPersonaDescription(value: Record<string, unknown>): string {
  const parts: string[] = [];

  const getString = (key: string) =>
    typeof value[key] === 'string' ? String(value[key]).trim() : '';

  const personality = getString('personality');
  const description = getString('description');
  const speechPattern = getString('speech_pattern');
  const quirk = getString('quirk');
  const appearance = getString('appearance');

  if (personality) parts.push(personality);
  if (description) parts.push(description);
  if (speechPattern) parts.push(`說話風格：${speechPattern}`);
  if (quirk) parts.push(`特徵：${quirk}`);
  if (appearance) parts.push(`外在氣質：${appearance}`);

  return parts.join(' ').trim();
}

function normalizePersonaUpdate(rawUpdate: string): string {
  let update = stripCodeFences(rawUpdate).trim();

  if (!update) {
    return '';
  }

  try {
    const parsed = JSON.parse(update);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const normalized = objectToPersonaDescription(parsed as Record<string, unknown>);
      if (normalized) {
        return normalized;
      }
    }
  } catch {
    // Ignore non-JSON payloads.
  }

  return trimWrappedQuotes(
    update
      .replace(/^#+\s.*$/gm, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

export function extractPersonaUpdatePayload(rawText: string): {
  visibleText: string;
  personaUpdate: string | null;
} {
  const cleaned = stripCodeFences(rawText).replace(/\r/g, '');
  const match = cleaned.match(/\[PERSONA_UPDATE:\s*([\s\S]*?)\]/i);

  if (!match) {
    return {
      visibleText: trimWrappedQuotes(
        cleaned
          .replace(/^#+\s.*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      ),
      personaUpdate: null,
    };
  }

  const before = cleaned.slice(0, match.index).trim();
  const after = cleaned.slice((match.index || 0) + match[0].length).trim();
  const personaUpdate = normalizePersonaUpdate(match[1]);

  return {
    visibleText:
      trimWrappedQuotes(
        `${before}\n${after}`
          .replace(/^#+\s.*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      ) || '已更新這個角色的人格設定。',
    personaUpdate: personaUpdate || null,
  };
}
