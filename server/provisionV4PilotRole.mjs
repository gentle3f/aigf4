import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const pilot='hmrcvjxdmedrjjcjbtmd';
const role='aigf_v4_pilot_worker';
async function main(){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const url=new URL(input.trim()); input='';
 const direct=url.hostname==='db.'+pilot+'.supabase.co'&&decodeURIComponent(url.username)==='postgres';
 const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&decodeURIComponent(url.username)==='postgres.'+pilot;
 if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pooled)||url.port&&url.port!=='5432'||url.pathname!=='/postgres'||!url.password||url.hash)throw Error('PILOT_ADMIN_URL_REQUIRED');
 for(const key of url.searchParams.keys())if(key!=='sslmode')throw Error('PILOT_URL_OPTIONS_INVALID');
 url.search='';
 const db=new Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000});
 const password=randomBytes(36).toString('base64url');
 const worker=new URL(url.href);worker.username=pooled?role+'.'+pilot:role;worker.password=password;
 const client=await db.connect();
 try{
  await client.query('begin');
  const pre=await client.query("select to_regclass('aigf_worker.generation_outbox_v4') is not null as installed, exists(select 1 from pg_roles where rolname=$1) as exists",[role]);
  if(!pre.rows[0]?.installed||pre.rows[0]?.exists)throw Error('PILOT_ROLE_ALREADY_EXISTS_OR_V4_MISSING');
  // Password generated inside owner console; base64url alphabet contains no SQL quote.
  await client.query("create role "+role+" login password '"+password+"' nosuperuser nocreatedb nocreaterole noreplication nobypassrls");
  await client.query('grant aigf_generation_worker to '+role);
  await client.query('grant connect on database postgres to '+role);
  const r=await client.query("select pg_has_role($1,'aigf_generation_worker','USAGE') as role,has_table_privilege($1,'public.wetapp_messages','SELECT,INSERT,UPDATE,DELETE') as messages,has_table_privilege($1,'public.wetapp_state','SELECT,INSERT,UPDATE,DELETE') as state,has_table_privilege($1,'aigf_worker.generation_outbox_v4','SELECT,INSERT,UPDATE,DELETE') as outbox",[role]);
  const x=r.rows[0];if(!x.role||x.messages||x.state||x.outbox)throw Error('WORKER_ROLE_SCOPE_INVALID');
  // Write credential before commit. On a failed transaction the script stops;
  // credential cannot authenticate unless the role actually commits.
  writeFileSync('/etc/aigf-v4/database-url',worker.href+'\n',{mode:0o600,flag:'wx'});
  await client.query('commit');
  console.log('V4_PILOT_DB_ROLE_CREATED');
 }catch(e){await client.query('rollback').catch(()=>{});throw e;}
 finally{client.release();await db.end();}
}
main().catch(()=>{console.error('V4_DB_ROLE_PROVISION_FAILED (verify pilot URL, TLS, role and permissions)');process.exitCode=1;});
