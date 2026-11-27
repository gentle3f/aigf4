-- Retry the exact saved plan under a fresh queue attempt ID; stable chat marker,
-- admission receipt and reply ID never change. No automatic paid replay.
alter table aigf_worker.generation_outbox_v4
 add column if not exists queue_attempt_id uuid,
 add column if not exists retry_at timestamptz,
 add column if not exists retry_count integer not null default 0;
create unique index if not exists generation_outbox_attempt_v4 on aigf_worker.generation_outbox_v4(queue_attempt_id) where queue_attempt_id is not null;

create or replace function aigf_worker.claim_generation_v4()
returns table(job_id uuid,lease_id uuid,reply_id uuid,conversation_key text,user_message_id text,admission_revision bigint,plan jsonb,status text,state_payload jsonb,created_at timestamptz,finalizer_context jsonb)
language plpgsql security definer set search_path=''
as $$
begin
 return query
 with picked as (
  select o.user_id,o.job_id from aigf_worker.generation_outbox_v4 o
  where o.status in ('accepted','queued') and o.next_poll_at<=clock_timestamp()
  and (o.lease_until is null or o.lease_until<=clock_timestamp())
  order by o.next_poll_at,o.created_at limit 1 for update skip locked
 ), claimed as (
  update aigf_worker.generation_outbox_v4 o set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
  from picked p where o.user_id=p.user_id and o.job_id=p.job_id
  returning coalesce(o.queue_attempt_id,o.job_id) as job_id,o.lease_id,o.reply_id,o.conversation_key,o.user_message_id,o.admission_revision,o.plan,o.status,o.user_id,coalesce(o.retry_at,o.created_at) as created_at,o.finalizer_context
 )
 select c.job_id,c.lease_id,c.reply_id,c.conversation_key,c.user_message_id,c.admission_revision,c.plan,c.status,s.payload,c.created_at,c.finalizer_context from claimed c left join public.wetapp_state s on s.user_id=c.user_id and s.revision=c.admission_revision;
end$$;

create or replace function aigf_worker.release_generation_v4(p_job uuid,p_lease uuid,p_queued boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 update aigf_worker.generation_outbox_v4 o set
 status=case when p_queued then 'queued' else o.status end,
 lease_id=null,lease_until=null,next_poll_at=clock_timestamp()+interval '2 seconds'
 where coalesce(o.queue_attempt_id,o.job_id)=p_job and o.lease_id=p_lease and o.lease_until>clock_timestamp() and o.status in ('accepted','queued');
 return found;
end$$;

create or replace function aigf_worker.fail_generation_v4(p_job uuid,p_lease uuid,p_code text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if p_code is null or p_code not in ('CONTEXT_CHANGED','QUEUE_REJECTED','QUEUE_FAILED','QUEUE_INTERRUPTED','QUEUE_CANCELLED','QUEUE_RESULT_EXPIRED','INVALID_RESULT','UNSUPPORTED_FINALIZER') then
  raise exception using errcode='22023',message='INVALID_FAILURE_CODE';end if;
 update aigf_worker.generation_outbox_v4 o set status=case when p_code='CONTEXT_CHANGED' then 'conflict' else 'failed' end,failure_code=p_code,lease_id=null,lease_until=null
 where coalesce(o.queue_attempt_id,o.job_id)=p_job and o.lease_id=p_lease and o.lease_until>clock_timestamp() and o.status in ('accepted','queued');
 return found;
end$$;

-- Finalize a fully processed reply and state snapshot in one commit. This function
-- is a persistence primitive, not a replacement for character/worldline postprocessing.
create or replace function aigf_worker.finish_generation_v4(p_job uuid,p_lease uuid,p_content jsonb,p_payload jsonb)
returns table(status text,revision bigint) language plpgsql security definer set search_path=''
as $$
declare o aigf_worker.generation_outbox_v4%rowtype; rev bigint; tail_id text; tail_role text; tail_position int; created_ms bigint; fingerprint text; owner_id uuid;
begin
 if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'text') is distinct from 'string'
 or length(btrim(p_content->>'text'))=0 or pg_column_size(p_content)>2097152
 or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>8388608 then
  raise exception using errcode='22023',message='INVALID_FINAL_REPLY';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_content,p_payload)::text,'UTF8')),'hex');
 -- Match the admission lock order: state first, then outbox.
 select g.user_id into owner_id from aigf_worker.generation_outbox_v4 g where coalesce(g.queue_attempt_id,g.job_id)=p_job;
 if not found then return query select 'missing'::text,null::bigint;return;end if;
 select s.revision into rev from public.wetapp_state s where s.user_id=owner_id for update;
 select g.* into o from aigf_worker.generation_outbox_v4 g where coalesce(g.queue_attempt_id,g.job_id)=p_job for update;
 if o.status='done' then
  if o.result_sha256 is distinct from fingerprint then raise exception using errcode='22023',message='FINAL_RESULT_COLLISION';end if;
  return query select 'done'::text,o.result_revision;return;
 end if;
 if o.lease_id is distinct from p_lease or o.lease_until is null or o.lease_until<=clock_timestamp() or o.status not in ('accepted','queued') then
  return query select 'lease_lost'::text,null::bigint;return;
 end if;
 select m.message_id,m.role,m.position into tail_id,tail_role,tail_position from public.wetapp_messages m
 where m.user_id=o.user_id and m.conversation_key=o.conversation_key order by m.position desc limit 1;
 if rev is distinct from o.admission_revision or tail_id is distinct from o.user_message_id or tail_role is distinct from 'user'
 or exists(select 1 from public.wetapp_messages m where m.user_id=o.user_id and m.conversation_key=o.conversation_key and m.message_id=o.reply_id::text) then
  update aigf_worker.generation_outbox_v4 g set status='conflict',failure_code='CONTEXT_CHANGED',lease_id=null,lease_until=null where g.user_id=o.user_id and g.job_id=o.job_id;
  return query select 'conflict'::text,rev;return;
 end if;
 created_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms,source_device_id)
 values(o.user_id,o.conversation_key,o.reply_id::text,tail_position+1,'model',null,p_content,created_ms,'aigf-vps-v4');
 update public.wetapp_conversations c set message_count=(select count(*) from public.wetapp_messages m where m.user_id=o.user_id and m.conversation_key=o.conversation_key),last_message_at_ms=created_ms,source_device_id='aigf-vps-v4'
 where c.user_id=o.user_id and c.conversation_key=o.conversation_key;
 update public.wetapp_state s set payload=p_payload,revision=s.revision+1,source_device_id='aigf-vps-v4' where s.user_id=o.user_id returning s.revision into rev;
 update aigf_worker.generation_outbox_v4 g set status='done',result_revision=rev,result_sha256=fingerprint,lease_id=null,lease_until=null
 where g.user_id=o.user_id and g.job_id=o.job_id;
 return query select 'done'::text,rev;
end$$;

create or replace function aigf_worker.retry_generation_v4(p_job uuid,p_attempt uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); o aigf_worker.generation_outbox_v4%rowtype; rev bigint; tail_id text; tail_role text; tail_content jsonb;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then raise exception using errcode='42501',message='NOT_AUTHORIZED';end if;
 if p_job is null or p_attempt is null or p_attempt=p_job then raise exception using errcode='22023',message='INVALID_RETRY_ID';end if;
 select s.revision into rev from public.wetapp_state s where s.user_id=uid for update;
 select g.* into o from aigf_worker.generation_outbox_v4 g where g.user_id=uid and g.job_id=p_job for update;
 if not found then raise exception using errcode='22023',message='GENERATION_NOT_FOUND';end if;
 if o.queue_attempt_id=p_attempt or o.status in ('accepted','queued','done') then return o.status;end if;
 if o.status<>'failed' or o.failure_code not in ('QUEUE_FAILED','QUEUE_INTERRUPTED','QUEUE_RESULT_EXPIRED','INVALID_RESULT') then raise exception using errcode='22023',message='GENERATION_RETRY_NOT_AVAILABLE';end if;
 if rev is distinct from o.admission_revision then raise exception using errcode='22023',message='GENERATION_RETRY_CONTEXT_CHANGED';end if;
 select m.message_id,m.role,m.content into tail_id,tail_role,tail_content from public.wetapp_messages m where m.user_id=uid and m.conversation_key=o.conversation_key order by m.position desc limit 1;
 if tail_id is distinct from o.user_message_id or tail_role is distinct from 'user'
 or tail_content->'vpsServerGeneration'->>'jobId' is distinct from p_job::text
 or tail_content->'vpsServerGeneration'->>'replyId' is distinct from o.reply_id::text
 or tail_content->>'text' is distinct from o.finalizer_context->'single'->>'latestUserMessage'
 or exists(select 1 from public.wetapp_messages m where m.user_id=uid and m.conversation_key=o.conversation_key and m.message_id=o.reply_id::text)
 then raise exception using errcode='22023',message='GENERATION_RETRY_CONTEXT_CHANGED';end if;
 if exists(select 1 from aigf_worker.generation_outbox_v4 g where g.job_id=p_attempt or g.queue_attempt_id=p_attempt) then raise exception using errcode='22023',message='GENERATION_RETRY_ID_COLLISION';end if;
 update aigf_worker.generation_outbox_v4 g set queue_attempt_id=p_attempt,retry_at=clock_timestamp(),retry_count=retry_count+1,status='accepted',failure_code=null,lease_id=null,lease_until=null,next_poll_at=clock_timestamp()
 where g.user_id=uid and g.job_id=p_job;
 return 'accepted';
end$$;
revoke all on function aigf_worker.retry_generation_v4(uuid,uuid) from public,anon;
grant execute on function aigf_worker.retry_generation_v4(uuid,uuid) to authenticated;
create or replace function public.wetapp_retry_generation_v4(p_job uuid,p_attempt uuid)
returns text language sql security invoker set search_path=''
as $$select aigf_worker.retry_generation_v4($1,$2)$$;
revoke all on function public.wetapp_retry_generation_v4(uuid,uuid) from public,anon;
grant execute on function public.wetapp_retry_generation_v4(uuid,uuid) to authenticated;
