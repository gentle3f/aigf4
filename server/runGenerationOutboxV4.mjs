import {readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {createLocalGenerationQueue,createPostgresOutboxStore,processOneGeneration} from './generationOutboxWorker.mjs';
import {finalizeAcceptedSingleJob} from '../serverTurnFinalizer.ts';

export function readWorkerConfig(env=process.env,read=readFileSync){
 const dir=env.CREDENTIALS_DIRECTORY;
 if(!dir)throw Error('V4_CREDENTIALS_DIRECTORY_REQUIRED');
 const file=name=>read(dir+'/'+name,'utf8').trim();
 const connectionString=file('database-url');
 const u=new URL(connectionString);
 // Enforce a dedicated login, a verified TLS connection, and the isolated pilot.
 if(!['postgres:','postgresql:'].includes(u.protocol)||decodeURIComponent(u.username).split('.')[0]!=='aigf_v4_pilot_worker'||!u.password||!u.hostname||u.hash||u.search)throw Error('V4_DATABASE_URL_INVALID');
 const direct=u.hostname==='db.hmrcvjxdmedrjjcjbtmd.supabase.co'&&decodeURIComponent(u.username)==='aigf_v4_pilot_worker';
 const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&decodeURIComponent(u.username)==='aigf_v4_pilot_worker.hmrcvjxdmedrjjcjbtmd';
 if(!direct&&!pooled)throw Error('V4_PILOT_DATABASE_REQUIRED');
 const token=file('queue-token');if(token.length<32)throw Error('V4_QUEUE_TOKEN_REQUIRED');
 return {connectionString,token};
}
export async function verifyWorkerDatabase(query){
 const r=await query(`select
  current_user as login,
  pg_has_role(current_user,'aigf_generation_worker','USAGE') as worker_role,
  has_table_privilege(current_user,'public.wetapp_messages','SELECT,INSERT,UPDATE,DELETE') as direct_messages,
  has_table_privilege(current_user,'public.wetapp_state','SELECT,INSERT,UPDATE,DELETE') as direct_state,
  has_table_privilege(current_user,'aigf_worker.generation_outbox_v4','SELECT,INSERT,UPDATE,DELETE') as direct_outbox,
  has_function_privilege(current_user,'aigf_worker.claim_generation_v4()','EXECUTE') as can_claim,
  (select rolsuper or rolbypassrls or rolcreaterole or rolcreatedb from pg_roles where rolname=current_user) as elevated`,[]);
 const row=r.rows[0];
 if(row?.login!=='aigf_v4_pilot_worker'||row.worker_role!==true||row.can_claim!==true||row.direct_messages!==false||row.direct_state!==false||row.direct_outbox!==false||row.elevated!==false)throw Error('V4_DATABASE_ROLE_CHECK_FAILED');
}
export async function runWorkerLoop({processOne,signal,once=false,pause=sleep,log=console.log}){
 let failures=0;
 while(!signal?.aborted){
  try{
   const status=await processOne();
   failures=0;
   if(status!=='idle')log('V4_WORKER '+status);
   if(once)return status;
   await pause(status==='idle'?1500:250,undefined,{signal});
  }catch(error){
   if(signal?.aborted)return 'stopped';
   if(once)throw error;
   failures++;
   // Never emit database errors: they may contain credentials or private messages.
   log('V4_WORKER transient_error');
   await pause(Math.min(30000,1000*2**Math.min(failures,5)),undefined,{signal}).catch(()=>{});
  }
 }
 return 'stopped';
}
async function main(){
 const cfg=readWorkerConfig();
 const db=new Pool({connectionString:cfg.connectionString,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:10000,query_timeout:15000,statement_timeout:15000});
 db.on('error',()=>console.error('V4_WORKER idle_connection_error'));
 const query=(sql,params)=>db.query(sql,params);
 const stop=new AbortController();
 process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort());
 try{
  await verifyWorkerDatabase(query);
  if(process.argv.includes('--check')){console.log('V4_WORKER_DB_ROLE_PASS');return;}
  const store=createPostgresOutboxStore(query),queue=createLocalGenerationQueue({token:cfg.token});
  console.log('V4_WORKER_READY');
  await runWorkerLoop({processOne:()=>processOneGeneration({store,queue,finalize:finalizeAcceptedSingleJob}),signal:stop.signal,once:process.argv.includes('--once')});
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('V4_WORKER_START_OR_RUN_FAILED');process.exitCode=1;});
