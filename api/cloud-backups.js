import { del, issueSignedToken, list, presignUrl } from '@vercel/blob';
import { requireAuthenticatedRequest } from './_auth.js';

const BACKUP_PREFIX = 'wetapp-backups/v1/';
const VAULT_ID_PATTERN = /^[a-zA-Z0-9_-]{43}$/u;
const BACKUP_PATH_PATTERN = /^wetapp-backups\/v1\/[a-zA-Z0-9_-]{43}\/\d{13}-[a-z0-9-]{8,64}\.wetbackup$/u;
const RETAINED_BACKUPS = 10;
const RETAINED_SIZE_BUDGET = 900 * 1024 * 1024;

const listBackups = async (vaultId) => {
  if (!VAULT_ID_PATTERN.test(vaultId)) throw new Error('Invalid backup vault.');
  const vaultPrefix = `${BACKUP_PREFIX}${vaultId}/`;
  const result = await list({ prefix: vaultPrefix, limit: 100 });
  return result.blobs
    .filter(blob => BACKUP_PATH_PATTERN.test(blob.pathname) && blob.pathname.startsWith(vaultPrefix))
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime());
};

const publicMetadata = blob => ({
  pathname: blob.pathname,
  size: blob.size,
  uploadedAt: blob.uploadedAt.toISOString(),
});

export default async function handler(req, res) {
  if (!requireAuthenticatedRequest(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const vaultId = String(req.query?.vault || '');
      if (!VAULT_ID_PATTERN.test(vaultId)) {
        return res.status(400).json({ error: 'Missing or invalid backup vault.' });
      }
      const backups = await listBackups(vaultId);
      return res.status(200).json({ backups: backups.map(publicMetadata) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const action = String(req.body?.action || '');
    const vaultId = String(req.body?.vaultId || '');
    if (!VAULT_ID_PATTERN.test(vaultId)) {
      return res.status(400).json({ error: 'Missing or invalid backup vault.' });
    }
    const vaultPrefix = `${BACKUP_PREFIX}${vaultId}/`;
    if (action === 'download') {
      const pathname = String(req.body?.pathname || '');
      if (!BACKUP_PATH_PATTERN.test(pathname) || !pathname.startsWith(vaultPrefix)) {
        return res.status(400).json({ error: 'Invalid backup pathname.' });
      }
      const backups = await listBackups(vaultId);
      if (!backups.some(blob => blob.pathname === pathname)) {
        return res.status(404).json({ error: 'Backup not found.' });
      }
      const validUntil = Date.now() + 5 * 60 * 1000;
      const signedToken = await issueSignedToken({
        pathname,
        operations: ['get'],
        validUntil,
      });
      const { presignedUrl } = await presignUrl(signedToken, {
        access: 'private',
        operation: 'get',
        pathname,
        validUntil,
        useCache: false,
      });
      return res.status(200).json({ url: presignedUrl, validUntil });
    }

    if (action === 'prune') {
      const backups = await listBackups(vaultId);
      const retained = [];
      let retainedSize = 0;
      backups.forEach(blob => {
        if (
          retained.length === 0
          || (retained.length < RETAINED_BACKUPS && retainedSize + blob.size <= RETAINED_SIZE_BUDGET)
        ) {
          retained.push(blob);
          retainedSize += blob.size;
        }
      });
      const retainedPaths = new Set(retained.map(blob => blob.pathname));
      const expired = backups.filter(blob => !retainedPaths.has(blob.pathname));
      if (expired.length) await del(expired.map(blob => blob.pathname));
      return res.status(200).json({ retained: retained.length, retainedSize });
    }

    if (action === 'delete-all') {
      const backups = await listBackups(vaultId);
      if (backups.length) await del(backups.map(blob => blob.pathname));
      return res.status(200).json({ deleted: backups.length });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (error) {
    console.error('Cloud backup request failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Cloud backup failed' });
  }
}
