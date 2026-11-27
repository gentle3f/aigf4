-- Private media recovery staging for already submitted jobs, no generation RPC.
-- Temporary byte archive is separate from chat state; no public bucket.
create table if not exists aigf_worker.studio_media_recovery_v4(
 job_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('image','video')),receipt jsonb not null,
 status text not null default 'pending' check(status in ('pending','archived','failed','transferred')),
 created_at timestamptz not null default clock_timestamp(),next_poll_at timestamptz not null default clock_timestamp(),
 lease_id uuid,lease_until timestamptz,error_code text,
 mime text,sha256 text,bytes bytea,
 check(jsonb_typeof(receipt)='object' and pg_column_size(receipt)<=65536),
 check((status='archived' and mime is not null and sha256 ~ '^[a-f0-9]{64}$' and octet_length(bytes) between 512 and 8388608) or (status<>'archived' and mime is null and sha256 is null and bytes is null))
);
alter table aigf_worker.studio_media_recovery_v4 enable row level security;
revoke all on aigf_worker.studio_media_recovery_v4 from public,anon,authenticated,aigf_generation_worker;
create unique index if not exists studio_media_pending_v4 on aigf_worker.studio_media_recovery_v4(user_id,kind) where status='pending';
create index if not exists studio_media_ready_v4 on aigf_worker.studio_media_recovery_v4(next_poll_at) where status='pending';

create or replace function public.wetapp_register_studio_media_v4(p_job uuid,p_kind text,p_receipt jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); prior aigf_worker.studio_media_recovery_v4%rowtype;
begin
 if uid is null or not public.is_wetapp_owner() then raise exception using errcode='42501',message='OWNER_REQUIRED';end if;
 if p_job is null or p_kind not in ('image','video') or jsonb_typeof(p_receipt) is distinct from 'object' or pg_column_size(p_receipt)>65536
 or p_receipt->>'version' is distinct from '1' or length(coalesce(p_receipt->>'prompt','')) not between 1 and 10000
 or (p_kind='image' and p_receipt->>'jobId' is distinct from p_job::text)
 or (p_kind='video' and (p_receipt->>'submissionId' is distinct from p_job::text or p_receipt->>'queueId' is distinct from p_job::text or p_receipt->>'autonomous' is distinct from 'true'))
 then raise exception using errcode='22023',message='MEDIA_RECEIPT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,81724));
 select * into prior from aigf_worker.studio_media_recovery_v4 where job_id=p_job;
 if found then
  if prior.user_id is distinct from uid or prior.kind is distinct from p_kind or prior.receipt is distinct from p_receipt then raise exception using errcode='22023',message='MEDIA_RECEIPT_COLLISION';end if;
  return prior.status;
 end if;
 if (select count(*) from aigf_worker.studio_media_recovery_v4 where user_id=uid and status in ('pending','archived'))>=16 then raise exception using errcode='22023',message='MEDIA_RECOVERY_LIMIT';end if;
 insert into aigf_worker.studio_media_recovery_v4(job_id,user_id,kind,receipt) values(p_job,uid,p_kind,p_receipt);
 return 'pending';
end$$;

create or replace function public.wetapp_list_studio_media_v4()
returns table(job_id uuid,kind text,receipt jsonb,status text,error_code text,mime text,sha256 text,byte_size int)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_wetapp_owner() then raise exception using errcode='42501',message='OWNER_REQUIRED';end if;
 return query select m.job_id,m.kind,m.receipt,m.status,m.error_code,m.mime,m.sha256,octet_length(m.bytes)
 from aigf_worker.studio_media_recovery_v4 m where m.user_id=auth.uid() order by m.created_at desc limit 50;
end$$;

create or replace function public.wetapp_read_studio_media_chunk_v4(p_job uuid,p_offset integer)
returns table(job_id uuid,"offset" integer,size integer,sha256 text,data text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_wetapp_owner() then raise exception using errcode='42501',message='OWNER_REQUIRED';end if;
 if p_offset is null or p_offset<0 or p_offset>=8388608 or p_offset%262144<>0 then raise exception using errcode='22023',message='MEDIA_OFFSET_INVALID';end if;
 return query select m.job_id,p_offset,octet_length(m.bytes),m.sha256,replace(encode(substring(m.bytes from p_offset+1 for 262144),'base64'),chr(10),'')
 from aigf_worker.studio_media_recovery_v4 m where m.user_id=auth.uid() and m.job_id=p_job and m.status='archived' and p_offset<octet_length(m.bytes);
end$$;

create or replace function aigf_worker.claim_studio_media_v4()
returns table(job_id uuid,lease_id uuid,kind text,created_at timestamptz)
language sql security definer set search_path='' as $$
 with picked as(select m.job_id from aigf_worker.studio_media_recovery_v4 m where m.status='pending' and m.next_poll_at<=clock_timestamp() and (m.lease_until is null or m.lease_until<=clock_timestamp()) order by m.next_poll_at limit 1 for update skip locked),
 claimed as(update aigf_worker.studio_media_recovery_v4 m set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '6 minutes' from picked p where m.job_id=p.job_id returning m.*)
 select c.job_id,c.lease_id,c.kind,c.created_at from claimed c
$$;
create or replace function aigf_worker.release_studio_media_v4(p_job uuid,p_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_error is not null and p_error !~ '^[A-Z0-9_]{1,80}$' then raise exception using errcode='22023',message='MEDIA_ERROR_INVALID';end if;
 update aigf_worker.studio_media_recovery_v4 m set status=case when p_error is null then 'pending' else 'failed' end,error_code=p_error,lease_id=null,lease_until=null,next_poll_at=clock_timestamp()+interval '15 seconds'
 where m.job_id=p_job and m.lease_id=p_lease and m.lease_until>clock_timestamp() and m.status='pending';
 return found;
end$$;
create or replace function aigf_worker.finish_studio_media_v4(p_job uuid,p_lease uuid,p_mime text,p_sha text,p_bytes bytea)
returns text language plpgsql security definer set search_path='' as $$
declare m aigf_worker.studio_media_recovery_v4%rowtype;
begin
 if p_bytes is null or octet_length(p_bytes) not between 512 and 8388608 or p_sha is distinct from encode(sha256(p_bytes),'hex') then raise exception using errcode='22023',message='MEDIA_HASH_INVALID';end if;
 select * into m from aigf_worker.studio_media_recovery_v4 where job_id=p_job for update;
 if not found then return 'missing';end if;
 if m.status='archived' then
  if m.sha256 is distinct from p_sha or m.mime is distinct from p_mime or m.bytes is distinct from p_bytes then raise exception using errcode='22023',message='MEDIA_ARCHIVE_COLLISION';end if;
  return 'archived';
 end if;
 if m.status<>'pending' or m.lease_id is distinct from p_lease or m.lease_until<=clock_timestamp() then return 'lease_lost';end if;
 if (m.kind='image' and (p_mime is distinct from 'image/webp' or substring(p_bytes from 1 for 4)<>convert_to('RIFF','UTF8') or substring(p_bytes from 9 for 4)<>convert_to('WEBP','UTF8'))) or (m.kind='video' and (p_mime is distinct from 'video/mp4' or substring(p_bytes from 5 for 4)<>convert_to('ftyp','UTF8'))) then raise exception using errcode='22023',message='MEDIA_TYPE_INVALID';end if;
 update aigf_worker.studio_media_recovery_v4 set status='archived',mime=p_mime,sha256=p_sha,bytes=p_bytes,lease_id=null,lease_until=null where job_id=p_job;
 return 'archived';
end$$;
revoke all on function public.wetapp_register_studio_media_v4(uuid,text,jsonb),public.wetapp_list_studio_media_v4(),public.wetapp_read_studio_media_chunk_v4(uuid,integer) from public,anon,authenticated;
grant execute on function public.wetapp_register_studio_media_v4(uuid,text,jsonb),public.wetapp_list_studio_media_v4(),public.wetapp_read_studio_media_chunk_v4(uuid,integer) to authenticated;
revoke all on function aigf_worker.claim_studio_media_v4(),aigf_worker.release_studio_media_v4(uuid,uuid,text),aigf_worker.finish_studio_media_v4(uuid,uuid,text,text,bytea) from public,anon,authenticated;
grant execute on function aigf_worker.claim_studio_media_v4(),aigf_worker.release_studio_media_v4(uuid,uuid,text),aigf_worker.finish_studio_media_v4(uuid,uuid,text,text,bytea) to aigf_generation_worker;

-- Release staging bytes only after the same verified asset is committed to
-- the normal private media manifest. Retain the receipt for idempotent recovery.
create or replace function public.wetapp_confirm_studio_media_transfer_v4(p_job uuid)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); m aigf_worker.studio_media_recovery_v4%rowtype; aid text; expected_path text;
begin
 if uid is null or not public.is_wetapp_owner() then raise exception using errcode='42501',message='OWNER_REQUIRED';end if;
 select * into m from aigf_worker.studio_media_recovery_v4 where job_id=p_job and user_id=uid for update;
 if not found then return 'missing';end if;
 if m.status='transferred' then return 'transferred';end if;
 if m.status<>'archived' then return 'waiting';end if;
 aid:=case m.kind when 'image' then 'studio-image-v1-'||p_job::text else 'studio-video-v1-'||encode(convert_to('wan-2-7-enhanced-text-to-video','UTF8'),'hex')||'-'||p_job::text end;
 expected_path:=uid::text||'/atomic-v3/'||encode(sha256(convert_to(aid,'UTF8')),'hex')||'/'||m.sha256;
 if not exists(select 1 from public.wetapp_media a join storage.objects o on o.bucket_id='wetapp-private' and o.name=a.storage_path
 where a.user_id=uid and a.asset_id=aid and a.conversation_key='__aigf_studio_media_v1__'
 and a.kind=case m.kind when 'image' then 'character_photo' else 'attachment' end
 and a.storage_path=expected_path and a.mime_type=m.mime and a.byte_size=octet_length(m.bytes)
 and (o.metadata->>'size')::bigint=a.byte_size) then return 'waiting';end if;
 update aigf_worker.studio_media_recovery_v4 set status='transferred',mime=null,sha256=null,bytes=null where job_id=p_job and user_id=uid;
 return 'transferred';
end$$;
revoke all on function public.wetapp_confirm_studio_media_transfer_v4(uuid) from public,anon,authenticated;
grant execute on function public.wetapp_confirm_studio_media_transfer_v4(uuid) to authenticated;
