// Build-time opt-in; never infer atomic mode from the host or a runtime setting.
export const ATOMIC_CLOUD_PREVIEW=import.meta.env?.VITE_AIGF_ATOMIC_SYNC_PREVIEW==='1';
export const ATOMIC_CLOUD_PREVIEW_URL='https://hmrcvjxdmedrjjcjbtmd.supabase.co';
export const ATOMIC_CLOUD_PREVIEW_KEY=String(import.meta.env?.VITE_AIGF_SYNC_PILOT_KEY||'').trim();
if(ATOMIC_CLOUD_PREVIEW&&(!ATOMIC_CLOUD_PREVIEW_KEY||import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT!=='1'))throw Error('ATOMIC_PREVIEW_CONFIG_INVALID');
