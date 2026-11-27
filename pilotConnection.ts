import {createClient} from '@supabase/supabase-js';
import {createPilotMediaSync,type PilotMediaRow} from './pilotMediaSync.js';
type Reply={data:unknown;error:{code?:string}|null};
const checked=(r:Reply)=>{if(r.error)throw Error('PILOT_HTTP_'+(r.error.code||'FAILED'));return r.data;};
export type PilotConnectionConfig={projectUrl:string;productionUrl:string;enabled:boolean;publishableKey:string};
export function createPilotConnection(config:PilotConnectionConfig,fetchImpl:typeof fetch=fetch){
 const target=new URL(config.projectUrl),production=new URL(config.productionUrl);
 if(!config.enabled||target.protocol!=='https:'||target.origin===production.origin||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(target.origin))throw Error('STORY_SYNC_ISOLATED_PROJECT_REQUIRED');
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey))throw Error('STORY_SYNC_PUBLISHABLE_KEY_REQUIRED');
 const restrictedFetch:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const path=url.pathname;
  const mediaObject=/^\/storage\/v1\/object\/(?:authenticated\/)?aigf-pilot-media\/[a-f0-9-]{36}\/[a-zA-Z0-9_-]{1,300}\/[a-f0-9]{64}$/.test(path);
  const allowed=(method==='GET'||method==='POST')&&(path==='/rest/v1/wetapp_pilot_media'||mediaObject)||method==='GET'&&path==='/rest/v1/wetapp_messages'||method==='POST'&&['/rest/v1/rpc/wetapp_story_checkpoint_read_lab','/rest/v1/rpc/wetapp_story_checkpoint_commit_lab','/rest/v1/rpc/wetapp_story_checkpoint_init_lab'].includes(path)||method==='POST'&&path==='/auth/v1/token'&&['password','refresh_token'].includes(url.searchParams.get('grant_type')||'');
  if(url.origin!==target.origin||url.username||url.password||!allowed)throw Error('STORY_SYNC_NETWORK_DENIED');
  return fetchImpl(input,{...init,redirect:'error'});
 };
 const supabase=createClient(target.origin,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:restrictedFetch}});
 let ownerId:string|null=null;
 const getMedia=()=>{
  if(!ownerId)throw Error('PILOT_MEDIA_LOGIN_REQUIRED');
  const uid=ownerId,table=()=>supabase.from('wetapp_pilot_media'),bucket=supabase.storage.from('aigf-pilot-media');
  const fields='asset_id,kind,sha256,mime_type,byte_size,storage_path,metadata,created_at_ms';
  return createPilotMediaSync(uid,{
   read:async id=>checked(await table().select(fields).eq('user_id',uid).eq('asset_id',id).maybeSingle()) as PilotMediaRow|null,
   list:async()=>{const out:PilotMediaRow[]=[];for(let i=0;;i+=200){const rows=checked(await table().select(fields).eq('user_id',uid).order('asset_id').range(i,i+199)) as PilotMediaRow[];out.push(...rows);if(rows.length<200)return out;}},
   upload:async(path,blob)=>{const r=await bucket.upload(path,blob,{contentType:blob.type,upsert:false});if(r.error)throw Error('PILOT_MEDIA_UPLOAD_FAILED');},
   download:async path=>{const r=await bucket.download(path);if(r.error||!r.data)throw Error('PILOT_MEDIA_DOWNLOAD_FAILED');return r.data;},
   insert:async row=>{checked(await table().insert({...row,user_id:uid}));}
  });
 };

 return {supabase,getMedia,isSignedIn:()=>ownerId!==null,signIn:async(email:string,password:string)=>{
 if(ownerId)throw Error('PILOT_ALREADY_SIGNED_IN');
 const result=await supabase.auth.signInWithPassword({email,password});
 if(result.error||!result.data.session)throw Error('STORY_SYNC_LOGIN_FAILED');
 ownerId=result.data.session.user.id;
 }};
}
export const pilotConnectionEnabled=import.meta.env?.VITE_AIGF_ATOMIC_SYNC_PREVIEW!=='1'&&import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT==='1'&&!!import.meta.env?.VITE_AIGF_SYNC_PILOT_KEY;
let active:ReturnType<typeof createPilotConnection>|null=null;
export const getPilotConnection=()=>{
 if(!pilotConnectionEnabled)throw Error('PILOT_CONNECTION_DISABLED');
 return active??=createPilotConnection({projectUrl:'https://hmrcvjxdmedrjjcjbtmd.supabase.co',productionUrl:'https://ebinyocojscfnxskybax.supabase.co',enabled:true,publishableKey:String(import.meta.env.VITE_AIGF_SYNC_PILOT_KEY)});
};
