create or replace function public.wetapp_resolve_state_patch_v1(expected_revision bigint,state_patch jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); current_revision bigint; result jsonb; e jsonb; path text[]; parent jsonb; leaf text;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then raise exception using errcode='42501',message='NOT_AUTHORIZED';end if;
 if jsonb_typeof(state_patch) is distinct from 'object' or state_patch->>'version' is distinct from '1' or jsonb_typeof(state_patch->'edits') is distinct from 'array' or pg_column_size(state_patch)>16777216 then raise exception using errcode='22023',message='INVALID_STATE_PATCH';end if;
 if jsonb_array_length(state_patch->'edits')>4096 then raise exception using errcode='22023',message='INVALID_STATE_PATCH';end if;
 select s.revision,s.payload into current_revision,result from public.wetapp_state s where s.user_id=uid;
 if current_revision is distinct from expected_revision then raise exception using errcode='40001',message='WETAPP_STATE_REVISION_CONFLICT';end if;
 if jsonb_typeof(result) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_STATE_PATCH_BASE';end if;
 for e in select value from jsonb_array_elements(state_patch->'edits') loop
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'path') is distinct from 'array' then raise exception using errcode='22023',message='INVALID_STATE_PATCH';end if;
  if jsonb_array_length(e->'path') not between 1 and 16 or (select count(*) from jsonb_object_keys(e))<>2 or not (e ? 'value' or coalesce(e->'remove'='true'::jsonb,false))
   or exists(select 1 from jsonb_array_elements(e->'path') v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>1024) then raise exception using errcode='22023',message='INVALID_STATE_PATCH';end if;
  select array_agg(v order by ord) into path from jsonb_array_elements_text(e->'path') with ordinality t(v,ord);
  leaf:=path[cardinality(path)];parent:=case when cardinality(path)=1 then result else result#>path[1:cardinality(path)-1] end;
  if jsonb_typeof(parent)='array' then
   if not (e ? 'value') or leaf !~ '^(0|[1-9][0-9]{0,8})$' then raise exception using errcode='22023',message='INVALID_STATE_PATCH_PATH';end if;
   if leaf::int>=jsonb_array_length(parent) then raise exception using errcode='22023',message='INVALID_STATE_PATCH_PATH';end if;
  elsif jsonb_typeof(parent) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_STATE_PATCH_PATH';end if;
  if e ? 'value' then result:=jsonb_set(result,path,e->'value',true);
  else
   if not (parent ? leaf) then raise exception using errcode='22023',message='INVALID_STATE_PATCH_PATH';end if;
   result:=result#-path;
  end if;
 end loop;
 return result;
end $$;
create or replace function public.wetapp_commit_chat_delta_patch_v1(expected_revision bigint,state_patch jsonb,delta jsonb,device text,operation_id uuid)
returns bigint language sql security invoker set search_path='' set statement_timeout='50s' as $$
 select public.wetapp_commit_chat_delta_receipted_v3($1,public.wetapp_resolve_state_patch_v1($1,$2),$3,$4,$5)
$$;
create or replace function public.wetapp_accept_generation_patch_v1(expected_revision bigint,state_patch jsonb,delta jsonb,device text,job_id uuid,reply_id uuid,conversation_key text,user_message_id text,plan jsonb,finalizer_context jsonb default null)
returns bigint language sql security invoker set search_path='' set statement_timeout='50s' as $$
 select public.wetapp_accept_generation_v4($1,public.wetapp_resolve_state_patch_v1($1,$2),$3,$4,$5,$6,$7,$8,$9,$10)
$$;
revoke all on function public.wetapp_resolve_state_patch_v1(bigint,jsonb),public.wetapp_commit_chat_delta_patch_v1(bigint,jsonb,jsonb,text,uuid),public.wetapp_accept_generation_patch_v1(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.wetapp_resolve_state_patch_v1(bigint,jsonb),public.wetapp_commit_chat_delta_patch_v1(bigint,jsonb,jsonb,text,uuid),public.wetapp_accept_generation_patch_v1(bigint,jsonb,jsonb,text,uuid,uuid,text,text,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
