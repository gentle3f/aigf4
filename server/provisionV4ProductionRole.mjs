import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {writeFileSync,unlinkSync} from 'node:fs';
const project='ebinyocojscfnxskybax';
const role='aigf_v4_production_worker';
async function main(){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const url=new URL(input.trim()); input='';
 const direct=url.hostname==='db.'+project+'.supabase.co'&&decodeURIComponent(url.username)==='postgres';
 const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&decodeURIComponent(url.username)==='postgres.'+project;
 if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pooled)||url.port&&url.port!=='5432'||url.pathname!=='/postgres'||!url.password||url.hash)throw Error('PRODUCTION_ADMIN_URL_REQUIRED');
 for(const key of url.searchParams.keys())if(key!=='sslmode')throw Error('PRODUCTION_URL_OPTIONS_INVALID');
 url.search='';
 const db=new Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000});
 const password=randomBytes(36).toString('base64url');
 const worker=new URL(url.href);worker.username=pooled?role+'.'+project:role;worker.password=password;
 const client=await db.connect();let credentialCreated=false,commitAttempted=false;
 try{
  await client.query('begin');
  const pre=await client.query("select to_regclass('aigf_worker.generation_outbox_v4') is not null and not has_function_privilege('authenticated','public.wetapp_accept_generation_v4(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb,jsonb)','EXECUTE') and has_table_privilege('authenticated','public.wetapp_messages','INSERT') as installed, exists(select 1 from pg_roles where rolname=$1) as exists",[role]);
  if(!pre.rows[0]?.installed||pre.rows[0]?.exists)throw Error('PRODUCTION_ROLE_ALREADY_EXISTS_OR_V4_MISSING');
  // Password generated inside owner console; base64url alphabet contains no SQL quote.
  await client.query("create role "+role+" login password '"+password+"' nosuperuser nocreatedb nocreaterole noreplication nobypassrls");
  await client.query('grant aigf_generation_worker to '+role);
  await client.query('grant connect on database postgres to '+role);
  const r=await client.query("select pg_has_role($1,'aigf_generation_worker','USAGE') as role,has_table_privilege($1,'public.wetapp_messages','SELECT,INSERT,UPDATE,DELETE') as messages,has_table_privilege($1,'public.wetapp_state','SELECT,INSERT,UPDATE,DELETE') as state,has_table_privilege($1,'aigf_worker.generation_outbox_v4','SELECT,INSERT,UPDATE,DELETE') as outbox",[role]);
  const x=r.rows[0];if(!x.role||x.messages||x.state||x.outbox)throw Error('WORKER_ROLE_SCOPE_INVALID');
  // Write credential before commit. On a failed transaction the script stops;
  // credential cannot authenticate unless the role actually commits.
  writeFileSync('/etc/aigf-v4-production/database-url',worker.href+'\n',{mode:0o600,flag:'wx'});
  credentialCreated=true;
  commitAttempted=true;await client.query('commit');
  console.log('V4_PRODUCTION_DB_ROLE_CREATED');
 }catch(e){await client.query('rollback').catch(()=>{});if(credentialCreated&&!commitAttempted){try{unlinkSync('/etc/aigf-v4-production/database-url');}catch{}}throw e;}
 finally{client.release();await db.end();}
}
main().catch(()=>{console.error('V4_DB_ROLE_PROVISION_FAILED (verify production URL, TLS, role and permissions)');process.exitCode=1;});
