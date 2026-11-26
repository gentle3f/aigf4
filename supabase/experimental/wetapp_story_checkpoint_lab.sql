-- EXPERIMENTAL ONLY. Depends on checkpoint V2; do not install with legacy writers active.
-- Per-site state is bound to the exact retained history, not a replacement of wetapp_state.payload.
create table if not exists public.wetapp_story_checkpoint_lab (
 user_id uuid not null,
 conversation_key text not null,
 site text not null check(site in ('worldline1','worldline2')),
 history_sha256 text not null check(history_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 invalidated boolean not null default false,
 primary key(user_id,conversation_key,site),
 foreign key(user_id,conversation_key) references public.wetapp_conversations(user_id,conversation_key) on delete cascade
);
alter table public.wetapp_story_checkpoint_lab enable row level security;
create policy story_checkpoint_lab_owner on public.wetapp_story_checkpoint_lab for all to authenticated
 using (public.is_wetapp_owner() and user_id=auth.uid())
 with check (public.is_wetapp_owner() and user_id=auth.uid());
grant select,insert,update,delete on public.wetapp_story_checkpoint_lab to authenticated;

create or replace function public.wetapp_story_checkpoint_read_lab(target text, site_name text)
returns jsonb language sql stable security invoker set search_path=''
as $$
 select case when h is null then null else jsonb_build_object('head',h,'snapshot',case when not m.invalidated and m.history_sha256=h->>'sha256' then m.snapshot else null end,'stale',coalesce(m.invalidated or m.history_sha256<>h->>'sha256',false)) end
 from (select public.wetapp_chat_checkpoint_head_v2(target) h) x
 left join public.wetapp_story_checkpoint_lab m on m.user_id=auth.uid() and m.conversation_key=target and m.site=site_name
 where public.is_wetapp_owner() is true and site_name in ('worldline1','worldline2')
$$;
revoke all on function public.wetapp_story_checkpoint_read_lab(text,text) from public,anon;
grant execute on function public.wetapp_story_checkpoint_read_lab(text,text) to authenticated;

create or replace function public.wetapp_story_checkpoint_commit_lab(
 target text,site_name text,expected_revision bigint,expected_digest text,expected_count bigint,
 append_rows jsonb,recall_user text,new_snapshot jsonb,device text
) returns bigint language plpgsql security invoker set search_path=''
as $$
declare
 uid uuid:=auth.uid();
 h jsonb;
 rev bigint;
 cut_pos integer;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then raise exception using errcode='42501',message='NOT_AUTHORIZED'; end if;
 if site_name is null or site_name not in ('worldline1','worldline2') or target is null or length(target) not between 1 and 256
 or device is null or length(device) not between 1 and 256
 or expected_revision is null or expected_revision<1 or expected_digest is null or expected_digest !~ '^[a-f0-9]{64}$'
 or expected_count is null or expected_count<0
 or jsonb_typeof(new_snapshot) is distinct from 'object' or pg_column_size(new_snapshot)>2097152
 or jsonb_typeof(append_rows) is distinct from 'array' or (recall_user is not null and jsonb_array_length(append_rows)<>0)
 or (recall_user is null and jsonb_array_length(append_rows)=0)
 then raise exception using errcode='22023',message='INVALID_STORY_CHECKPOINT'; end if;
 select revision into rev from public.wetapp_state where user_id=uid for update;
 if rev is distinct from expected_revision then raise exception using errcode='40001',message='WETAPP_STATE_REVISION_CONFLICT';end if;
 perform 1 from public.wetapp_conversations where user_id=uid and conversation_key=target for update;
 if not found then raise exception using errcode='22023',message='CONVERSATION_NOT_FOUND';end if;
 h:=public.wetapp_chat_checkpoint_head_v2(target);
 if h is null or h->>'sha256' is distinct from expected_digest or (h->>'count')::bigint is distinct from expected_count or (h->>'contiguous')::boolean is distinct from true then raise exception using errcode='40001',message='WETAPP_HISTORY_CONFLICT';end if;
 if recall_user is null then
   rev:=public.wetapp_append_chat_checkpoint_v2(expected_revision,target,expected_digest,expected_count,append_rows,device);
 else
   -- Tail-only recall. Never delete another user's turn or media-linked messages.
   select position into cut_pos from public.wetapp_messages where user_id=uid and conversation_key=target and message_id=recall_user and role='user';
   if cut_pos is null or exists(select 1 from public.wetapp_messages where user_id=uid and conversation_key=target and position>cut_pos and role='user') then raise exception using errcode='22023',message='RECALL_NOT_LATEST_TURN';end if;
   if exists(select 1 from public.wetapp_messages where user_id=uid and conversation_key=target and position>=cut_pos and (content ?| array['imageUrl','imageAssetId','imageGeneration','photoProposal','photoIntent'] or (content ? 'attachments' and content->'attachments'<>'[]'::jsonb))) then raise exception using errcode='22023',message='RECALL_MEDIA_UNSUPPORTED';end if;
   delete from public.wetapp_messages where user_id=uid and conversation_key=target and position>=cut_pos;
   update public.wetapp_conversations set message_count=cut_pos,last_message_at_ms=(select max(created_at_ms) from public.wetapp_messages where user_id=uid and conversation_key=target),source_device_id=device where user_id=uid and conversation_key=target;
   update public.wetapp_state set revision=revision+1,source_device_id=device where user_id=uid returning revision into rev;
 end if;
 h:=public.wetapp_chat_checkpoint_head_v2(target);
 -- A different site must explicitly rebuild its snapshot even if recall returns to the old hash.
 update public.wetapp_story_checkpoint_lab set invalidated=true where user_id=uid and conversation_key=target and site<>site_name;
 insert into public.wetapp_story_checkpoint_lab(user_id,conversation_key,site,history_sha256,snapshot,invalidated)
 values(uid,target,site_name,h->>'sha256',new_snapshot,false)
 on conflict(user_id,conversation_key,site) do update set history_sha256=excluded.history_sha256,snapshot=excluded.snapshot,invalidated=false;
 return rev;
end
$$;
revoke all on function public.wetapp_story_checkpoint_commit_lab(text,text,bigint,text,bigint,jsonb,text,jsonb,text) from public,anon;
grant execute on function public.wetapp_story_checkpoint_commit_lab(text,text,bigint,text,bigint,jsonb,text,jsonb,text) to authenticated;
