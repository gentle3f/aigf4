-- Prepared for production compatibility; NOT installed on the live database.
-- One transaction for conversation/message delta and state payload, using the existing schema.
-- Legacy direct writers must be retired before this is enabled. Media bytes are staged immutably; media manifest changes are transactional.
create or replace function public.wetapp_commit_chat_delta_v3(
 expected_revision bigint, new_payload jsonb, delta jsonb, device text
) returns bigint language plpgsql security invoker set search_path=''
as $$
declare
 uid uuid:=auth.uid(); rev bigint; touched text[];
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then raise exception using errcode='42501',message='NOT_AUTHORIZED'; end if;
 if expected_revision is null or expected_revision<1 or jsonb_typeof(new_payload) is distinct from 'object'
 or jsonb_typeof(delta) is distinct from 'object' or not (delta ?& array['conversations','messages','remove_messages','remove_conversations'])
 or (delta-array['conversations','messages','remove_messages','remove_conversations','media'])<>'{}'::jsonb
 or jsonb_typeof(delta->'conversations') is distinct from 'array' or jsonb_typeof(delta->'messages') is distinct from 'array'
 or jsonb_typeof(delta->'remove_messages') is distinct from 'array' or jsonb_typeof(delta->'remove_conversations') is distinct from 'array'
 or device is null or length(device) not between 1 and 256 or pg_column_size(delta)>33554432 or pg_column_size(new_payload)>8388608
 then raise exception using errcode='22023',message='INVALID_DELTA';end if;
 if delta ? 'media' and (jsonb_typeof(delta->'media') is distinct from 'object' or not ((delta->'media') ?& array['upsert','remove']) or ((delta->'media')-array['upsert','remove'])<>'{}'::jsonb or jsonb_typeof(delta->'media'->'upsert') is distinct from 'array' or jsonb_typeof(delta->'media'->'remove') is distinct from 'array') then raise exception using errcode='22023',message='INVALID_MEDIA_DELTA';end if;
 select revision into rev from public.wetapp_state where user_id=uid for update;
 if rev is distinct from expected_revision then raise exception using errcode='40001',message='WETAPP_STATE_REVISION_CONFLICT';end if;
 -- All row ownership is assigned by the authenticated session, never by client input.
 if exists(select 1 from jsonb_to_recordset(delta->'conversations') as c(conversation_key text,title text,kind text)
 where c.conversation_key is null or length(c.conversation_key) not between 1 and 256 or c.title is null or c.kind is null or c.kind not in ('persona','room','assistant','unknown'))
 or exists(select 1 from jsonb_to_recordset(delta->'messages') as m(conversation_key text,message_id text,position int,role text,content jsonb,created_at_ms bigint)
 where m.conversation_key is null or length(m.conversation_key) not between 1 and 256 or m.message_id is null or length(m.message_id) not between 1 and 256 or m.position is null or m.position<0 or m.role is null or m.role not in ('user','model','system') or jsonb_typeof(m.content) is distinct from 'object' or m.created_at_ms is null or m.created_at_ms<=0)
 or exists(select 1 from jsonb_to_recordset(delta->'remove_messages') as m(conversation_key text,message_id text) where m.conversation_key is null or m.message_id is null)
 or exists(select 1 from jsonb_array_elements(delta->'remove_conversations') v where jsonb_typeof(v) is distinct from 'string')
 then raise exception using errcode='22023',message='INVALID_DELTA_ROW';end if;
 select array_agg(distinct k) into touched from (
  select c.conversation_key k from jsonb_to_recordset(delta->'conversations') as c(conversation_key text)
  union select m.conversation_key from jsonb_to_recordset(delta->'messages') as m(conversation_key text)
  union select d.conversation_key from jsonb_to_recordset(delta->'remove_messages') as d(conversation_key text,message_id text)
 ) keys;
 if exists(select 1 from jsonb_array_elements_text(delta->'remove_conversations') as d(k) where d.k=any(touched))
 or exists(select 1 from jsonb_to_recordset(delta->'remove_messages') as d(conversation_key text,message_id text) join jsonb_to_recordset(delta->'messages') as m(conversation_key text,message_id text) using(conversation_key,message_id))
 then raise exception using errcode='22023',message='CONTRADICTORY_DELTA';end if;
 insert into public.wetapp_conversations(user_id,conversation_key,title,kind,source_device_id)
 select uid,c.conversation_key,c.title,c.kind,device from jsonb_to_recordset(delta->'conversations') as c(conversation_key text,title text,kind text)
 on conflict(user_id,conversation_key) do update set title=excluded.title,kind=excluded.kind,source_device_id=excluded.source_device_id;
 insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms,source_device_id)
 select uid,m.conversation_key,m.message_id,m.position,m.role,m.speaker_id,m.content,m.created_at_ms,device
 from jsonb_to_recordset(delta->'messages') as m(conversation_key text,message_id text,position int,role text,speaker_id text,content jsonb,created_at_ms bigint)
 on conflict(user_id,conversation_key,message_id) do update set position=excluded.position,role=excluded.role,speaker_id=excluded.speaker_id,content=excluded.content,created_at_ms=excluded.created_at_ms,source_device_id=excluded.source_device_id;
 delete from public.wetapp_messages m using jsonb_to_recordset(delta->'remove_messages') as d(conversation_key text,message_id text)
 where m.user_id=uid and m.conversation_key=d.conversation_key and m.message_id=d.message_id;
 delete from public.wetapp_conversations c where c.user_id=uid and c.conversation_key in(select jsonb_array_elements_text(delta->'remove_conversations'));
 if exists(select 1 from public.wetapp_messages where user_id=uid and conversation_key=any(touched) group by conversation_key having min(position)<>0 or max(position)<>count(*)-1 or count(distinct position)<>count(*))
 then raise exception using errcode='22023',message='NONCONTIGUOUS_HISTORY';end if;
 update public.wetapp_conversations c set message_count=(select count(*) from public.wetapp_messages m where m.user_id=uid and m.conversation_key=c.conversation_key),last_message_at_ms=(select max(created_at_ms) from public.wetapp_messages m where m.user_id=uid and m.conversation_key=c.conversation_key),source_device_id=device
 where c.user_id=uid and c.conversation_key=any(touched);
 if delta ? 'media' then
  if exists(select 1 from jsonb_to_recordset(delta->'media'->'upsert') as m(asset_id text,kind text,storage_path text,mime_type text,byte_size bigint,signature text,metadata jsonb,created_at_ms bigint)
   where m.asset_id is null or length(m.asset_id) not between 1 and 512 or m.kind is null or m.kind not in ('persona_avatar','room_avatar','character_photo','attachment')
    or m.storage_path is null or m.storage_path !~ ('^'||uid::text||'/atomic-v3/[a-f0-9]{64}/[a-f0-9]{64}$'
)
    or split_part(m.storage_path,'/',3)<>encode(sha256(convert_to(m.asset_id,'UTF8')),'hex')
    or m.mime_type is null or length(m.mime_type) not between 1 and 255 or m.byte_size is null or m.byte_size not between 1 and 52428800
    or m.signature is null or jsonb_typeof(m.metadata) is distinct from 'object' or m.created_at_ms is null or m.created_at_ms<=0
    or not exists(select 1 from storage.objects o where o.bucket_id='wetapp-private' and o.name=m.storage_path and o.metadata->>'size'=m.byte_size::text))
   or exists(select 1 from jsonb_array_elements(delta->'media'->'remove') d where jsonb_typeof(d) is distinct from 'string')
   or exists(select 1 from jsonb_to_recordset(delta->'media'->'upsert') as m(asset_id text) join jsonb_array_elements_text(delta->'media'->'remove') d(id) on m.asset_id=d.id)
  then raise exception using errcode='22023',message='INVALID_OR_UNSTAGED_MEDIA';end if;
  insert into public.wetapp_media(user_id,asset_id,conversation_key,kind,storage_path,mime_type,byte_size,signature,metadata,source_device_id,created_at_ms)
  select uid,m.asset_id,m.conversation_key,m.kind,m.storage_path,m.mime_type,m.byte_size,m.signature,m.metadata,device,m.created_at_ms
  from jsonb_to_recordset(delta->'media'->'upsert') as m(asset_id text,conversation_key text,kind text,storage_path text,mime_type text,byte_size bigint,signature text,metadata jsonb,created_at_ms bigint)
  on conflict(user_id,asset_id) do update set conversation_key=excluded.conversation_key,kind=excluded.kind,storage_path=excluded.storage_path,mime_type=excluded.mime_type,byte_size=excluded.byte_size,signature=excluded.signature,metadata=excluded.metadata,source_device_id=excluded.source_device_id,created_at_ms=excluded.created_at_ms;
  delete from public.wetapp_media m where m.user_id=uid and m.asset_id in(select jsonb_array_elements_text(delta->'media'->'remove'));
 end if;
 update public.wetapp_state set payload=new_payload,revision=revision+1,source_device_id=device where user_id=uid and revision=expected_revision returning revision into rev;
 if rev is null then raise exception using errcode='40001',message='WETAPP_STATE_REVISION_CONFLICT';end if;
 return rev;
end;
$$;
revoke all on function public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text) from public,anon;
grant execute on function public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text) to authenticated;

-- Durable acknowledgement: same operation ID + exact arguments is idempotent.
create table if not exists public.wetapp_chat_delta_receipts_v3(
 user_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 revision bigint not null,
 primary key(user_id,operation_id)
);
alter table public.wetapp_chat_delta_receipts_v3 enable row level security;
revoke all on public.wetapp_chat_delta_receipts_v3 from public,anon,authenticated;
grant select,insert on public.wetapp_chat_delta_receipts_v3 to authenticated;
create policy delta_receipts_read on public.wetapp_chat_delta_receipts_v3 for select to authenticated using(user_id=(select auth.uid()) and public.is_wetapp_owner());
create policy delta_receipts_insert on public.wetapp_chat_delta_receipts_v3 for insert to authenticated with check(user_id=(select auth.uid()) and public.is_wetapp_owner());
create or replace function public.wetapp_commit_chat_delta_receipted_v3(
 expected_revision bigint,new_payload jsonb,delta jsonb,device text,operation_id uuid
) returns bigint language plpgsql security invoker set search_path=''
as $$
declare uid uuid:=auth.uid(); rev bigint; prior text; fingerprint text;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true or operation_id is null then raise exception using errcode='42501',message='NOT_AUTHORIZED';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(expected_revision,new_payload,delta,device)::text,'UTF8')),'hex');
 perform 1 from public.wetapp_state where user_id=uid for update;
 select r.revision,r.request_sha256 into rev,prior from public.wetapp_chat_delta_receipts_v3 r where r.user_id=uid and r.operation_id=wetapp_commit_chat_delta_receipted_v3.operation_id;
 if found then
  if prior<>fingerprint then raise exception using errcode='22023',message='DELTA_OPERATION_COLLISION';end if;
  return rev;
 end if;
 rev:=public.wetapp_commit_chat_delta_v3(expected_revision,new_payload,delta,device);
 insert into public.wetapp_chat_delta_receipts_v3 values(uid,operation_id,fingerprint,rev);
 return rev;
end
$$;
revoke all on function public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.wetapp_commit_chat_delta_receipted_v3(bigint,jsonb,jsonb,text,uuid) to authenticated;
