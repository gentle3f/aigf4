import {createClient} from '@supabase/supabase-js';
import type {StoryCheckpointTransport,StoryCheckpointSnapshot,StoryCheckpointRow} from './storyCheckpointSession.js';
type Reply={data:unknown;error:{code?:string}|null};
type Query={eq:(column:string,value:string)=>Query;order:(column:string,opts:{ascending:boolean})=>Query;range:(from:number,to:number)=>PromiseLike<Reply>};
type Client={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Reply>;from:(table:string)=>{select:(fields:string)=>Query}};
const checked=(r:Reply)=>{if(r.error)throw Error('STORY_SYNC_HTTP_'+(r.error.code||'FAILED'));return r.data;};
// Explicit isolated project only. Never fall back to the application's production URL.
export function createStoryCheckpointSupabaseTransport<S extends StoryCheckpointSnapshot>(config:{projectUrl:string;productionUrl:string;enabled:boolean;publishableKey:string},fetchImpl:typeof fetch=fetch){
 const target=new URL(config.projectUrl),production=new URL(config.productionUrl);
 if(!config.enabled||target.protocol!=='https:'||target.origin===production.origin||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(target.origin))throw Error('STORY_SYNC_ISOLATED_PROJECT_REQUIRED');
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey))throw Error('STORY_SYNC_PUBLISHABLE_KEY_REQUIRED');
 const restrictedFetch:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const path=url.pathname;
  const allowed=method==='GET'&&path==='/rest/v1/wetapp_messages'||method==='POST'&&['/rest/v1/rpc/wetapp_story_checkpoint_read_lab','/rest/v1/rpc/wetapp_story_checkpoint_commit_lab','/rest/v1/rpc/wetapp_story_checkpoint_init_lab'].includes(path)||method==='POST'&&path==='/auth/v1/token'&&['password','refresh_token'].includes(url.searchParams.get('grant_type')||'');
  if(url.origin!==target.origin||url.username||url.password||!allowed)throw Error('STORY_SYNC_NETWORK_DENIED');
  return fetchImpl(input,{...init,redirect:'error'});
 };
 const supabase=createClient(target.origin,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:restrictedFetch}});
 const client=supabase as unknown as Client;
 const validKey=(key:string)=>{if(!key||key.length>180)throw Error('STORY_SYNC_KEY_INVALID');};
 const transport:StoryCheckpointTransport<S>={
  read:async(key,site)=>{
   validKey(key);const result=checked(await client.rpc('wetapp_story_checkpoint_read_lab',{target:key,site_name:site}));
   if(!result||typeof result!=='object')throw Error('STORY_SYNC_REMOTE_MISSING');
   return result as Awaited<ReturnType<StoryCheckpointTransport<S>['read']>>;
  },
  page:async(key,offset,limit)=>{
   validKey(key);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('STORY_SYNC_RANGE_INVALID');
   const data=checked(await client.from('wetapp_messages').select('message_id,position,role,speaker_id,content,created_at_ms').eq('conversation_key',key).order('position',{ascending:true}).range(offset,offset+limit-1));
   if(!Array.isArray(data))throw Error('STORY_SYNC_PAGE_INVALID');
   return data as StoryCheckpointRow[];
  },
  commit:async req=>{
   validKey(req.key);
   const result=checked(await client.rpc('wetapp_story_checkpoint_commit_lab',{target:req.key,site_name:req.site,expected_revision:req.head.revision,expected_digest:req.head.sha256,expected_count:req.head.count,append_rows:req.append,recall_user:req.recall,new_snapshot:req.snapshot,device:req.deviceId}));
   if(!Number.isSafeInteger(result)||Number(result)<1)throw Error('STORY_SYNC_REVISION_INVALID');
   return Number(result);
  }
 };
 return {transport,initialize:async(site:'worldline1'|'worldline2')=>{
  const key=checked(await client.rpc('wetapp_story_checkpoint_init_lab',{site_name:site}));
  if(key!=='aigf-sync-pilot-'+site)throw Error('STORY_SYNC_INIT_INVALID');
  return key as string;
 },signIn:async(email:string,password:string)=>{
  const result=await supabase.auth.signInWithPassword({email,password});
  if(result.error||!result.data.session)throw Error('STORY_SYNC_LOGIN_FAILED');
 }};
}
