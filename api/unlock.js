import {
  clearAuthenticatedSession,
  setAuthenticatedSession,
  validatePassword,
} from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const password = String(req.body?.password || '');
    if (!validatePassword(password)) {
      clearAuthenticatedSession(req, res);
      return res.status(401).json({ error: 'Password incorrect.' });
    }

    setAuthenticatedSession(req, res);
    return res.status(200).json({ authenticated: true });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unlock failed.',
    });
  }
}
