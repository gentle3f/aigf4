-- Experimental only; NOT installed on a live database.
-- Atomic admission: commit the user message and the complete, immutable generation plan
-- in the same database transaction. The existing VPS queue will consume this outbox.
create schema if not exists aigf_worker;
revoke all on schema aigf_worker from public,anon,authenticated;
grant usage on schema aigf_worker to authenticated;

create table if not exists aigf_worker.generation_outbox_v4(
 user_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null,
 reply_id uuid not null,
 conversation_key text not null,
 user_message_id text not null,
 admission_revision bigint not null,
 admission_sha256 text not null check(admission_sha256 ~ '^[a-f0-9]{64}$'),
 plan jsonb not null,
 status text not null default 'accepted' check(status in ('accepted','queued','done','failed','conflict')),
 created_at timestamptz not null default now(),
 primary key(user_id,job_id),
 unique(user_id,conversation_key,user_message_id),
 unique(user_id,reply_id),
 check(job_id<>reply_id)
);
alter table aigf_worker.generation_outbox_v4 enable row level security;
revoke all on aigf_worker.generation_outbox_v4 from public,anon,authenticated;
grant select,insert on aigf_worker.generation_outbox_v4 to authenticated;
create policy generation_outbox_read on aigf_worker.generation_outbox_v4 for select to authenticated
 using(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy generation_outbox_admit on aigf_worker.generation_outbox_v4 for insert to authenticated
 with check(user_id=(select auth.uid()) and public.is_wetapp_owner() and status='accepted');

create or replace function public.wetapp_accept_generation_v4(
 expected_revision bigint,new_payload jsonb,delta jsonb,device text,
 job_id uuid,reply_id uuid,conversation_key text,user_message_id text,plan jsonb
) returns bigint language plpgsql security invoker set search_path=''
as $$
declare
 uid uuid:=auth.uid(); prior aigf_worker.generation_outbox_v4%rowtype;
 fingerprint text; rev bigint; tail_id text; tail_role text;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then
  raise exception using errcode='42501',message='NOT_AUTHORIZED';
 end if;
 if job_id is null or reply_id is null or job_id=reply_id or conversation_key is null or length(conversation_key) not between 1 and 256
 or user_message_id is null or user_message_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or user_message_id in (job_id::text,reply_id::text)
 or jsonb_typeof(plan) is distinct from 'object' or pg_column_size(plan)>262144
 or coalesce(plan->>'workflow_version','') not in ('1','2','3')
 or jsonb_typeof(plan->'primary') is distinct from 'object' or jsonb_typeof(plan->'review') is distinct from 'object'
 then raise exception using errcode='22023',message='INVALID_GENERATION_ADMISSION';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(expected_revision,new_payload,delta,device,job_id,reply_id,conversation_key,user_message_id,plan)::text,'UTF8')),'hex');
 perform 1 from public.wetapp_state s where s.user_id=uid for update;
 select o.* into prior from aigf_worker.generation_outbox_v4 o where o.user_id=uid and o.job_id=wetapp_accept_generation_v4.job_id;
 if found then
  if prior.admission_sha256<>fingerprint then raise exception using errcode='22023',message='GENERATION_OPERATION_COLLISION';end if;
  return prior.admission_revision;
 end if;
 -- Admission is new only if the user message does not yet exist; legacy orphan
 -- messages are not silently replayed by this endpoint.
 if exists(select 1 from public.wetapp_messages m where m.user_id=uid and m.conversation_key=wetapp_accept_generation_v4.conversation_key
 and m.message_id in (wetapp_accept_generation_v4.user_message_id,reply_id::text))
 then raise exception using errcode='22023',message='GENERATION_MESSAGE_ALREADY_EXISTS';end if;
 if not exists(select 1 from jsonb_to_recordset(delta->'messages') as m(conversation_key text,message_id text,role text)
 where m.conversation_key=wetapp_accept_generation_v4.conversation_key and m.message_id=wetapp_accept_generation_v4.user_message_id and m.role='user')
 then raise exception using errcode='22023',message='GENERATION_USER_NOT_IN_DELTA';end if;
 rev:=public.wetapp_commit_chat_delta_receipted_v3(expected_revision,new_payload,delta,device,job_id);
 select m.message_id,m.role into tail_id,tail_role from public.wetapp_messages m
 where m.user_id=uid and m.conversation_key=wetapp_accept_generation_v4.conversation_key order by m.position desc limit 1;
 if tail_id is distinct from user_message_id or tail_role is distinct from 'user' then
  raise exception using errcode='22023',message='GENERATION_USER_NOT_TAIL';
 end if;
 insert into aigf_worker.generation_outbox_v4(user_id,job_id,reply_id,conversation_key,user_message_id,admission_revision,admission_sha256,plan)
 values(uid,job_id,reply_id,conversation_key,user_message_id,rev,fingerprint,plan);
 return rev;
end;
$$;
revoke all on function public.wetapp_accept_generation_v4(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.wetapp_accept_generation_v4(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb) to authenticated;
-- Worker SELECT/UPDATE grants and finalization are deliberately not installed here.
