create or replace function public.wetapp_message_blocks_v1()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revision',s.revision,'blocks',coalesce((
  select jsonb_agg(jsonb_build_array(b.conversation_key,b.block,b.digest,b.n,b.valid) order by b.conversation_key,b.block)
  from (
   select m.conversation_key,m.position/32 as block,count(*) as n,
    count(distinct m.position)=count(*) and min(m.position)=(m.position/32)*32 and max(m.position)=(m.position/32)*32+count(*)-1 as valid,
    encode(sha256(convert_to(jsonb_agg(jsonb_build_array(m.message_id,m.position,m.role,m.speaker_id,m.content,m.created_at_ms) order by m.position,m.message_id)::text,'UTF8')),'hex') as digest
   from public.wetapp_messages m where m.user_id=s.user_id group by m.conversation_key,m.position/32
  ) b
 ),'[]'::jsonb))
 from public.wetapp_state s where s.user_id=(select auth.uid()) and (select public.is_wetapp_owner());
$$;
revoke all on function public.wetapp_message_blocks_v1() from public,anon;
grant execute on function public.wetapp_message_blocks_v1() to authenticated;
notify pgrst,'reload schema';
