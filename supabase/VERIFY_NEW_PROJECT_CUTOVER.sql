-- AIGF / Wetapp new Supabase cutover verification
-- Safe to run in the Supabase SQL Editor of the NEW project.
-- Returns counts/status only; it does not modify data.

select 'auth_users' as check_name, count(*)::bigint as value
from auth.users

union all
select 'wetapp_state_rows', count(*)::bigint
from public.wetapp_state

union all
select 'wetapp_conversations_rows', count(*)::bigint
from public.wetapp_conversations

union all
select 'wetapp_messages_rows', count(*)::bigint
from public.wetapp_messages

union all
select 'wetapp_media_rows', count(*)::bigint
from public.wetapp_media

union all
select 'wetapp_research_turns_rows', count(*)::bigint
from public.wetapp_research_turns

union all
select 'wetapp_private_storage_objects', count(*)::bigint
from storage.objects
where bucket_id = 'wetapp-private'

union all
select 'large_chat_tables_still_in_realtime',
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
order by check_name;
