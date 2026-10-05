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
