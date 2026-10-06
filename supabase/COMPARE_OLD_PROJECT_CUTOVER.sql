-- AIGF / Wetapp OLD Supabase comparison audit
-- Run this in the OLD Supabase project SQL Editor.
-- Non-destructive: reads counts only. Missing optional tables return NULL instead of failing.

create temporary table if not exists wetapp_cutover_audit (
  check_name text primary key,
  value bigint
) on commit drop;

truncate table wetapp_cutover_audit;

insert into wetapp_cutover_audit values
  ('auth_users', (select count(*)::bigint from auth.users));

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'wetapp_state',
    'wetapp_conversations',
    'wetapp_messages',
    'wetapp_media',
    'wetapp_research_turns'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*)::bigint from public.%I', t) into n;
      insert into wetapp_cutover_audit(check_name, value)
      values (t || '_rows', n)
      on conflict (check_name) do update set value = excluded.value;
    else
      insert into wetapp_cutover_audit(check_name, value)
      values (t || '_rows', null)
      on conflict (check_name) do update set value = excluded.value;
    end if;
  end loop;
end $$;

insert into wetapp_cutover_audit
select
  'wetapp_private_storage_objects',
  count(*)::bigint
from storage.objects
where bucket_id = 'wetapp-private'
on conflict (check_name) do update set value = excluded.value;

insert into wetapp_cutover_audit
select
  'large_chat_tables_still_in_realtime',
  count(*)::bigint
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'wetapp_state',
    'wetapp_conversations',
    'wetapp_messages',
    'wetapp_media'
  )
on conflict (check_name) do update set value = excluded.value;

select check_name, value
from wetapp_cutover_audit
order by check_name;
