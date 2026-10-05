import { requireAuthenticatedRequest } from './_auth.js';
import { runOpenRouterDecision } from './_openrouter-decisions.js';

export const parseDecisionRequest = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'state')) return null;
  const keys = Object.keys(body);
  if (keys.length === 1) return { state: body.state, profile: 'production' };
  if (
    keys.length === 2
    && Object.hasOwn(body, 'profile')
    && (body.profile === 'wardrobe-v4' || body.profile === 'group-gate-v2')
  ) return { state: body.state, profile: body.profile };
  return null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'unavailable', reasonCode: 'METHOD_NOT_ALLOWED' });
  }
  if (!requireAuthenticatedRequest(req, res)) return;

  res.setHeader('Cache-Control', 'no-store');
  const parsed = parseDecisionRequest(req.body);
  if (!parsed) return res.status(200).json({ status: 'unavailable', reasonCode: 'INVALID_REQUEST' });
  return res.status(200).json(await runOpenRouterDecision(
    parsed.state,
    parsed.profile === 'wardrobe-v4'
      ? { useWardrobeShadowQuestions: true }
      : parsed.profile === 'group-gate-v2'
        ? { useGroupGateShadowQuestions: true }
        : undefined,
  ));
}
