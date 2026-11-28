// Explicit build-time database target; preserve existing pilot builds and legacy sync.
export const PILOT_CLOUD_URL='https://hmrcvjxdmedrjjcjbtmd.supabase.co';
export const PRODUCTION_CLOUD_URL='https://ebinyocojscfnxskybax.supabase.co';
type Env=Record<string,string|boolean|undefined>;
export function resolveAtomicCloudConfig(env:Env={}){
 const enabled=env.VITE_AIGF_ATOMIC_SYNC_PREVIEW==='1';
 const target=env.VITE_AIGF_ATOMIC_TARGET||'pilot';
 if(target!=='pilot'&&target!=='production')throw Error('ATOMIC_TARGET_INVALID');
 const pilotKey=String(env.VITE_AIGF_SYNC_PILOT_KEY||'').trim();
 const productionKey=String(env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY||'').trim();
 const url=target==='production'?PRODUCTION_CLOUD_URL:PILOT_CLOUD_URL;
 const key=target==='production'?productionKey:pilotKey;
 if(enabled&&(!key||env.VITE_AIGF_VPS_CHAT_PILOT!=='1'))throw Error('ATOMIC_PREVIEW_CONFIG_INVALID');
 if(enabled&&target==='production'&&(String(env.VITE_SUPABASE_URL||'').trim()!==PRODUCTION_CLOUD_URL||pilotKey||env.VITE_AIGF_SERVER_GENERATION_V4!=='1'))throw Error('ATOMIC_PRODUCTION_CONFIG_INVALID');
 return {enabled,target,url,key};
}
const cfg=resolveAtomicCloudConfig(import.meta.env);
export const ATOMIC_CLOUD_PREVIEW=cfg.enabled;
export const ATOMIC_CLOUD_PRODUCTION=cfg.enabled&&cfg.target==='production';
export const ATOMIC_CLOUD_PREVIEW_URL=cfg.url;
export const ATOMIC_CLOUD_PREVIEW_KEY=cfg.key;
