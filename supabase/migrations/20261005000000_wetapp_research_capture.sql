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
