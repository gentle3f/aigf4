-- At most three ledger batches per story-triggered chain; no historical replay on install.
alter table aigf_worker.world_ledger_outbox_v4 add column if not exists batch_depth integer not null default 0 check(batch_depth between 0 and 2);
create or replace function aigf_worker.continue_world_ledger_v4()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.batch_depth>=2 or new.outcome is distinct from 'saved' or
 jsonb_typeof(new.plan->'pendingCount') is distinct from 'number' or
 jsonb_typeof(new.plan->'allSources') is distinct from 'array' then return new;end if;
 if (new.plan->>'pendingCount')::numeric>jsonb_array_length(new.plan->'allSources') then
  insert into aigf_worker.world_ledger_outbox_v4(user_id,parent_job,conversation_key,model,batch_depth)
  values(new.user_id,new.id,new.conversation_key,new.model,new.batch_depth+1) on conflict do nothing;
 end if;
 return new;
end$$;
revoke all on function aigf_worker.continue_world_ledger_v4() from public,anon,authenticated,aigf_generation_worker;
drop trigger if exists continue_world_ledger_v4 on aigf_worker.world_ledger_outbox_v4;
create trigger continue_world_ledger_v4 after update of status on aigf_worker.world_ledger_outbox_v4 for each row
when(new.status='done' and old.status is distinct from 'done') execute function aigf_worker.continue_world_ledger_v4();
