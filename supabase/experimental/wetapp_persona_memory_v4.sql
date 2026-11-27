-- V4 follow-up work, isolated from the successful chat transaction.
-- Install only together with the memory-capable worker on the pilot.
create table if not exists aigf_worker.persona_memory_outbox_v4(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 parent_job uuid not null unique,
 persona_key text not null,
 status text not null default 'pending' check(status in ('pending','accepted','queued','done','skipped','failed','conflict')),
 plan jsonb,
 created_at timestamptz not null default clock_timestamp(),
 prepared_at timestamptz,
 next_poll_at timestamptz not null default clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 outcome text,
 result_revision bigint,
 check((status='pending' and plan is null) or status in ('skipped','failed','conflict') or plan is not null)
);
alter table aigf_worker.persona_memory_outbox_v4 enable row level security;
revoke all on aigf_worker.persona_memory_outbox_v4 from public,anon,authenticated,aigf_generation_worker;
create unique index if not exists persona_memory_active_v4 on aigf_worker.persona_memory_outbox_v4(user_id,persona_key) where status in ('pending','accepted','queued');
create index if not exists persona_memory_ready_v4 on aigf_worker.persona_memory_outbox_v4(next_poll_at,created_at) where status in ('pending','accepted','queued');

create or replace function aigf_worker.enqueue_persona_memory_v4()
returns trigger language plpgsql security definer set search_path=''
as $$
declare k text:=new.finalizer_context->'single'->>'personaKey';
begin
 if old.status is distinct from 'done' and new.status='done'
 and k=new.conversation_key and length(k) between 1 and 256
 and k not in ('venice_ai','aigf-sync-pilot-aigf','aigf-sync-pilot-worldline1','aigf-sync-pilot-worldline2')
 and coalesce(new.finalizer_context->>'worldActive','false')='false'
 and new.plan->>'workflow_version' in ('1','2') then
  insert into aigf_worker.persona_memory_outbox_v4(user_id,parent_job,persona_key)
  values(new.user_id,new.job_id,k) on conflict do nothing;
 end if;
 return new;
end$$;
revoke all on function aigf_worker.enqueue_persona_memory_v4() from public,anon,authenticated,aigf_generation_worker;
drop trigger if exists enqueue_persona_memory_v4 on aigf_worker.generation_outbox_v4;
create trigger enqueue_persona_memory_v4 after update of status on aigf_worker.generation_outbox_v4
for each row when (new.status='done' and old.status is distinct from 'done') execute function aigf_worker.enqueue_persona_memory_v4();

create or replace function aigf_worker.claim_persona_memory_v4()
returns table(id uuid,lease_id uuid,persona_key text,status text,plan jsonb,prepared_at timestamptz,revision bigint,persona jsonb,history jsonb,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
 return query
 with picked as (
  select m.id from aigf_worker.persona_memory_outbox_v4 m
  where m.status in ('pending','accepted','queued') and m.next_poll_at<=clock_timestamp()
  and (m.lease_until is null or m.lease_until<=clock_timestamp())
  order by m.next_poll_at,m.created_at limit 1 for update skip locked
 ), claimed as (
  update aigf_worker.persona_memory_outbox_v4 m set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
  from picked p where m.id=p.id returning m.*
 )
 select c.id,c.lease_id,c.persona_key,c.status,c.plan,c.prepared_at,s.revision,s.payload->'customPersonas'->c.persona_key,
  (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',x.message_id,'role',x.role,'content',x.content,'createdAt',x.created_at_ms,'speakerId',x.speaker_id)) order by x.position),'[]'::jsonb)
   from public.wetapp_messages x where x.user_id=c.user_id and x.conversation_key=c.persona_key),
  c.created_at
 from claimed c left join public.wetapp_state s on s.user_id=c.user_id;
end$$;

create or replace function aigf_worker.prepare_persona_memory_v4(p_id uuid,p_lease uuid,p_revision bigint,p_plan jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$
declare uid uuid; rev bigint;
begin
 if jsonb_typeof(p_plan) is distinct from 'object' or pg_column_size(p_plan)>524288 or jsonb_typeof(p_plan->'request') is distinct from 'object' or jsonb_typeof(p_plan->'context') is distinct from 'object' then
  raise exception using errcode='22023',message='INVALID_MEMORY_PLAN';end if;
 select m.user_id into uid from aigf_worker.persona_memory_outbox_v4 m where m.id=p_id;
 select s.revision into rev from public.wetapp_state s where s.user_id=uid for update;
 if rev is distinct from p_revision then return false;end if;
 update aigf_worker.persona_memory_outbox_v4 m set plan=p_plan,status='accepted',prepared_at=clock_timestamp(),next_poll_at=clock_timestamp(),lease_id=null,lease_until=null
 where m.id=p_id and m.lease_id=p_lease and m.lease_until>clock_timestamp() and m.status='pending' and p_plan->'context'->>'personaKey'=m.persona_key;
 return found;
end$$;
create or replace function aigf_worker.release_persona_memory_v4(p_id uuid,p_lease uuid,p_queued boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 update aigf_worker.persona_memory_outbox_v4 m set status=case when p_queued and m.status='accepted' then 'queued' else m.status end,
 lease_id=null,lease_until=null,next_poll_at=clock_timestamp()+interval '3 seconds'
 where m.id=p_id and m.lease_id=p_lease and m.lease_until>clock_timestamp() and m.status in ('pending','accepted','queued');
 return found;
end$$;
create or replace function aigf_worker.end_persona_memory_v4(p_id uuid,p_lease uuid,p_status text,p_outcome text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if p_status not in ('skipped','failed','conflict') or p_outcome is null or p_outcome !~ '^[a-zA-Z0-9_]{1,80}$' then raise exception using errcode='22023',message='INVALID_MEMORY_OUTCOME';end if;
 update aigf_worker.persona_memory_outbox_v4 m set status=p_status,outcome=p_outcome,lease_id=null,lease_until=null
 where m.id=p_id and m.lease_id=p_lease and m.lease_until>clock_timestamp() and m.status in ('pending','accepted','queued');
 return found;
end$$;
create or replace function aigf_worker.finish_persona_memory_v4(p_id uuid,p_lease uuid,p_revision bigint,p_persona jsonb)
returns text language plpgsql security definer set search_path=''
as $$
declare o aigf_worker.persona_memory_outbox_v4%rowtype; uid uuid; rev bigint; state_payload jsonb; current_persona jsonb; next_persona jsonb; memory_fields jsonb;
begin
 if jsonb_typeof(p_persona) is distinct from 'object' or jsonb_typeof(p_persona->'memories') is distinct from 'array' or p_persona->>'lastVpsMemoryJobId' is distinct from p_id::text or pg_column_size(p_persona)>2097152 then
  raise exception using errcode='22023',message='INVALID_MEMORY_RESULT';end if;
 select m.user_id into uid from aigf_worker.persona_memory_outbox_v4 m where m.id=p_id;
 if not found then return 'missing';end if;
 select s.revision,s.payload into rev,state_payload from public.wetapp_state s where s.user_id=uid for update;
 select m.* into o from aigf_worker.persona_memory_outbox_v4 m where m.id=p_id for update;
 if o.status='done' then return 'done';end if;
 if o.lease_id is distinct from p_lease or o.lease_until is null or o.lease_until<=clock_timestamp() or o.status not in ('accepted','queued') then return 'lease_lost';end if;
 -- Another transaction won the race after the worker read its snapshot.
 -- Re-claim and validate the same already-paid result against the new snapshot.
 if rev is distinct from p_revision or exists(select 1 from aigf_worker.generation_outbox_v4 g where g.user_id=uid and g.status in ('accepted','queued')) then
  update aigf_worker.persona_memory_outbox_v4 m set lease_id=null,lease_until=null,next_poll_at=clock_timestamp()+interval '3 seconds' where m.id=p_id;
  return 'waiting';
 end if;
 if p_persona->>'lastMemorySummaryUserMessageCount' is distinct from o.plan->'context'->>'checkpoint' or p_persona->>'memorySummaryVersion' is distinct from o.plan->'context'->>'summaryVersion' then
  raise exception using errcode='22023',message='INVALID_MEMORY_CHECKPOINT';end if;
 current_persona:=state_payload->'customPersonas'->o.persona_key;
 memory_fields:=jsonb_build_object('memories',p_persona->'memories','lastMemorySummaryUserMessageCount',p_persona->'lastMemorySummaryUserMessageCount','memorySummaryVersion',p_persona->'memorySummaryVersion','lastVpsMemoryJobId',p_persona->'lastVpsMemoryJobId');
 if jsonb_typeof(current_persona)='object' then
  next_persona:=current_persona||memory_fields;
 else
  -- The worker only supplies verified built-in defaults when no custom row exists.
  if left(o.persona_key,7)='custom_' then
   update aigf_worker.persona_memory_outbox_v4 m set status='conflict',outcome='persona_missing',lease_id=null,lease_until=null where m.id=p_id;
   return 'conflict';
  end if;
  next_persona:=p_persona;
 end if;
 update public.wetapp_state s set payload=jsonb_set(s.payload,'{customPersonas}',coalesce(s.payload->'customPersonas','{}'::jsonb)||jsonb_build_object(o.persona_key,next_persona),true),revision=s.revision+1,source_device_id='aigf-vps-memory-v4' where s.user_id=uid returning s.revision into rev;
 update aigf_worker.persona_memory_outbox_v4 m set status='done',outcome='saved',result_revision=rev,lease_id=null,lease_until=null where m.id=p_id;
 return 'done';
end$$;
revoke all on function aigf_worker.claim_persona_memory_v4(),aigf_worker.prepare_persona_memory_v4(uuid,uuid,bigint,jsonb),aigf_worker.release_persona_memory_v4(uuid,uuid,boolean),aigf_worker.end_persona_memory_v4(uuid,uuid,text,text),aigf_worker.finish_persona_memory_v4(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function aigf_worker.claim_persona_memory_v4(),aigf_worker.prepare_persona_memory_v4(uuid,uuid,bigint,jsonb),aigf_worker.release_persona_memory_v4(uuid,uuid,boolean),aigf_worker.end_persona_memory_v4(uuid,uuid,text,text),aigf_worker.finish_persona_memory_v4(uuid,uuid,bigint,jsonb) to aigf_generation_worker;
