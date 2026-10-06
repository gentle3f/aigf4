-- AIGF / Wetapp new Supabase project bootstrap
-- Run once in the NEW project's SQL Editor.
-- Generated from the repo migrations in order.


-- ===== 20260815000000_wetapp_cloud_sync.sql =====

create extension if not exists pgcrypto;

create or replace function public.is_wetapp_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select lower(coalesce(auth.jwt() ->> 'email', '')) = 'gentle3f@gmail.com';
$$;

revoke all on function public.is_wetapp_owner() from public;
grant execute on function public.is_wetapp_owner() to authenticated;

create table if not exists public.wetapp_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.wetapp_state (
    user_id uuid primary key references auth.users(id) on delete cascade,
    payload jsonb not null default '{}'::jsonb,
    revision bigint not null default 1,
    source_device_id text,
    updated_at timestamptz not null default now()
);

create table if not exists public.wetapp_conversations (
    user_id uuid not null references auth.users(id) on delete cascade,
    conversation_key text not null,
    title text not null default '',
    kind text not null default 'persona' check (kind in ('persona', 'room', 'assistant', 'unknown')),
    message_count integer not null default 0,
    last_message_at_ms bigint,
    source_device_id text,
    updated_at timestamptz not null default now(),
    primary key (user_id, conversation_key)
);

create table if not exists public.wetapp_messages (
    user_id uuid not null references auth.users(id) on delete cascade,
    conversation_key text not null,
    message_id text not null,
    position integer not null,
    role text not null check (role in ('user', 'model', 'system')),
    speaker_id text,
    content jsonb not null default '{}'::jsonb,
    created_at_ms bigint not null,
    source_device_id text,
    updated_at timestamptz not null default now(),
    primary key (user_id, conversation_key, message_id),
    foreign key (user_id, conversation_key)
        references public.wetapp_conversations(user_id, conversation_key)
        on delete cascade
);

create table if not exists public.wetapp_media (
    user_id uuid not null references auth.users(id) on delete cascade,
    asset_id text not null,
    conversation_key text,
    kind text not null check (kind in ('persona_avatar', 'room_avatar', 'character_photo', 'attachment')),
    storage_path text not null,
    mime_type text not null,
    byte_size bigint not null default 0,
    signature text not null,
    metadata jsonb not null default '{}'::jsonb,
    source_device_id text,
    created_at_ms bigint not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, asset_id),
    unique (storage_path)
);

create index if not exists wetapp_messages_conversation_position_idx
    on public.wetapp_messages(user_id, conversation_key, position);
create index if not exists wetapp_messages_updated_at_idx
    on public.wetapp_messages(user_id, updated_at desc);
create index if not exists wetapp_media_conversation_idx
    on public.wetapp_media(user_id, conversation_key);

create or replace function public.wetapp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists wetapp_profiles_touch_updated_at on public.wetapp_profiles;
create trigger wetapp_profiles_touch_updated_at
before update on public.wetapp_profiles
for each row execute function public.wetapp_touch_updated_at();

drop trigger if exists wetapp_state_touch_updated_at on public.wetapp_state;
create trigger wetapp_state_touch_updated_at
before update on public.wetapp_state
for each row execute function public.wetapp_touch_updated_at();

drop trigger if exists wetapp_conversations_touch_updated_at on public.wetapp_conversations;
create trigger wetapp_conversations_touch_updated_at
before update on public.wetapp_conversations
for each row execute function public.wetapp_touch_updated_at();

drop trigger if exists wetapp_messages_touch_updated_at on public.wetapp_messages;
create trigger wetapp_messages_touch_updated_at
before update on public.wetapp_messages
for each row execute function public.wetapp_touch_updated_at();

drop trigger if exists wetapp_media_touch_updated_at on public.wetapp_media;
create trigger wetapp_media_touch_updated_at
before update on public.wetapp_media
for each row execute function public.wetapp_touch_updated_at();

create or replace function public.wetapp_save_state(new_payload jsonb, new_device_id text)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    next_revision bigint;
begin
    if auth.uid() is null or not public.is_wetapp_owner() then
        raise exception 'Not authorized';
    end if;

    insert into public.wetapp_state (user_id, payload, revision, source_device_id)
    values (auth.uid(), coalesce(new_payload, '{}'::jsonb), 1, new_device_id)
    on conflict (user_id) do update
    set payload = excluded.payload,
        revision = public.wetapp_state.revision + 1,
        source_device_id = excluded.source_device_id
    returning revision into next_revision;

    return next_revision;
end;
$$;

revoke all on function public.wetapp_save_state(jsonb, text) from public;
grant execute on function public.wetapp_save_state(jsonb, text) to authenticated;

create or replace function public.wetapp_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if lower(coalesce(new.email, '')) = 'gentle3f@gmail.com' then
        insert into public.wetapp_profiles (id, email)
        values (new.id, lower(new.email))
        on conflict (id) do update set email = excluded.email;
    end if;
    return new;
end;
$$;

drop trigger if exists on_wetapp_auth_user_created on auth.users;
create trigger on_wetapp_auth_user_created
after insert or update of email on auth.users
for each row execute function public.wetapp_handle_new_user();

insert into public.wetapp_profiles (id, email)
select id, lower(email)
from auth.users
where lower(coalesce(email, '')) = 'gentle3f@gmail.com'
on conflict (id) do update set email = excluded.email;

alter table public.wetapp_profiles enable row level security;
alter table public.wetapp_state enable row level security;
alter table public.wetapp_conversations enable row level security;
alter table public.wetapp_messages enable row level security;
alter table public.wetapp_media enable row level security;

drop policy if exists wetapp_profiles_owner_all on public.wetapp_profiles;
create policy wetapp_profiles_owner_all on public.wetapp_profiles
for all to authenticated
using (public.is_wetapp_owner() and id = auth.uid())
with check (public.is_wetapp_owner() and id = auth.uid());

drop policy if exists wetapp_state_owner_all on public.wetapp_state;
create policy wetapp_state_owner_all on public.wetapp_state
for all to authenticated
using (public.is_wetapp_owner() and user_id = auth.uid())
with check (public.is_wetapp_owner() and user_id = auth.uid());

drop policy if exists wetapp_conversations_owner_all on public.wetapp_conversations;
create policy wetapp_conversations_owner_all on public.wetapp_conversations
for all to authenticated
using (public.is_wetapp_owner() and user_id = auth.uid())
with check (public.is_wetapp_owner() and user_id = auth.uid());

drop policy if exists wetapp_messages_owner_all on public.wetapp_messages;
create policy wetapp_messages_owner_all on public.wetapp_messages
for all to authenticated
using (public.is_wetapp_owner() and user_id = auth.uid())
with check (public.is_wetapp_owner() and user_id = auth.uid());

drop policy if exists wetapp_media_owner_all on public.wetapp_media;
create policy wetapp_media_owner_all on public.wetapp_media
for all to authenticated
using (public.is_wetapp_owner() and user_id = auth.uid())
with check (public.is_wetapp_owner() and user_id = auth.uid());

grant select, insert, update, delete on public.wetapp_profiles to authenticated;
grant select, insert, update, delete on public.wetapp_state to authenticated;
grant select, insert, update, delete on public.wetapp_conversations to authenticated;
grant select, insert, update, delete on public.wetapp_messages to authenticated;
grant select, insert, update, delete on public.wetapp_media to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('wetapp-private', 'wetapp-private', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists wetapp_storage_owner_select on storage.objects;
create policy wetapp_storage_owner_select on storage.objects
for select to authenticated
using (
    bucket_id = 'wetapp-private'
    and public.is_wetapp_owner()
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists wetapp_storage_owner_insert on storage.objects;
create policy wetapp_storage_owner_insert on storage.objects
for insert to authenticated
with check (
    bucket_id = 'wetapp-private'
    and public.is_wetapp_owner()
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists wetapp_storage_owner_update on storage.objects;
create policy wetapp_storage_owner_update on storage.objects
for update to authenticated
using (
    bucket_id = 'wetapp-private'
    and public.is_wetapp_owner()
    and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
    bucket_id = 'wetapp-private'
    and public.is_wetapp_owner()
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists wetapp_storage_owner_delete on storage.objects;
create policy wetapp_storage_owner_delete on storage.objects
for delete to authenticated
using (
    bucket_id = 'wetapp-private'
    and public.is_wetapp_owner()
    and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.wetapp_state replica identity full;
alter table public.wetapp_conversations replica identity full;
alter table public.wetapp_messages replica identity full;
alter table public.wetapp_media replica identity full;

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
        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = table_name
        ) then
            execute format('alter publication supabase_realtime add table public.%I', table_name);
        end if;
    end loop;
end;
$$;


-- ===== 20260928000000_wetapp_state_revision_cas.sql =====

create or replace function public.wetapp_save_state_if_revision(
    new_payload jsonb,
    new_device_id text,
    expected_revision bigint
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    next_revision bigint;
begin
    if auth.uid() is null or not public.is_wetapp_owner() then
        raise exception 'Not authorized';
    end if;

    if coalesce(expected_revision, 0) = 0 then
        insert into public.wetapp_state (user_id, payload, revision, source_device_id)
        values (auth.uid(), coalesce(new_payload, '{}'::jsonb), 1, new_device_id)
        on conflict (user_id) do nothing
        returning revision into next_revision;
    else
        update public.wetapp_state
        set payload = coalesce(new_payload, '{}'::jsonb),
            revision = revision + 1,
            source_device_id = new_device_id
        where user_id = auth.uid()
          and revision = expected_revision
        returning revision into next_revision;
    end if;

    if next_revision is null then
        raise exception using
            errcode = '40001',
            message = 'WETAPP_STATE_REVISION_CONFLICT';
    end if;

    return next_revision;
end;
$$;

revoke all on function public.wetapp_save_state_if_revision(jsonb, text, bigint) from public;
grant execute on function public.wetapp_save_state_if_revision(jsonb, text, bigint) to authenticated;


-- ===== 20261005000000_wetapp_research_capture.sql =====

-- AIGF mobile-first research capture archive.
-- Explicit opt-in only. Full turn content stays local by default; cloud rows always
-- contain compact metadata, while only selected high-value samples include content.
-- This table is intentionally not added to Supabase Realtime publications.

create table if not exists public.wetapp_research_turns (
    user_id uuid not null references auth.users(id) on delete cascade,
    record_id text not null,
    schema_version integer not null default 1 check (schema_version = 1),
    conversation_key text not null,
    request_id text not null,
    mode text not null default 'group' check (mode = 'group'),
    created_at_ms bigint not null,
    metadata jsonb not null default '{}'::jsonb,
    sample_payload jsonb,
    source_device_id text,
    updated_at timestamptz not null default now(),
    primary key (user_id, record_id)
);

create index if not exists wetapp_research_turns_created_at_idx
    on public.wetapp_research_turns(user_id, created_at_ms desc);

drop trigger if exists wetapp_research_turns_touch_updated_at on public.wetapp_research_turns;
create trigger wetapp_research_turns_touch_updated_at
before update on public.wetapp_research_turns
for each row execute function public.wetapp_touch_updated_at();

alter table public.wetapp_research_turns enable row level security;

drop policy if exists wetapp_research_turns_owner_all on public.wetapp_research_turns;
create policy wetapp_research_turns_owner_all on public.wetapp_research_turns
for all to authenticated
using (public.is_wetapp_owner() and user_id = auth.uid())
with check (public.is_wetapp_owner() and user_id = auth.uid());

grant select, insert, update, delete on public.wetapp_research_turns to authenticated;


-- ===== 20261006000000_disable_wetapp_realtime.sql =====

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
