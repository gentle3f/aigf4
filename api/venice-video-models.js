import { requireAuthenticatedRequest } from './_auth.js';

const VENICE_MODELS_UPSTREAM = 'https://api.venice.ai/api/v1/models?type=video';
const UPSTREAM_TIMEOUT_MS = 20_000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuthenticatedRequest(req, res)) return;

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing VENICE_API_KEY on server.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(VENICE_MODELS_UPSTREAM, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(text);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Venice video model list request timed out.'
        : error instanceof Error
          ? error.message
          : 'Venice video model list request failed.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
