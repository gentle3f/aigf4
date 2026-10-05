import { VENICE_AUTH_REQUIRED_ERROR } from './venice.js';

export type VeniceImageMode = 'generate' | 'edit';

export interface VeniceImageModelConstraints {
  promptCharacterLimit?: number;
  aspectRatios?: string[];
  defaultAspectRatio?: string;
  resolutions?: string[];
  defaultResolution?: string;
  widthHeightDivisor?: number;
  steps?: {
    default?: number;
    max?: number;
  };
}

interface VenicePrice {
  usd?: number;
}

export interface VeniceImageModelSummary {
  id: string;
  name: string;
  kind: VeniceImageMode;
  privacy: string;
  traits: string[];
  priceUsd?: number;
  resolutionPrices: Record<string, number>;
  constraints: VeniceImageModelConstraints;
}

interface VeniceImageModelApiItem {
  id?: string;
  type?: string;
  model_spec?: {
    name?: string;
    offline?: boolean;
    privacy?: string;
    traits?: string[];
    constraints?: VeniceImageModelConstraints;
    pricing?: {
      generation?: VenicePrice;
      inpaint?: VenicePrice;
      resolutions?: Record<string, VenicePrice>;
    };
  };
}

interface VeniceImageModelsResponse {
  data?: VeniceImageModelApiItem[];
  error?: string;
}

interface VeniceGenerateResponse {
  id?: string;
  images?: string[];
  timing?: {
    total?: number;
  };
  error?: string;
}

export interface VeniceImageRequest {
  mode: VeniceImageMode;
  model: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageBase64?: string;
  aspectRatio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  variants?: number;
  steps?: number;
  seed?: number;
  adultConfirmed: boolean;
  signal?: AbortSignal;
}

export interface VeniceImageResult {
  blobs: Blob[];
  requestId?: string;
  totalMs?: number;
}

export const VENICE_IMAGE_API_BASE =
  import.meta.env.VITE_VENICE_IMAGE_API_BASE || '/api/venice-images';
export const VENICE_IMAGE_MODELS_API_BASE =
  import.meta.env.VITE_VENICE_IMAGE_MODELS_API_BASE || '/api/venice-image-models';
export {
  VENICE_IMAGE_EDIT_MODEL,
  VENICE_IMAGE_GENERATE_MODEL,
} from './veniceImagePolicy.js';

const DIRECT_VENICE_BASE = 'https://api.venice.ai/api/v1';
const VENICE_API_KEY = import.meta.env.DEV
  ? import.meta.env.VITE_VENICE_API_KEY || ''
  : '';

const requestHeaders = (contentType = 'application/json'): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': contentType };
  if (VENICE_API_KEY.trim()) {
    headers.Authorization = `Bearer ${VENICE_API_KEY}`;
  }
  return headers;
};

const isProxyMode = () => VENICE_IMAGE_API_BASE.startsWith('/');

const ensureDirectApiKey = () => {
  if (!isProxyMode() && !VENICE_API_KEY.trim()) {
    throw new Error('Missing Venice API key. Set VITE_VENICE_API_KEY in .env.local.');
  }
};

const RETRYABLE_IMAGE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_IMAGE_MESSAGE_PATTERN = /(?:demand|too many requests|rate[ -]?limit|overload|busy|capacity|temporar|try again|unavailable|service unavailable)/iu;

export class VeniceImageRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'VeniceImageRequestError';
    this.status = status;
    this.retryable = RETRYABLE_IMAGE_STATUSES.has(status)
      || RETRYABLE_IMAGE_MESSAGE_PATTERN.test(message);
  }
}

export const isRetryableVeniceImageError = (error: unknown) => {
  if (error instanceof VeniceImageRequestError) return error.retryable;
  return error instanceof Error && RETRYABLE_IMAGE_MESSAGE_PATTERN.test(error.message);
};

const parseErrorResponse = async (response: Response): Promise<never> => {
  if (response.status === 401) {
    throw new Error(VENICE_AUTH_REQUIRED_ERROR);
  }

  const text = await response.text();
  if (text) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown; detail?: unknown };
      const message = [parsed.error, parsed.message, parsed.detail]
        .find(value => typeof value === 'string' && value.trim());
      if (typeof message === 'string') {
        throw new VeniceImageRequestError(message, response.status);
      }
    } catch (error) {
      if (error instanceof VeniceImageRequestError) throw error;
      if (!(error instanceof SyntaxError)) throw error;
      throw new VeniceImageRequestError(text, response.status);
    }
  }
  throw new VeniceImageRequestError(
    `${response.status} ${response.statusText}`,
    response.status,
  );
};

const base64ToBlob = (value: string, type = 'image/webp') => {
  const normalized = value.replace(/^data:image\/[^;]+;base64,/, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
};

const getModelListUrl = (kind: VeniceImageMode) => {
  if (VENICE_IMAGE_MODELS_API_BASE.startsWith('/')) {
    return `${VENICE_IMAGE_MODELS_API_BASE}?kind=${kind}`;
  }
  const type = kind === 'generate' ? 'image' : 'inpaint';
  return `${VENICE_IMAGE_MODELS_API_BASE}?type=${type}`;
};

export async function listVeniceImageModels(kind: VeniceImageMode): Promise<VeniceImageModelSummary[]> {
  ensureDirectApiKey();
  const response = await fetch(getModelListUrl(kind), {
    credentials: 'same-origin',
    headers: requestHeaders(),
  });
  if (!response.ok) await parseErrorResponse(response);

  const payload = await response.json() as VeniceImageModelsResponse;
  if (!payload.data) {
    throw new Error(payload.error || 'Venice did not return image models.');
  }

  return payload.data
    .filter(item => item.id && item.model_spec?.offline !== true)
    .filter(item => kind !== 'generate' || item.id !== 'bria-bg-remover')
    .map(item => {
      const spec = item.model_spec || {};
      const pricing = spec.pricing || {};
      const resolutionPrices = Object.fromEntries(
        Object.entries(pricing.resolutions || {})
          .filter((entry): entry is [string, VenicePrice] => typeof entry[1]?.usd === 'number')
          .map(([resolution, price]) => [resolution, price.usd as number]),
      );
      return {
        id: item.id as string,
        name: spec.name || item.id as string,
        kind,
        privacy: spec.privacy || 'unknown',
        traits: Array.isArray(spec.traits) ? spec.traits : [],
        priceUsd: kind === 'generate' ? pricing.generation?.usd : pricing.inpaint?.usd,
        resolutionPrices,
        constraints: spec.constraints || {},
      };
    });
}

const getImageRequestUrl = (mode: VeniceImageMode) => {
  if (isProxyMode()) return VENICE_IMAGE_API_BASE;
  const directBase = VENICE_IMAGE_API_BASE || `${DIRECT_VENICE_BASE}/image`;
  return `${directBase.replace(/\/$/, '')}/${mode === 'generate' ? 'generate' : 'edit'}`;
};

export async function requestVeniceImage(options: VeniceImageRequest): Promise<VeniceImageResult> {
  ensureDirectApiKey();

  const payload: Record<string, unknown> = {
    mode: options.mode,
    model: options.model,
    prompt: options.prompt,
    safe_mode: false,
    adultConfirmed: options.adultConfirmed,
    enhance_prompt: false,
  };

  if (options.mode === 'generate') {
    payload.negative_prompt = options.negativePrompt;
    payload.aspect_ratio = options.aspectRatio;
    payload.resolution = options.resolution;
    payload.width = options.width;
    payload.height = options.height;
    payload.variants = options.variants || 1;
    payload.steps = options.steps;
    payload.seed = options.seed;
    payload.format = 'webp';
    payload.return_binary = false;
    payload.hide_watermark = true;
  } else {
    payload.image = options.sourceImageBase64;
    payload.aspect_ratio = options.aspectRatio;
    payload.resolution = options.resolution;
    payload.output_format = 'webp';
  }

  if (!isProxyMode()) {
    delete payload.mode;
    delete payload.adultConfirmed;
  }

  const response = await fetch(getImageRequestUrl(options.mode), {
    method: 'POST',
    credentials: 'same-origin',
    headers: requestHeaders(),
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!response.ok) await parseErrorResponse(response);

  if (options.mode === 'edit') {
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) {
      throw new Error('Venice image edit returned a non-image response.');
    }
    const blob = await response.blob();
    if (blob.size < 512) {
      throw new Error('Venice image edit returned an empty or incomplete image.');
    }
    return { blobs: [blob] };
  }

  const result = await response.json() as VeniceGenerateResponse;
  if (!result.images?.length) {
    throw new Error(result.error || 'Venice did not return an image.');
  }
  const blobs = result.images.map(image => base64ToBlob(image));
  if (blobs.some(blob => blob.size < 512)) {
    throw new Error('Venice image generation returned an empty or incomplete image.');
  }

  return {
    blobs,
    requestId: result.id,
    totalMs: result.timing?.total,
  };
}
