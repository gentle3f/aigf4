-- Isolated AIGF-SYNC-PILOT only. No changes to the production bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('aigf-pilot-media','aigf-pilot-media',false,52428800,array['image/webp','image/png','image/jpeg','video/mp4','video/webm']);
create table public.wetapp_pilot_media (
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_id text not null check(length(asset_id) between 1 and 300 and asset_id ~ '^[a-zA-Z0-9_-]+$'),
 kind text not null check(kind in ('image','video')),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 mime_type text not null check(mime_type in ('image/webp','image/png','image/jpeg','video/mp4','video/webm')),
 byte_size bigint not null check(byte_size between 1 and 52428800),
 storage_path text not null,
 metadata jsonb not null check(jsonb_typeof(metadata)='object' and pg_column_size(metadata)<=65536),
 created_at_ms bigint not null check(created_at_ms>=0),
 primary key(user_id,asset_id),
 unique(storage_path),
 check(storage_path=user_id::text||'/'||asset_id||'/'||sha256),
 check((kind='image' and mime_type like 'image/%') or (kind='video' and mime_type like 'video/%'))
);
alter table public.wetapp_pilot_media enable row level security;
revoke all on public.wetapp_pilot_media from public,anon,authenticated;
grant select,insert on public.wetapp_pilot_media to authenticated;
create policy pilot_media_read on public.wetapp_pilot_media for select to authenticated
 using (public.is_wetapp_owner() and user_id=(select auth.uid()));
create policy pilot_media_insert on public.wetapp_pilot_media for insert to authenticated
 with check (public.is_wetapp_owner() and user_id=(select auth.uid()));
create policy pilot_media_object_read on storage.objects for select to authenticated
 using(bucket_id='aigf-pilot-media' and public.is_wetapp_owner() and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy pilot_media_object_insert on storage.objects for insert to authenticated
 with check(bucket_id='aigf-pilot-media' and public.is_wetapp_owner() and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[a-f0-9-]{36}/[a-zA-Z0-9_-]{1,300}/[a-f0-9]{64}$');
