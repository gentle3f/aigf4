# aigf4

Private Venice-powered chat app with romance personas, God Mode persona editing,
conversation-history imports, and a separate general-purpose Venice AI assistant.

## Local development

1. Install dependencies with `npm install`.
2. Copy the settings from `.env.example` into `.env.local`.
3. For direct local development, set:
   - `VITE_VENICE_API_BASE=https://api.venice.ai/api/v1`
   - `VITE_VENICE_MODELS_API_BASE=https://api.venice.ai/api/v1/models`
   - `VITE_VENICE_API_KEY=your_key_here`
4. Start the app with `npm run dev`.

Never commit `.env.local`. Direct mode exposes the key to the local browser bundle
and is intended only for private development.

## Vercel

Production uses the authenticated `/api/venice-chat` and `/api/venice-models`
proxies. Configure these server-only environment variables in Vercel:

- `VENICE_API_KEY`
- `APP_PASSWORD`
- `APP_SESSION_SECRET`

The browser never receives `VENICE_API_KEY` in proxy mode.

## Commands

- Enter God Mode: `god mode`
- Leave God Mode: `bye god mode`
