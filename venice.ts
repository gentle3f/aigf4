export type RequestState = 'idle' | 'queueing' | 'generating' | 'retrying' | 'error';

export interface VeniceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VeniceTextGenerationOptions {
  model: string;
  messages: VeniceMessage[];
  maxCompletionTokens?: number;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  stop?: string[];
  seed?: number;
  onStateChange?: (state: RequestState, detail?: string) => void;
}

export interface VeniceTextGenerationResult {
  model: string;
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string | null;
}

interface VeniceChatChoice {
  message?: {
    content?: string | null;
    reasoning?: string | null;
    reasoning_content?: string | null;
  };
  text?: string | null;
  finish_reason?: string | null;
}

interface VeniceChatResponse {
  model?: string;
  choices?: VeniceChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: string;
}

export const VENICE_AUTH_REQUIRED_ERROR = 'VENICE_AUTH_REQUIRED';

export const VENICE_API_BASE =
  import.meta.env.VITE_VENICE_API_BASE || '/api/venice-chat';
export const VENICE_API_KEY = import.meta.env.VITE_VENICE_API_KEY || '';
export const VENICE_CHAT_MODEL =
  import.meta.env.VITE_VENICE_CHAT_MODEL || 'olafangensan-glm-4.7-flash-heretic';
export const VENICE_CHAT_FALLBACK_MODEL =
  import.meta.env.VITE_VENICE_CHAT_FALLBACK_MODEL || 'venice-uncensored-1-2';
export const VENICE_GOD_MODEL =
  import.meta.env.VITE_VENICE_GOD_MODEL || 'google-gemma-4-31b-it';
export const VENICE_GOD_FALLBACK_MODEL =
  import.meta.env.VITE_VENICE_GOD_FALLBACK_MODEL || 'zai-org-glm-4.7-flash';

const REQUEST_HEADERS = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (VENICE_API_KEY.trim()) {
    return {
      ...headers,
      Authorization: `Bearer ${VENICE_API_KEY}`,
    };
  }

  return headers;
};

function ensureApiKey() {
  const isProxyMode = VENICE_API_BASE.startsWith('/');
  if (!isProxyMode && !VENICE_API_KEY.trim()) {
    throw new Error('Missing Venice API key. Set VITE_VENICE_API_KEY in .env.local.');
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
  });
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
    if (response.status === 401) {
      throw new Error(VENICE_AUTH_REQUIRED_ERROR);
    }

    if (typeof parsed === 'object' && parsed && 'error' in parsed) {
      throw new Error(String((parsed as { error?: unknown }).error || response.statusText));
    }

    if (typeof parsed === 'string' && parsed.trim()) {
      throw new Error(parsed);
    }

    throw new Error(`${response.status} ${response.statusText}`);
  }

  return parsed as T;
}

export async function generateVeniceText(
  options: VeniceTextGenerationOptions,
): Promise<VeniceTextGenerationResult> {
  ensureApiKey();

  const {
    model,
    messages,
    maxCompletionTokens,
    temperature = 0.72,
    topP = 0.92,
    repetitionPenalty = 1.08,
    stop = ['\nUser:', '\nUSER:', '\n使用者:'],
    seed,
    onStateChange,
  } = options;

  onStateChange?.('generating', '思考中');

  const endpoint = VENICE_API_BASE.startsWith('/')
    ? VENICE_API_BASE
    : `${VENICE_API_BASE}/chat/completions`;

  const response = await fetchJson<VeniceChatResponse>(endpoint, {
    method: 'POST',
    headers: REQUEST_HEADERS(),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: topP,
      repetition_penalty: repetitionPenalty,
      ...(typeof maxCompletionTokens === 'number'
        ? { max_completion_tokens: maxCompletionTokens }
        : {}),
      reasoning_effort: 'none',
      seed,
      stop,
      venice_parameters: {
        include_venice_system_prompt: false,
        disable_thinking: true,
        strip_thinking_response: true,
        enable_web_search: 'off',
        enable_web_scraping: false,
        enable_web_citations: false,
      },
    }),
  });

  const choice = response.choices?.[0];
  const text = choice?.message?.content ?? choice?.text ?? '';

  if (!choice) {
    throw new Error(response.error || 'Venice API did not return a completion.');
  }

  return {
    model: response.model || model,
    text,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
    finishReason: choice?.finish_reason ?? null,
  };
}

function stripCodeFences(text: string): string {
  return text.replace(/```(?:json|markdown|md|text)?/gi, '').replace(/```/g, '').trim();
}

function trimWrappedQuotes(text: string): string {
  return text.replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '').trim();
}

export function cleanVeniceChatReply(rawText: string): string {
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

export function isInvalidVeniceChatReply(text: string): boolean {
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
    /^這是什麼意思[？?！!]*$/u,
    /^你想表達什麼[？?！!]*$/u,
    /^請再說清楚一點[。．！!？?]*$/u,
    /^(?:question|user|問題|使用者)\s*[:：]/i,
    /^\d{20,}$/,
    /^(.)\1{20,}$/,
    /^\?+$/,
    /(?:Markdown|JSON).*format/i,
    /你正在和.+聊天/u,
    /這是一段真實的對話/u,
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
  if (speechPattern) parts.push(`說話方式：${speechPattern}`);
  if (quirk) parts.push(`小習慣：${quirk}`);
  if (appearance) parts.push(`外在補充：${appearance}`);

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
      ) || '已套用人格調整。',
    personaUpdate: personaUpdate || null,
  };
}
