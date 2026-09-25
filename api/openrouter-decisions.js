import { requireAuthenticatedRequest } from './_auth.js';
import { runOpenRouterDecision } from './_openrouter-decisions.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'unavailable', reasonCode: 'METHOD_NOT_ALLOWED' });
  }
  if (!requireAuthenticatedRequest(req, res)) return;

  res.setHeader('Cache-Control', 'no-store');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'state')) {
    return res.status(200).json({ status: 'unavailable', reasonCode: 'INVALID_REQUEST' });
  }
  return res.status(200).json(await runOpenRouterDecision(body.state));
}
