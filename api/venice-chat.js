import { requireAuthenticatedRequest } from './_auth.js';

const VENICE_UPSTREAM = 'https://api.venice.ai/api/v1/chat/completions';
const UPSTREAM_TIMEOUT_MS = 250_000;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  // 'req.close' fires when the POST body is received. Watch the response instead:
  // only a closed output connection means the browser has cancelled the stream.
  const onClientClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientClose);

  try {
    const upstream = await fetch(VENICE_UPSTREAM, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
      signal: controller.signal,
    });

    if (req.body?.stream === true && upstream.ok) {
      if (!upstream.body) throw new Error('Venice returned no streaming body.');
      res.status(upstream.status);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Forward each SSE chunk immediately. Never buffer the entire model answer.
      for await (const chunk of upstream.body) {
        if (res.destroyed) break;
        if (!res.write(chunk)) {
          await new Promise(resolve => res.once('drain', resolve));
        }
      }
      return res.end();
    }

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (res.headersSent) {
      // Once SSE headers are sent HTTP status cannot be changed.
      if (!res.destroyed) {
        res.write('data: {"error":{"message":"Venice stream interrupted.","code":"UPSTREAM_STREAM_ERROR"}}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Venice request timed out.'
        : error instanceof Error
          ? error.message
          : 'Venice upstream request failed.',
    });
  } finally {
    clearTimeout(timeout);
    res.off('close', onClientClose);
  }
}
