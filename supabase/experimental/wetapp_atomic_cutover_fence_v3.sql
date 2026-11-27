-- Cutover only: install receipted_v3 and quiesce old clients/storage requests FIRST.
-- Execute as database owner in a single transaction. Never run as part of preview build.
begin;
-- Fail before changing anything when the executing role cannot administer
-- storage.objects. A managed Supabase postgres role is not always its owner.
do $preflight$
declare storage_owner oid;
begin
 select c.relowner into storage_owner from pg_class c where c.oid='storage.objects'::regclass;
 if not (select rolsuper from pg_roles where rolname=current_user)
    and not pg_has_role(current_user,storage_owner,'USAGE') then
  raise exception 'ATOMIC_STORAGE_POLICY_OWNER_REQUIRED';
 end if;
end
$preflight$;
lock table public.wetapp_state,public.wetapp_conversations,public.wetapp_messages,public.wetapp_media,public.wetapp_chat_delta_receipts_v3 in access exclusive mode;
create role wetapp_atomic_writer_v3 nologin noinherit nobypassrls nosuperuser nocreatedb nocreaterole;
-- PG16+ role ownership transfer requires SET membership, not merely ADMIN OPTION.
grant wetapp_atomic_writer_v3 to current_user with set true;
grant usage on schema public,auth,storage to wetapp_atomic_writer_v3;
grant execute on function auth.uid(),public.is_wetapp_owner() to wetapp_atomic_writer_v3;
grant select,insert,update,delete on public.wetapp_state,public.wetapp_conversations,public.wetapp_messages,public.wetapp_media to wetapp_atomic_writer_v3;
grant select,insert on public.wetapp_chat_delta_receipts_v3 to wetapp_atomic_writer_v3;
grant select on storage.objects to wetapp_atomic_writer_v3;
create policy atomic_writer_state on public.wetapp_state for all to wetapp_atomic_writer_v3 using(user_id=(select auth.uid()) and public.is_wetapp_owner()) with check(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy atomic_writer_conversations on public.wetapp_conversations for all to wetapp_atomic_writer_v3 using(user_id=(select auth.uid()) and public.is_wetapp_owner()) with check(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy atomic_writer_messages on public.wetapp_messages for all to wetapp_atomic_writer_v3 using(user_id=(select auth.uid()) and public.is_wetapp_owner()) with check(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy atomic_writer_media on public.wetapp_media for all to wetapp_atomic_writer_v3 using(user_id=(select auth.uid()) and public.is_wetapp_owner()) with check(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy atomic_writer_receipts on public.wetapp_chat_delta_receipts_v3 for all to wetapp_atomic_writer_v3 using(user_id=(select auth.uid()) and public.is_wetapp_owner()) with check(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy atomic_writer_storage_read on storage.objects for select to wetapp_atomic_writer_v3 using(bucket_id='wetapp-private' and split_part(name,'/',1)=(select auth.uid())::text and public.is_wetapp_owner());
-- The wrapper alone is exposed; its restricted owner remains subject to RLS.
grant create on schema public to wetapp_atomic_writer_v3;
alter function public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text) owner to wetapp_atomic_writer_v3;
alter function public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid) owner to wetapp_atomic_writer_v3;
alter function public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid) security definer;
revoke create on schema public from wetapp_atomic_writer_v3;
revoke all on function public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text) to wetapp_atomic_writer_v3;
revoke all on function public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid) to authenticated;
-- Keep old browser reads, shadow backup and research tables unchanged.
revoke insert,update,delete,truncate,references,trigger on public.wetapp_state,public.wetapp_conversations,public.wetapp_messages,public.wetapp_media,public.wetapp_chat_delta_receipts_v3 from public,anon,authenticated;
grant select on public.wetapp_state,public.wetapp_conversations,public.wetapp_messages,public.wetapp_media,public.wetapp_chat_delta_receipts_v3 to authenticated;
revoke execute on function public.wetapp_save_state(jsonb,text),public.wetapp_save_state_if_revision(jsonb,text,bigint) from public,anon,authenticated;
-- Restrictive policies AND existing ownership policies. Only immutable staged uploads.
create policy atomic_storage_insert_fence on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'wetapp-private' or name ~ ('^'||(select auth.uid())::text||'/atomic-v3/[a-f0-9]{64}/[a-f0-9]{64}$'));
create policy atomic_storage_update_fence on storage.objects as restrictive for update to authenticated using(bucket_id<>'wetapp-private') with check(bucket_id<>'wetapp-private');
create policy atomic_storage_delete_fence on storage.objects as restrictive for delete to authenticated using(bucket_id<>'wetapp-private');
do $verify$
begin
 if pg_has_role('authenticated','wetapp_atomic_writer_v3','MEMBER') or pg_has_role('anon','wetapp_atomic_writer_v3','MEMBER') then raise exception 'ATOMIC_WRITER_ROLE_EXPOSED';end if;
 if exists(select 1 from unnest(array['wetapp_state','wetapp_conversations','wetapp_messages','wetapp_media','wetapp_chat_delta_receipts_v3']) t(n) where has_table_privilege('authenticated','public.'||t.n,'INSERT,UPDATE,DELETE,TRUNCATE')) then raise exception 'LEGACY_WRITE_GRANT_REMAINS';end if;
 if has_function_privilege('authenticated','public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text)','EXECUTE') or has_function_privilege('anon','public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid)','EXECUTE') then raise exception 'ATOMIC_RPC_GRANT_INVALID';end if;
end
$verify$;
commit;
