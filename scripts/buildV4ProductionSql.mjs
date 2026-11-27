// Build two explicitly separate production transactions. Staging never enables
// new client writes, never revokes old writers, and never copies business rows.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='supabase/experimental/';
export const ordered=['wetapp_commit_chat_delta_v3.sql','wetapp_generation_outbox_v4.sql','wetapp_generation_worker_v4.sql','wetapp_generation_retry_v4.sql','wetapp_generation_director_preservation_v4.sql','wetapp_persona_memory_v4.sql','wetapp_world_ledger_v4.sql','wetapp_group_generation_v4.sql','wetapp_group_memory_v4.sql','wetapp_generation_context_guard_v4.sql','wetapp_memory_backfill_v4.sql','wetapp_world_ledger_backfill_v4.sql','wetapp_assistant_generation_v4.sql','wetapp_assistant_extended_v4.sql','wetapp_studio_media_recovery_v4.sql'];
const mutations=['public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text)','public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid)','aigf_worker.accept_generation_v4(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb,jsonb)','public.wetapp_accept_generation_v4(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb,jsonb)','aigf_worker.retry_generation_v4(uuid,uuid)','public.wetapp_retry_generation_v4(uuid,uuid)','public.wetapp_register_studio_media_v4(uuid,text,jsonb)','public.wetapp_confirm_studio_media_transfer_v4(uuid)'];
const permit=mutations.slice(1);
const revoke=mutations.map(f=>'revoke all on function '+f+' from public,anon,authenticated;').join('\n');
const restore=permit.map(f=>'grant execute on function '+f+' to authenticated;').join('\n');
const checkStage=`do $$begin
 if to_regclass('public.wetapp_chat_delta_receipts_v3') is not null or to_regclass('aigf_worker.generation_outbox_v4') is not null or exists(select 1 from pg_roles where rolname='wetapp_atomic_writer_v3') then raise exception 'V4_STAGE_ALREADY_EXISTS';end if;
 if (select count(*) from public.wetapp_state)<>1 or not has_table_privilege('authenticated','public.wetapp_messages','INSERT') then raise exception 'V4_STAGE_SOURCE_NOT_READY';end if;
end$$;`;
const assertStage=`do $$begin
 if not has_table_privilege('authenticated','public.wetapp_messages','INSERT') or has_function_privilege('authenticated','public.wetapp_accept_generation_v4(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid)','EXECUTE') or has_function_privilege('authenticated','public.wetapp_register_studio_media_v4(uuid,text,jsonb)','EXECUTE') then raise exception 'V4_STAGE_WRITE_GATE_INVALID';end if;
 if (select count(*) from aigf_worker.generation_outbox_v4)<>0 then raise exception 'V4_STAGE_UNEXPECTED_JOBS';end if;
end$$;`;
const stage='begin;\nset local lock_timeout=\'5s\';\n'+checkStage+'\n'+ordered.map(f=>'\n-- '+f+'\n'+readFileSync(dir+f,'utf8')).join('\n')+'\n'+revoke+'\nrevoke insert on public.wetapp_chat_delta_receipts_v3 from authenticated;\n'+assertStage+'\ncommit;\n';
const fence=readFileSync(dir+'wetapp_atomic_cutover_fence_v3.sql','utf8').replace(/^begin;$/m,"begin;\nset local lock_timeout='5s';").replace(/^commit;$/m,()=>restore+"\ncommit;");
mkdirSync('tmp/v4-production',{recursive:true});
for(const [name,content] of [['STAGE_V4_PRODUCTION.sql',stage],['ACTIVATE_V4_PRODUCTION.sql',fence]]){
 writeFileSync('tmp/v4-production/'+name,content);console.log(name+' bytes='+Buffer.byteLength(content)+' sha256='+createHash('sha256').update(content).digest('hex'));
}
