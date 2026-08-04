# aigf4

Private Venice-powered app with romance personas, God Mode persona editing,
conversation-history imports, a general-purpose assistant, and image/video studios.

## Local development

1. Install dependencies with `npm install`.
2. Copy the settings from `.env.example` into `.env.local`.
3. For direct local development, set:
   - `VITE_VENICE_API_BASE=https://api.venice.ai/api/v1`
   - `VITE_VENICE_MODELS_API_BASE=https://api.venice.ai/api/v1/models`
   - `VITE_VENICE_IMAGE_API_BASE=https://api.venice.ai/api/v1/image`
   - `VITE_VENICE_IMAGE_MODELS_API_BASE=https://api.venice.ai/api/v1/models`
   - `VITE_VENICE_VIDEO_API_BASE=https://api.venice.ai/api/v1/video`
   - `VITE_VENICE_VIDEO_MODELS_API_BASE=https://api.venice.ai/api/v1/models`
   - `VITE_VENICE_API_KEY=your_key_here`
4. Start the app with `npm run dev`.

Never commit `.env.local`. Direct mode exposes the key to the local browser bundle
and is intended only for private development.

## Vercel

Production uses authenticated text, image, and video proxies. Configure these server-only
environment variables in Vercel:

- `VENICE_API_KEY`
- `APP_PASSWORD`
- `APP_SESSION_SECRET`

The browser never receives `VENICE_API_KEY` in proxy mode.

## Image studio

- Text-to-image defaults to `lustify-v8`.
- Image-to-image defaults to `qwen-edit-uncensored`.
- Available models, capabilities, privacy mode, and pricing load from Venice at runtime.
- Source images are compressed in the browser before upload.
- Generated images stay in the current browser session only and are not written to
  chat history, `localStorage`, or exported ZIP files.

## Video studio

- Image-to-video and text-to-video both default to the Wan 2.7 model family.
- The current model list and exact USD quote load before a generation can be submitted.
- Video queue requests are never retried automatically, preventing duplicate charges.
- Polling retries do not create another generation job.
- Completed MP4 files stay in the current browser session only and are not written to
  chat history, `localStorage`, or exported ZIP files.

## Commands

- Enter God Mode: `god mode`
- Leave God Mode: `bye god mode`
