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

## Character chat

- Default and imported characters use `qwen-3-6-plus` for stronger multi-speaker continuity.
- Invalid, repetitive, or malformed replies retry automatically before using the configured fallbacks.
- Named third parties can speak in the current scene without taking over the active character or user identity.

## Image studio

- Text-to-image defaults to `lustify-v8`.
- Image-to-image defaults to `qwen-edit-uncensored`.
- Available models, capabilities, privacy mode, and pricing load from Venice at runtime.
- Source images are compressed in the browser before upload.
- Generated images stay in the current browser session only and are not written to
  chat history, `localStorage`, or exported ZIP files.

## Character photos

- Default, imported, and random characters recognize direct photo/selfie requests in chat.
- The character first proposes one context-aware image prompt; no image request is sent until the user approves it.
- Every proposal can be approved, declined, or edited inline, with the estimated Venice cost shown before approval.
- Existing character avatars are used as edit references when available so generated photos retain the same face.
- Reference-mode prompts lock the subject to the exact uploaded face and omit inferred demographic or appearance descriptions that could create a generic lookalike.
- Before approval, users can switch between avatar-reference editing and name/persona text generation; the displayed model, prompt, and estimated price update together.
- Chat history renders generated images as compact attachments and only loads the full image after it is opened; the album continues to show thumbnails.
- Finished photos are stored in the browser-private IndexedDB and never enter Camera Roll automatically; the app requests persistent storage, while an explicit ZIP export is the only action that writes them to Downloads. This storage is origin-isolated rather than encrypted and is removed when the user clears site data.
- Photos appear in the character private album and are bundled under `photos/` during chat export/import without inflating localStorage JSON.

## Video studio

- Image-to-video and text-to-video both default to Wan 2.7 Enhanced.
- The current model list and exact USD quote load before a generation can be submitted.
- The prompt magic wand rewrites the draft for the selected model family and video settings while preserving the original wording intensity.
- Video queue requests are never retried automatically, preventing duplicate charges.
- Polling retries do not create another generation job.
- Unfinished queue metadata is stored in `localStorage` and polling resumes automatically
  after a reload or a new visit. Source images are never persisted with that metadata.
- Completed MP4 files stay in the current browser session only and are not written to
  chat history, `localStorage`, or exported ZIP files.

## Commands

- Enter God Mode: `god mode`
- Leave God Mode: `bye god mode`
