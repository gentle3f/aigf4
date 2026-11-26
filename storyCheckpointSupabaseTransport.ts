import {createPilotConnection,type PilotConnectionConfig} from './pilotConnection.js';
import type {StoryCheckpointTransport,StoryCheckpointSnapshot,StoryCheckpointRow} from './storyCheckpointSession.js';
type Reply={data:unknown;error:{code?:string}|null};
type Query={eq:(column:string,value:string)=>Query;order:(column:string,opts:{ascending:boolean})=>Query;range:(from:number,to:number)=>PromiseLike<Reply>};
type Client={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Reply>;from:(table:string)=>{select:(fields:string)=>Query}};
const checked=(r:Reply)=>{if(r.error)throw Error('STORY_SYNC_HTTP_'+(r.error.code||'FAILED'));return r.data;};
// Explicit isolated project only. Never fall back to the application's production URL.
export function createStoryCheckpointSupabaseTransport<S extends StoryCheckpointSnapshot>(config:PilotConnectionConfig,fetchImpl:typeof fetch=fetch,shared?:ReturnType<typeof createPilotConnection>){
 const connection=shared??createPilotConnection(config,fetchImpl);
 const supabase=connection.supabase;
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
 return {transport,getMedia:connection.getMedia,initialize:async(site:'worldline1'|'worldline2'|'aigf')=>{
  const key=checked(await client.rpc('wetapp_story_checkpoint_init_lab',{site_name:site}));
  if(key!=='aigf-sync-pilot-'+site)throw Error('STORY_SYNC_INIT_INVALID');
  return key as string;
 },signIn:connection.signIn};
}
