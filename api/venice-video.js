import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { requireAuthenticatedRequest } from './_auth.js';

const VENICE_VIDEO_BASE = 'https://api.venice.ai/api/v1/video';
const UPSTREAM_TIMEOUT_MS = 240_000;
const MAX_SOURCE_DATA_URL_LENGTH = 3_800_000;
const VALID_ACTIONS = new Set(['quote', 'queue', 'retrieve', 'complete']);

export const config = {
  maxDuration: 300,
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

const addPricingFields = (payload, body) => {
  const duration = optionalString(body.duration, 12);
  const resolution = optionalString(body.resolution, 16);
  const aspectRatio = optionalString(body.aspect_ratio, 16);
  if (!duration) throw new Error('Video duration is required.');
  payload.duration = duration;
  if (resolution) payload.resolution = resolution;
  if (aspectRatio) payload.aspect_ratio = aspectRatio;
  if (typeof body.audio === 'boolean') payload.audio = body.audio;
};

const buildPayload = (action, body) => {
  const model = optionalString(body.model, 200);
  if (!model) throw new Error('Video model is required.');
  const payload = { model };

  if (action === 'quote' || action === 'queue') {
    addPricingFields(payload, body);
  }

  if (action === 'queue') {
    const prompt = optionalString(body.prompt, 10_000);
    if (!prompt) throw new Error('Video prompt is required.');
    payload.prompt = prompt;

    const negativePrompt = optionalString(body.negative_prompt, 10_000);
    if (negativePrompt) payload.negative_prompt = negativePrompt;

    const imageUrl = optionalString(body.image_url, MAX_SOURCE_DATA_URL_LENGTH);
    if (imageUrl) {
      if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(imageUrl)) {
        throw new Error('Source image must be a JPEG, PNG, or WebP data URL.');
      }
      if (imageUrl.length >= MAX_SOURCE_DATA_URL_LENGTH) {
        throw new Error('Source image is too large. Please upload a smaller image.');
      }
      payload.image_url = imageUrl;
    }
  }

  if (action === 'retrieve' || action === 'complete') {
    const queueId = optionalString(body.queue_id, 200);
    if (!queueId || !/^[a-z0-9_-]+$/i.test(queueId)) {
      throw new Error('A valid video queue ID is required.');
    }
    payload.queue_id = queueId;
    if (action === 'retrieve') {
      payload.delete_media_on_completion = body.delete_media_on_completion === true;
    }
  }

  return payload;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuthenticatedRequest(req, res)) return;

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing VENICE_API_KEY on server.' });
  }

  const body = req.body || {};
  const action = optionalString(body.action, 16);
  if (!action || !VALID_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Invalid video action.' });
  }
  if (action === 'queue' && body.adultConfirmed !== true) {
    return res.status(400).json({ error: 'Adult and image-rights confirmation is required.' });
  }

  let payload;
  try {
    payload = buildPayload(action, body);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid video request.',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${VENICE_VIDEO_BASE}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: action === 'retrieve' ? 'video/mp4, application/json' : 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'private, no-store');

    if (action === 'retrieve' && upstream.ok && contentType.startsWith('video/')) {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', 'inline; filename="venice-video.mp4"');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (!upstream.body) return res.end();
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', contentType || 'application/json');
    return res.send(text);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Venice video request timed out.'
        : error instanceof Error
          ? error.message
          : 'Venice video request failed.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
