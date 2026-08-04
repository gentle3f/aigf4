import { VENICE_AUTH_REQUIRED_ERROR } from './venice.js';

export type VeniceVideoMode = 'image-to-video' | 'text-to-video';

export interface VeniceVideoModelConstraints {
  model_type?: string;
  aspect_ratios?: string[];
  resolutions?: string[];
  durations?: string[];
  audio?: boolean;
  audio_configurable?: boolean;
  prompt_character_limit?: number;
  reference_image_min_short_side_pixels?: number;
}

export interface VeniceVideoModelSummary {
  id: string;
  name: string;
  mode: VeniceVideoMode;
  privacy: string;
  modelSets: string[];
  traits: string[];
  constraints: VeniceVideoModelConstraints;
}

interface VeniceVideoModelApiItem {
  id?: string;
  type?: string;
  model_spec?: {
    name?: string;
    offline?: boolean;
    privacy?: string;
    deprecation?: unknown;
    model_sets?: string[];
    traits?: string[];
    constraints?: VeniceVideoModelConstraints;
  };
}

interface VeniceVideoModelsResponse {
  data?: VeniceVideoModelApiItem[];
  error?: unknown;
}

interface VeniceVideoQueueResponse {
  model?: string;
  queue_id?: string;
  download_url?: string;
  error?: unknown;
}

interface VeniceVideoStatusResponse {
  status?: string;
  average_execution_time?: number;
  execution_duration?: number;
  download_url?: string;
  error?: unknown;
}

export interface VeniceVideoPricingOptions {
  model: string;
  duration: string;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
  signal?: AbortSignal;
}

export interface VeniceVideoQueueOptions extends VeniceVideoPricingOptions {
  prompt: string;
  negativePrompt?: string;
  sourceImageDataUrl?: string;
  adultConfirmed: boolean;
}

export interface VeniceVideoQueueResult {
  model: string;
  queueId: string;
  downloadUrl?: string;
}

export type VeniceVideoRetrieveResult =
  | {
      kind: 'processing';
      status: string;
      averageExecutionTime?: number;
      executionDuration?: number;
    }
  | {
      kind: 'completed';
      blob?: Blob;
      downloadUrl?: string;
    };

export const VENICE_VIDEO_IMAGE_MODEL =
  import.meta.env.VITE_VENICE_VIDEO_IMAGE_MODEL || 'wan-2-7-image-to-video';
export const VENICE_VIDEO_TEXT_MODEL =
  import.meta.env.VITE_VENICE_VIDEO_TEXT_MODEL || 'wan-2-7-text-to-video';

const DIRECT_VENICE_BASE = 'https://api.venice.ai/api/v1';
const VENICE_API_KEY = import.meta.env.DEV
  ? import.meta.env.VITE_VENICE_API_KEY || ''
  : '';
const USE_DIRECT_DEV_API = import.meta.env.DEV && Boolean(VENICE_API_KEY.trim());

export const VENICE_VIDEO_API_BASE =
  import.meta.env.VITE_VENICE_VIDEO_API_BASE
  || (USE_DIRECT_DEV_API ? `${DIRECT_VENICE_BASE}/video` : '/api/venice-video');
export const VENICE_VIDEO_MODELS_API_BASE =
  import.meta.env.VITE_VENICE_VIDEO_MODELS_API_BASE
  || (USE_DIRECT_DEV_API ? `${DIRECT_VENICE_BASE}/models` : '/api/venice-video-models');

const isProxyMode = () => VENICE_VIDEO_API_BASE.startsWith('/');

const ensureDirectApiKey = () => {
  if (!isProxyMode() && !VENICE_API_KEY.trim()) {
    throw new Error('Missing Venice API key. Set VITE_VENICE_API_KEY in .env.local.');
  }
};

const requestHeaders = (): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (VENICE_API_KEY.trim()) {
    headers.Authorization = `Bearer ${VENICE_API_KEY}`;
  }
  return headers;
};

const stringifyError = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return stringifyError(record.message || record.error || record.detail);
  }
  return '';
};

const parseErrorResponse = async (response: Response): Promise<never> => {
  if (response.status === 401) throw new Error(VENICE_AUTH_REQUIRED_ERROR);
  if (response.status === 402) throw new Error('Venice 餘額不足，請先補充 API 額度。');
  if (response.status === 413) throw new Error('來源圖片太大，請改用較小的圖片。');
  if (response.status === 422) throw new Error('內容未通過影片模型檢查，請調整圖片或描述後再試。');
  if (response.status === 429) throw new Error('影片模型目前請求過多，請稍後再試。');
  if (response.status === 503) throw new Error('影片模型目前繁忙，請稍後再試。');

  const text = await response.text();
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const message = stringifyError(parsed.error || parsed.message || parsed.detail);
      if (message) throw new Error(message);
    } catch (error) {
      if (error instanceof Error && !(error instanceof SyntaxError)) throw error;
      throw new Error(text);
    }
  }
  throw new Error(`${response.status} ${response.statusText}`);
};

const endpointFor = (action: 'quote' | 'queue' | 'retrieve' | 'complete') => {
  if (isProxyMode()) return VENICE_VIDEO_API_BASE;
  return `${VENICE_VIDEO_API_BASE.replace(/\/$/, '')}/${action}`;
};

const buildPricingPayload = (options: VeniceVideoPricingOptions): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    model: options.model,
    duration: options.duration,
  };
  if (options.resolution) payload.resolution = options.resolution;
  if (options.aspectRatio) payload.aspect_ratio = options.aspectRatio;
  if (typeof options.audio === 'boolean') payload.audio = options.audio;
  return payload;
};

export async function listVeniceVideoModels(mode: VeniceVideoMode): Promise<VeniceVideoModelSummary[]> {
  ensureDirectApiKey();
  const url = VENICE_VIDEO_MODELS_API_BASE.startsWith('/')
    ? VENICE_VIDEO_MODELS_API_BASE
    : `${VENICE_VIDEO_MODELS_API_BASE}?type=video`;
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: requestHeaders(),
  });
  if (!response.ok) await parseErrorResponse(response);

  const payload = await response.json() as VeniceVideoModelsResponse;
  if (!payload.data) {
    throw new Error(stringifyError(payload.error) || 'Venice did not return video models.');
  }

  return payload.data
    .filter(item => item.id && item.type === 'video' && item.model_spec?.offline !== true)
    .filter(item => !item.model_spec?.deprecation)
    .filter(item => !/(?:reference-to-video|video-to-video|motion-control|transition|upscale)/i.test(item.id || ''))
    .filter(item => item.model_spec?.constraints?.model_type === mode)
    .map(item => ({
      id: item.id as string,
      name: item.model_spec?.name || item.id as string,
      mode,
      privacy: item.model_spec?.privacy || 'unknown',
      modelSets: Array.isArray(item.model_spec?.model_sets) ? item.model_spec.model_sets : [],
      traits: Array.isArray(item.model_spec?.traits) ? item.model_spec.traits : [],
      constraints: item.model_spec?.constraints || {},
    }));
}

export async function quoteVeniceVideo(options: VeniceVideoPricingOptions): Promise<number> {
  ensureDirectApiKey();
  const payload = buildPricingPayload(options);
  if (isProxyMode()) payload.action = 'quote';

  const response = await fetch(endpointFor('quote'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: requestHeaders(),
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!response.ok) await parseErrorResponse(response);

  const result = await response.json() as { quote?: number; error?: unknown };
  if (typeof result.quote !== 'number') {
    throw new Error(stringifyError(result.error) || 'Venice did not return a video quote.');
  }
  return result.quote;
}

export async function queueVeniceVideo(options: VeniceVideoQueueOptions): Promise<VeniceVideoQueueResult> {
  ensureDirectApiKey();
  const payload = {
    ...buildPricingPayload(options),
    prompt: options.prompt,
    negative_prompt: options.negativePrompt || undefined,
    image_url: options.sourceImageDataUrl || undefined,
  } as Record<string, unknown>;
  if (isProxyMode()) {
    payload.action = 'queue';
    payload.adultConfirmed = options.adultConfirmed;
  }

  const response = await fetch(endpointFor('queue'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: requestHeaders(),
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!response.ok) await parseErrorResponse(response);

  const result = await response.json() as VeniceVideoQueueResponse;
  if (!result.queue_id) {
    throw new Error(stringifyError(result.error) || 'Venice did not return a video queue ID.');
  }
  return {
    model: result.model || options.model,
    queueId: result.queue_id,
    downloadUrl: result.download_url,
  };
}

export async function retrieveVeniceVideo(
  model: string,
  queueId: string,
  downloadUrl: string | undefined,
  signal?: AbortSignal,
): Promise<VeniceVideoRetrieveResult> {
  ensureDirectApiKey();
  const payload: Record<string, unknown> = {
    model,
    queue_id: queueId,
    delete_media_on_completion: !downloadUrl,
  };
  if (isProxyMode()) payload.action = 'retrieve';

  const response = await fetch(endpointFor('retrieve'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: requestHeaders(),
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) await parseErrorResponse(response);

  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('video/')) {
    return { kind: 'completed', blob: await response.blob() };
  }

  const result = await response.json() as VeniceVideoStatusResponse;
  if (String(result.status || '').toUpperCase() === 'COMPLETED') {
    const completedUrl = result.download_url || downloadUrl;
    if (!completedUrl) throw new Error('影片已完成，但 Venice 沒有提供下載位置。');
    return { kind: 'completed', downloadUrl: completedUrl };
  }

  return {
    kind: 'processing',
    status: result.status || 'PROCESSING',
    averageExecutionTime: result.average_execution_time,
    executionDuration: result.execution_duration,
  };
}

export async function completeVeniceVideo(
  model: string,
  queueId: string,
  signal?: AbortSignal,
): Promise<void> {
  ensureDirectApiKey();
  const payload: Record<string, unknown> = { model, queue_id: queueId };
  if (isProxyMode()) payload.action = 'complete';

  const response = await fetch(endpointFor('complete'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: requestHeaders(),
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    await parseErrorResponse(response);
  }
}
