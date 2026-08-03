import { requireAuthenticatedRequest } from './_auth.js';

const VENICE_IMAGE_BASE = 'https://api.venice.ai/api/v1/image';
const UPSTREAM_TIMEOUT_MS = 120_000;
const MAX_SOURCE_BASE64_LENGTH = 3_800_000;

export const config = {
  maxDuration: 120,
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

const optionalString = (value, maxLength) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const optionalNumber = (value, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
};

const buildGeneratePayload = body => {
  const prompt = optionalString(body.prompt, 32_768);
  const model = optionalString(body.model, 160);
  if (!prompt || !model) {
    throw new Error('Model and prompt are required.');
  }

  const payload = {
    model,
    prompt,
    safe_mode: false,
    hide_watermark: true,
    embed_exif_metadata: false,
    return_binary: false,
    format: 'webp',
    variants: Math.round(optionalNumber(body.variants, 1, 4) || 1),
    enhance_prompt: false,
  };

  const negativePrompt = optionalString(body.negative_prompt, 7_500);
  const aspectRatio = optionalString(body.aspect_ratio, 12);
  const resolution = optionalString(body.resolution, 10);
  const width = optionalNumber(body.width, 256, 1280);
  const height = optionalNumber(body.height, 256, 1280);
  const steps = optionalNumber(body.steps, 1, 50);
  const seed = optionalNumber(body.seed, -999_999_999, 999_999_999);

  if (negativePrompt) payload.negative_prompt = negativePrompt;
  if (aspectRatio) payload.aspect_ratio = aspectRatio;
  if (resolution) payload.resolution = resolution;
  if (width) payload.width = Math.round(width);
  if (height) payload.height = Math.round(height);
  if (steps) payload.steps = Math.round(steps);
  if (seed !== undefined) payload.seed = Math.round(seed);

  return payload;
};

const buildEditPayload = body => {
  const prompt = optionalString(body.prompt, 32_768);
  const model = optionalString(body.model, 160);
  const image = optionalString(body.image, MAX_SOURCE_BASE64_LENGTH);
  if (!prompt || !model || !image) {
    throw new Error('Model, prompt, and source image are required.');
  }

  if (image.length >= MAX_SOURCE_BASE64_LENGTH) {
    throw new Error('Source image is too large. Please upload a smaller image.');
  }

  const payload = {
    model,
    prompt,
    image,
    safe_mode: false,
    output_format: 'webp',
    enhance_prompt: false,
  };

  const aspectRatio = optionalString(body.aspect_ratio, 12);
  const resolution = optionalString(body.resolution, 10);
  if (aspectRatio) payload.aspect_ratio = aspectRatio;
  if (resolution) payload.resolution = resolution;

  return payload;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuthenticatedRequest(req, res)) {
    return;
  }

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing VENICE_API_KEY on server.' });
  }

  const body = req.body || {};
  if (body.adultConfirmed !== true) {
    return res.status(400).json({ error: 'Adult-content confirmation is required.' });
  }

  const mode = body.mode;
  if (mode !== 'generate' && mode !== 'edit') {
    return res.status(400).json({ error: 'mode must be generate or edit.' });
  }

  let payload;
  try {
    payload = mode === 'generate' ? buildGeneratePayload(body) : buildEditPayload(body);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid image request.',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${VENICE_IMAGE_BASE}/${mode === 'generate' ? 'generate' : 'edit'}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: mode === 'generate' ? 'application/json' : 'image/webp',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'private, no-store');

    if (mode === 'edit' && upstream.ok && contentType.startsWith('image/')) {
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      return res.send(bytes);
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', contentType || 'application/json');
    return res.send(text);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Venice image request timed out.'
        : error instanceof Error
          ? error.message
          : 'Venice image request failed.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
