-- AIGF no longer uses row-level Supabase Realtime for cloud sync.
-- Remove the large chat/state tables from the Realtime publication to prevent
-- same-device echo traffic and accidental future subscriptions from consuming egress.

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'wetapp_state',
        'wetapp_conversations',
        'wetapp_messages',
        'wetapp_media'
    ] loop
        if exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = table_name
        ) then
            execute format('alter publication supabase_realtime drop table public.%I', table_name);
        end if;
    end loop;
end;
$$;
