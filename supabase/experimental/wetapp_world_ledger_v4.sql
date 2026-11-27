-- Isolated world-ledger follow-up jobs; chat commits never wait for extraction.
create table if not exists aigf_worker.world_ledger_outbox_v4(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 parent_job uuid not null unique,
 conversation_key text not null,
 model text not null,
 attempt_id uuid not null unique default gen_random_uuid(),
 status text not null default 'pending' check(status in ('pending','accepted','queued','done','skipped','failed','conflict')),
 plan jsonb,
 created_at timestamptz not null default clock_timestamp(),
 prepared_at timestamptz,
 next_poll_at timestamptz not null default clock_timestamp(),
 lease_id uuid,lease_until timestamptz,outcome text,result_revision bigint,
 check((status='pending' and plan is null) or status in ('skipped','failed','conflict') or plan is not null)
);
alter table aigf_worker.world_ledger_outbox_v4 enable row level security;
revoke all on aigf_worker.world_ledger_outbox_v4 from public,anon,authenticated,aigf_generation_worker;
create unique index if not exists world_ledger_active_v4 on aigf_worker.world_ledger_outbox_v4(user_id,conversation_key) where status in ('pending','accepted','queued');
create index if not exists world_ledger_ready_v4 on aigf_worker.world_ledger_outbox_v4(next_poll_at,created_at) where status in ('pending','accepted','queued');
create or replace function aigf_worker.enqueue_world_ledger_v4()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.status is distinct from 'done' and new.status='done'
 and new.finalizer_context->>'worldActive'='true'
 and length(new.conversation_key) between 1 and 180
 and new.plan->>'workflow_version' in ('1','2')
 and new.plan->'primary'->>'model' in ('glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus') then
  insert into aigf_worker.world_ledger_outbox_v4(user_id,parent_job,conversation_key,model)
  values(new.user_id,new.job_id,new.conversation_key,new.plan->'primary'->>'model') on conflict do nothing;
 end if;
 return new;
end$$;
revoke all on function aigf_worker.enqueue_world_ledger_v4() from public,anon,authenticated,aigf_generation_worker;
drop trigger if exists enqueue_world_ledger_v4 on aigf_worker.generation_outbox_v4;
create trigger enqueue_world_ledger_v4 after update of status on aigf_worker.generation_outbox_v4
for each row when (new.status='done' and old.status is distinct from 'done') execute function aigf_worker.enqueue_world_ledger_v4();

create or replace function aigf_worker.claim_world_ledger_v4()
returns table(id uuid,lease_id uuid,attempt_id uuid,conversation_key text,model text,status text,plan jsonb,prepared_at timestamptz,revision bigint,registry text,ledger text,history jsonb)
language plpgsql security definer set search_path=''
as $$
begin
 return query
 with picked as (
  select m.id from aigf_worker.world_ledger_outbox_v4 m
  where m.status in ('pending','accepted','queued') and m.next_poll_at<=clock_timestamp()
  and (m.lease_until is null or m.lease_until<=clock_timestamp())
  and not exists(select 1 from aigf_worker.generation_outbox_v4 g where g.user_id=m.user_id and g.status in ('accepted','queued'))
  order by m.next_poll_at,m.created_at limit 1 for update skip locked
 ), claimed as (
  update aigf_worker.world_ledger_outbox_v4 m set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
  from picked p where m.id=p.id returning m.*
 )
 select c.id,c.lease_id,c.attempt_id,c.conversation_key,c.model,c.status,c.plan,c.prepared_at,s.revision,
  s.payload->'appSettings'->>'aigf4WorldlineRegistryV1',s.payload->'appSettings'->>'aigf4WorldLedgerV2',
  (select coalesce(jsonb_agg(jsonb_build_object('id',x.message_id,'role',x.role,'content',jsonb_build_object('text',x.content->>'text')) order by x.position),'[]'::jsonb)
   from public.wetapp_messages x where x.user_id=c.user_id and x.conversation_key=c.conversation_key)
 from claimed c left join public.wetapp_state s on s.user_id=c.user_id;
end$$;

-- Save each immutable request before submitting. New queue IDs are allowed only for
-- bounded adaptive extraction attempts, never a transport retry.
create or replace function aigf_worker.prepare_world_ledger_v4(p_id uuid,p_lease uuid,p_revision bigint,p_plan jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$
declare uid uuid; rev bigint;
begin
 if jsonb_typeof(p_plan) is distinct from 'object' or pg_column_size(p_plan)>1048576
 or p_plan->>'version' is distinct from '1' or jsonb_typeof(p_plan->'request') is distinct from 'object'
 or p_plan->>'attempt' not in ('1','2','3','4') then raise exception using errcode='22023',message='INVALID_LEDGER_PLAN';end if;
 select m.user_id into uid from aigf_worker.world_ledger_outbox_v4 m where m.id=p_id;
 select s.revision into rev from public.wetapp_state s where s.user_id=uid for update;
 if rev is distinct from p_revision or exists(select 1 from aigf_worker.generation_outbox_v4 g where g.user_id=uid and g.status in ('accepted','queued')) then return false;end if;
 update aigf_worker.world_ledger_outbox_v4 m set plan=p_plan,status='accepted',
 attempt_id=case when m.status='pending' then m.attempt_id else gen_random_uuid() end,
 prepared_at=clock_timestamp(),next_poll_at=clock_timestamp(),lease_id=null,lease_until=null
 where m.id=p_id and m.lease_id=p_lease and m.lease_until>clock_timestamp()
 and p_plan->>'model'=m.model
 and ((m.status='pending' and p_plan->>'attempt'='1') or
 (m.status in ('accepted','queued') and (p_plan->>'attempt')::int=(m.plan->>'attempt')::int+1));
 return found;
end$$;
create or replace function aigf_worker.release_world_ledger_v4(p_id uuid,p_lease uuid,p_queued boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 update aigf_worker.world_ledger_outbox_v4 m set status=case when p_queued and m.status='accepted' then 'queued' else m.status end,
 lease_id=null,lease_until=null,next_poll_at=clock_timestamp()+interval '3 seconds'
 where m.id=p_id and m.lease_id=p_lease and m.lease_until>clock_timestamp() and m.status in ('pending','accepted','queued');
 return found;
end$$;
create or replace function aigf_worker.end_world_ledger_v4(p_id uuid,p_lease uuid,p_status text,p_outcome text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if p_status not in ('skipped','failed','conflict') or p_outcome is null or p_outcome !~ '^[a-zA-Z0-9_]{1,80}$' then raise exception using errcode='22023',message='INVALID_LEDGER_OUTCOME';end if;
 update aigf_worker.world_ledger_outbox_v4 m set status=p_status,outcome=p_outcome,lease_id=null,lease_until=null
 where m.id=p_id and m.lease_id=p_lease and m.lease_until>clock_timestamp() and m.status in ('pending','accepted','queued');
 return found;
end$$;
create or replace function aigf_worker.finish_world_ledger_v4(p_id uuid,p_lease uuid,p_revision bigint,p_ledger text,p_deferred boolean)
returns text language plpgsql security definer set search_path=''
as $$
declare o aigf_worker.world_ledger_outbox_v4%rowtype; uid uuid; rev bigint; state_payload jsonb; candidate jsonb; previous jsonb; merged jsonb;
begin
 candidate:=p_ledger::jsonb;
 if jsonb_typeof(candidate) is distinct from 'object' or candidate->>'schema' is distinct from 'aigf-world-ledger-v2'
 or jsonb_typeof(candidate->'worlds') is distinct from 'object' or octet_length(p_ledger)>4194304 then
  raise exception using errcode='22023',message='INVALID_LEDGER_RESULT';end if;
 select m.user_id into uid from aigf_worker.world_ledger_outbox_v4 m where m.id=p_id;
 if not found then return 'missing';end if;
 select s.revision,s.payload into rev,state_payload from public.wetapp_state s where s.user_id=uid for update;
 select m.* into o from aigf_worker.world_ledger_outbox_v4 m where m.id=p_id for update;
 if o.status='done' then return 'done';end if;
 if o.lease_id is distinct from p_lease or o.lease_until is null or o.lease_until<=clock_timestamp() or o.status not in ('accepted','queued') then return 'lease_lost';end if;
 if rev is distinct from p_revision or exists(select 1 from aigf_worker.generation_outbox_v4 g where g.user_id=uid and g.status in ('accepted','queued')) then
  update aigf_worker.world_ledger_outbox_v4 m set lease_id=null,lease_until=null,next_poll_at=clock_timestamp()+interval '3 seconds' where m.id=p_id;
  return 'waiting';
 end if;
 if jsonb_typeof(candidate->'worlds'->o.conversation_key) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_LEDGER_WORLD';end if;
 begin previous:=(state_payload->'appSettings'->>'aigf4WorldLedgerV2')::jsonb;
 exception when invalid_text_representation then previous:=null;end;
 if previous is null then previous:=jsonb_build_object('schema','aigf-world-ledger-v2','worlds','{}'::jsonb);end if;
 if previous->>'schema' is distinct from 'aigf-world-ledger-v2' or jsonb_typeof(previous->'worlds') is distinct from 'object' then
  update aigf_worker.world_ledger_outbox_v4 m set status='conflict',outcome='LEDGER_SCHEMA_CHANGED',lease_id=null,lease_until=null where m.id=p_id;
  return 'conflict';
 end if;
 -- Only replace this world's validated ledger. Preserve other worlds byte-for-value.
 merged:=jsonb_set(previous,array['worlds',o.conversation_key],candidate->'worlds'->o.conversation_key,true);
 update public.wetapp_state s set payload=jsonb_set(s.payload,'{appSettings}',coalesce(s.payload->'appSettings','{}'::jsonb)||jsonb_build_object('aigf4WorldLedgerV2',merged::text),true),revision=s.revision+1,source_device_id='aigf-vps-ledger-v4' where s.user_id=uid returning s.revision into rev;
 update aigf_worker.world_ledger_outbox_v4 m set status='done',outcome=case when p_deferred then 'partial' else 'saved' end,result_revision=rev,lease_id=null,lease_until=null where m.id=p_id;
 return 'done';
end$$;
revoke all on function aigf_worker.claim_world_ledger_v4(),aigf_worker.prepare_world_ledger_v4(uuid,uuid,bigint,jsonb),aigf_worker.release_world_ledger_v4(uuid,uuid,boolean),aigf_worker.end_world_ledger_v4(uuid,uuid,text,text),aigf_worker.finish_world_ledger_v4(uuid,uuid,bigint,text,boolean) from public,anon,authenticated;
grant execute on function aigf_worker.claim_world_ledger_v4(),aigf_worker.prepare_world_ledger_v4(uuid,uuid,bigint,jsonb),aigf_worker.release_world_ledger_v4(uuid,uuid,boolean),aigf_worker.end_world_ledger_v4(uuid,uuid,text,text),aigf_worker.finish_world_ledger_v4(uuid,uuid,bigint,text,boolean) to aigf_generation_worker;
