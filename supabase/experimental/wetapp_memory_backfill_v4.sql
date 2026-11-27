-- Bounded successor batches. Existing tasks are not replayed on migration.
-- At most three memory requests per successful chat-triggered chain.
alter table aigf_worker.persona_memory_outbox_v4 add column if not exists batch_depth integer not null default 0 check(batch_depth between 0 and 2);
alter table aigf_worker.group_memory_outbox_v4 add column if not exists batch_depth integer not null default 0 check(batch_depth between 0 and 2);

create or replace function aigf_worker.continue_persona_memory_v4()
returns trigger language plpgsql security definer set search_path=''
as $$
declare checkpoint bigint; total bigint;
begin
 if new.batch_depth>=2 or new.plan->'context'->>'checkpoint' is null then return new;end if;
 checkpoint:=(new.plan->'context'->>'checkpoint')::bigint;
 select count(*) into total from public.wetapp_messages m where m.user_id=new.user_id and m.conversation_key=new.persona_key and m.role='user';
 if total-checkpoint>=8 then
  insert into aigf_worker.persona_memory_outbox_v4(user_id,parent_job,persona_key,batch_depth)
  values(new.user_id,new.id,new.persona_key,new.batch_depth+1) on conflict do nothing;
 end if;
 return new;
end$$;
create or replace function aigf_worker.continue_group_memory_v4()
returns trigger language plpgsql security definer set search_path=''
as $$
declare checkpoint bigint; total bigint;
begin
 if new.batch_depth>=2 or new.plan->'context'->>'checkpoint' is null then return new;end if;
 checkpoint:=(new.plan->'context'->>'checkpoint')::bigint;
 select count(*) into total from public.wetapp_messages m where m.user_id=new.user_id and m.conversation_key=new.room_key and m.role='user';
 if total-checkpoint>=8 then
  insert into aigf_worker.group_memory_outbox_v4(user_id,parent_job,room_key,batch_depth)
  values(new.user_id,new.id,new.room_key,new.batch_depth+1) on conflict do nothing;
 end if;
 return new;
end$$;
revoke all on function aigf_worker.continue_persona_memory_v4(),aigf_worker.continue_group_memory_v4() from public,anon,authenticated,aigf_generation_worker;
drop trigger if exists continue_persona_memory_v4 on aigf_worker.persona_memory_outbox_v4;
create trigger continue_persona_memory_v4 after update of status on aigf_worker.persona_memory_outbox_v4 for each row
when(new.status='done' and old.status is distinct from 'done') execute function aigf_worker.continue_persona_memory_v4();
drop trigger if exists continue_group_memory_v4 on aigf_worker.group_memory_outbox_v4;
create trigger continue_group_memory_v4 after update of status on aigf_worker.group_memory_outbox_v4 for each row
when(new.status='done' and old.status is distinct from 'done') execute function aigf_worker.continue_group_memory_v4();
