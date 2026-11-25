-- EXPERIMENTAL: not an applied migration. Existing legacy writers must be disabled before rollout.
-- Atomic append-only checkpoint for an existing conversation + app state.
create or replace function public.wetapp_append_chat_checkpoint_v1(
    expected_revision bigint,
    target_conversation text,
    expected_history jsonb,
    append_messages jsonb,
    new_payload jsonb,
    new_device_id text
) returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
    owner_id uuid := auth.uid();
    actual_revision bigint;
    actual_history jsonb;
    prior_count integer;
    next_revision bigint;
    item jsonb;
    idx integer := 0;
begin
    if owner_id is null or public.is_wetapp_owner() is distinct from true then
        raise exception using errcode='42501',message='NOT_AUTHORIZED';
    end if;
    if expected_revision is null or expected_revision < 1
       or target_conversation is null or length(target_conversation) not between 1 and 256
       or new_device_id is null or length(new_device_id) not between 1 and 256
       or jsonb_typeof(expected_history) is distinct from 'array'
       or jsonb_typeof(append_messages) is distinct from 'array'
       or jsonb_typeof(new_payload) is distinct from 'object'
       or jsonb_array_length(append_messages) not between 1 and 32
       or pg_column_size(expected_history)>8388608 or pg_column_size(append_messages)>1048576
       or pg_column_size(new_payload)>8388608 then
        raise exception using errcode='22023',message='INVALID_CHECKPOINT';
    end if;
    -- Serialize cooperating writers on the existing state row.
    select revision into actual_revision from public.wetapp_state where user_id=owner_id for update;
    if actual_revision is distinct from expected_revision then
        raise exception using errcode='40001',message='WETAPP_STATE_REVISION_CONFLICT';
    end if;
    perform 1 from public.wetapp_conversations where user_id=owner_id and conversation_key=target_conversation for update;
    if not found then raise exception using errcode='22023',message='CONVERSATION_NOT_FOUND'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
       'message_id',message_id,'position',position,'role',role,'speaker_id',speaker_id,
       'content',content,'created_at_ms',created_at_ms
    ) order by position,message_id),'[]'::jsonb)
    into actual_history from public.wetapp_messages
    where user_id=owner_id and conversation_key=target_conversation;
    if actual_history is distinct from expected_history then
        raise exception using errcode='40001',message='WETAPP_HISTORY_CONFLICT';
    end if;
    prior_count:=jsonb_array_length(actual_history);
    if exists(select 1 from jsonb_array_elements(actual_history) with ordinality as a(v,n)
       where (v->>'position')::bigint<>n-1) then
        raise exception using errcode='22023',message='NONCONTIGUOUS_HISTORY';
    end if;
    for item in select value from jsonb_array_elements(append_messages) loop
       if jsonb_typeof(item) is distinct from 'object'
          or not (item ?& array['message_id','position','role','speaker_id','content','created_at_ms'])
          or (item - array['message_id','position','role','speaker_id','content','created_at_ms'])<>'{}'::jsonb
          or jsonb_typeof(item->'message_id') is distinct from 'string'
          or (item->>'message_id') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
          or jsonb_typeof(item->'position') is distinct from 'number'
          or item->>'position' is distinct from (prior_count+idx)::text
          or jsonb_typeof(item->'role') is distinct from 'string'
          or item->>'role' not in ('user','model','system')
          or jsonb_typeof(item->'speaker_id') not in ('null','string')
          or jsonb_typeof(item->'content') is distinct from 'object'
          or (item->'content') ?| array['imageUrl','imageAssetId','imageGeneration','photoProposal','photoIntent']
          or ((item->'content') ? 'attachments' and (item->'content'->'attachments') is distinct from '[]'::jsonb)
          or jsonb_typeof(item->'created_at_ms') is distinct from 'number'
          or (item->>'created_at_ms') !~ '^[0-9]{1,14}$' then
          raise exception using errcode='22023',message='INVALID_APPEND_MESSAGE';
       end if;
       insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms,source_device_id)
       values(owner_id,target_conversation,item->>'message_id',prior_count+idx,item->>'role',item->>'speaker_id',item->'content',(item->>'created_at_ms')::bigint,new_device_id);
       idx:=idx+1;
    end loop;
    update public.wetapp_conversations set message_count=prior_count+idx,
      last_message_at_ms=(select max(created_at_ms) from public.wetapp_messages where user_id=owner_id and conversation_key=target_conversation),
      source_device_id=new_device_id
    where user_id=owner_id and conversation_key=target_conversation;
    update public.wetapp_state set payload=new_payload,revision=revision+1,source_device_id=new_device_id
    where user_id=owner_id and revision=expected_revision returning revision into next_revision;
    if next_revision is null then raise exception using errcode='40001',message='WETAPP_STATE_REVISION_CONFLICT'; end if;
    return next_revision;
end;
$$;
revoke all on function public.wetapp_append_chat_checkpoint_v1(bigint,text,jsonb,jsonb,jsonb,text) from public, anon;
grant execute on function public.wetapp_append_chat_checkpoint_v1(bigint,text,jsonb,jsonb,jsonb,text) to authenticated;
