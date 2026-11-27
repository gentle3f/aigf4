create or replace function aigf_worker.finish_generation_v4(p_job uuid,p_lease uuid,p_content jsonb,p_payload jsonb)
returns table(status text,revision bigint) language plpgsql security definer set search_path=''
as $$
declare o aigf_worker.generation_outbox_v4%rowtype; rev bigint; tail_id text; tail_role text; tail_position int; created_ms bigint; fingerprint text; owner_id uuid; current_payload jsonb; director_key text; director_raw jsonb; director_expected text;
begin
 if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'text') is distinct from 'string'
 or length(btrim(p_content->>'text'))=0 or pg_column_size(p_content)>2097152
 or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>8388608 then
  raise exception using errcode='22023',message='INVALID_FINAL_REPLY';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_content,p_payload)::text,'UTF8')),'hex');
 -- Match the admission lock order: state first, then outbox.
 select g.user_id into owner_id from aigf_worker.generation_outbox_v4 g where coalesce(g.queue_attempt_id,g.job_id)=p_job;
 if not found then return query select 'missing'::text,null::bigint;return;end if;
 select s.revision,s.payload into rev,current_payload from public.wetapp_state s where s.user_id=owner_id for update;
 select g.* into o from aigf_worker.generation_outbox_v4 g where coalesce(g.queue_attempt_id,g.job_id)=p_job for update;
 if o.status='done' then
  if o.result_sha256 is distinct from fingerprint then raise exception using errcode='22023',message='FINAL_RESULT_COLLISION';end if;
  return query select 'done'::text,o.result_revision;return;
 end if;
 if o.lease_id is distinct from p_lease or o.lease_until is null or o.lease_until<=clock_timestamp() or o.status not in ('accepted','queued') then
  return query select 'lease_lost'::text,null::bigint;return;
 end if;
 select m.message_id,m.role,m.position into tail_id,tail_role,tail_position from public.wetapp_messages m
 where m.user_id=o.user_id and m.conversation_key=o.conversation_key order by m.position desc limit 1;
 if rev is distinct from o.admission_revision or tail_id is distinct from o.user_message_id or tail_role is distinct from 'user'
 or exists(select 1 from public.wetapp_messages m where m.user_id=o.user_id and m.conversation_key=o.conversation_key and m.message_id=o.reply_id::text) then
  update aigf_worker.generation_outbox_v4 g set status='conflict',failure_code='CONTEXT_CHANGED',lease_id=null,lease_until=null where g.user_id=o.user_id and g.job_id=o.job_id;
  return query select 'conflict'::text,rev;return;
 end if;
 -- The currently deployed worker may understand fewer director fields than
 -- a newer frontend. Only the exact admitted one-turn instruction is consumed.
 director_expected:=o.finalizer_context->>'directorNextId';
 if coalesce(o.finalizer_context->>'worldActive','false')='true' and director_expected is not null then
  director_key:='aigfWorldlineDirectorV1:'||o.conversation_key;
  begin
   director_raw:=(current_payload->'appSettings'->>director_key)::jsonb;
  exception when invalid_text_representation then
   director_raw:=null;
  end;
  if jsonb_typeof(director_raw) is distinct from 'object'
     or director_raw->'next'->>'id' is distinct from director_expected
     or p_content->>'worldlineVpsDirectorNextId' is distinct from director_expected
     or jsonb_typeof(p_payload->'appSettings') is distinct from 'object' then
    update aigf_worker.generation_outbox_v4 g set status='conflict',failure_code='CONTEXT_CHANGED',lease_id=null,lease_until=null where g.user_id=o.user_id and g.job_id=o.job_id;
    return query select 'conflict'::text,rev;return;
  end if;
  p_payload:=jsonb_set(p_payload,array['appSettings',director_key],to_jsonb((director_raw-'next')::text),true);
 end if;
 created_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms,source_device_id)
 values(o.user_id,o.conversation_key,o.reply_id::text,tail_position+1,'model',null,p_content,created_ms,'aigf-vps-v4');
 update public.wetapp_conversations c set message_count=(select count(*) from public.wetapp_messages m where m.user_id=o.user_id and m.conversation_key=o.conversation_key),last_message_at_ms=created_ms,source_device_id='aigf-vps-v4'
 where c.user_id=o.user_id and c.conversation_key=o.conversation_key;
 update public.wetapp_state s set payload=p_payload,revision=s.revision+1,source_device_id='aigf-vps-v4' where s.user_id=o.user_id returning s.revision into rev;
 update aigf_worker.generation_outbox_v4 g set status='done',result_revision=rev,result_sha256=fingerprint,lease_id=null,lease_until=null
 where g.user_id=o.user_id and g.job_id=o.job_id;
 return query select 'done'::text,rev;
end$$;
