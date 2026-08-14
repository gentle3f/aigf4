import { handleUpload } from '@vercel/blob/client';
import { requireAuthenticatedRequest } from './_auth.js';

const BACKUP_PATH_PATTERN = /^wetapp-backups\/v1\/[a-zA-Z0-9_-]{43}\/\d{13}-[a-z0-9-]{8,64}\.wetbackup$/u;
const MAX_BACKUP_SIZE_BYTES = 1024 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.body?.type === 'blob.generate-client-token' && !requireAuthenticatedRequest(req, res)) {
    return;
  }

  try {
    const response = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!BACKUP_PATH_PATTERN.test(pathname)) {
          throw new Error('Invalid backup pathname.');
        }
        return {
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes: MAX_BACKUP_SIZE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
        };
      },
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('Cloud backup upload token failed:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
}
