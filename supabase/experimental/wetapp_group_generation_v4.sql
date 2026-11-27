-- Extend V4 to ordinary group text turns; keep single-story semantics unchanged.
create or replace function aigf_worker.accept_generation_v4(
 expected_revision bigint,new_payload jsonb,delta jsonb,device text,
 job_id uuid,reply_id uuid,conversation_key text,user_message_id text,plan jsonb,finalizer_context jsonb default null
) returns bigint language plpgsql security definer set search_path=''
as $$
declare
 uid uuid:=auth.uid(); prior aigf_worker.generation_outbox_v4%rowtype;
 fingerprint text; rev bigint; tail_id text; tail_role text; tail_text text;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then
  raise exception using errcode='42501',message='NOT_AUTHORIZED';
 end if;
 if job_id is null or reply_id is null or job_id=reply_id or conversation_key is null or length(conversation_key) not between 1 and 256
 or user_message_id is null or user_message_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or user_message_id in (job_id::text,reply_id::text)
 or jsonb_typeof(plan) is distinct from 'object' or pg_column_size(plan)>262144
 or coalesce(plan->>'workflow_version','') not in ('1','2','3')
 or (finalizer_context is not null and (jsonb_typeof(finalizer_context) is distinct from 'object' or pg_column_size(finalizer_context)>262144 or (((finalizer_context->>'version'='1' and jsonb_typeof(finalizer_context->'single')='object' and plan->>'workflow_version' in ('1','2')) or (finalizer_context->>'version'='2' and jsonb_typeof(finalizer_context->'group')='object' and finalizer_context->>'worldActive'='false' and finalizer_context->>'roomDigest' ~ '^[a-f0-9]{64}$' and plan->>'workflow_version'='3')) is not true)))
 or jsonb_typeof(plan->'primary') is distinct from 'object' or jsonb_typeof(plan->'review') is distinct from 'object'
 then raise exception using errcode='22023',message='INVALID_GENERATION_ADMISSION';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(expected_revision,new_payload,delta,device,job_id,reply_id,conversation_key,user_message_id,plan,finalizer_context)::text,'UTF8')),'hex');
 perform 1 from public.wetapp_state s where s.user_id=uid for update;
 select o.* into prior from aigf_worker.generation_outbox_v4 o where o.user_id=uid and o.job_id=accept_generation_v4.job_id;
 if found then
  if prior.admission_sha256<>fingerprint then raise exception using errcode='22023',message='GENERATION_OPERATION_COLLISION';end if;
  return prior.admission_revision;
 end if;
 -- Admission is new only if the user message does not yet exist; legacy orphan
 -- messages are not silently replayed by this endpoint.
 if exists(select 1 from public.wetapp_messages m where m.user_id=uid and m.conversation_key=accept_generation_v4.conversation_key
 and m.message_id in (accept_generation_v4.user_message_id,reply_id::text))
 then raise exception using errcode='22023',message='GENERATION_MESSAGE_ALREADY_EXISTS';end if;
 if not exists(select 1 from jsonb_to_recordset(delta->'messages') as m(conversation_key text,message_id text,role text)
 where m.conversation_key=accept_generation_v4.conversation_key and m.message_id=accept_generation_v4.user_message_id and m.role='user')
 then raise exception using errcode='22023',message='GENERATION_USER_NOT_IN_DELTA';end if;
 if finalizer_context->>'version'='2' and (jsonb_typeof(new_payload->'rooms'->'rooms') is distinct from 'array' or (select count(*) from jsonb_array_elements(new_payload->'rooms'->'rooms') r where r->>'id'=accept_generation_v4.conversation_key and r->>'type'='group')<>1) then raise exception using errcode='22023',message='GENERATION_GROUP_MISSING';end if;
 rev:=public.wetapp_commit_chat_delta_receipted_v3(expected_revision,new_payload,delta,device,job_id);
 select m.message_id,m.role,m.content->>'text' into tail_id,tail_role,tail_text from public.wetapp_messages m
 where m.user_id=uid and m.conversation_key=accept_generation_v4.conversation_key order by m.position desc limit 1;
 if tail_id is distinct from user_message_id or tail_role is distinct from 'user' then
  raise exception using errcode='22023',message='GENERATION_USER_NOT_TAIL';
 end if;
 if finalizer_context is not null and tail_text is distinct from coalesce(finalizer_context->'group'->>'latestUserMessage',finalizer_context->'single'->>'latestUserMessage') then
  raise exception using errcode='22023',message='GENERATION_FINALIZER_USER_MISMATCH';end if;
 insert into aigf_worker.generation_outbox_v4(user_id,job_id,reply_id,conversation_key,user_message_id,admission_revision,admission_sha256,plan,finalizer_context)
 values(uid,job_id,reply_id,conversation_key,user_message_id,rev,fingerprint,plan,finalizer_context);
 return rev;
end;
$$;


create or replace function aigf_worker.retry_generation_v4(p_job uuid,p_attempt uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); o aigf_worker.generation_outbox_v4%rowtype; rev bigint; tail_id text; tail_role text; tail_content jsonb;
begin
 if uid is null or public.is_wetapp_owner() is distinct from true then raise exception using errcode='42501',message='NOT_AUTHORIZED';end if;
 if p_job is null or p_attempt is null or p_attempt=p_job then raise exception using errcode='22023',message='INVALID_RETRY_ID';end if;
 select s.revision into rev from public.wetapp_state s where s.user_id=uid for update;
 select g.* into o from aigf_worker.generation_outbox_v4 g where g.user_id=uid and g.job_id=p_job for update;
 if not found then raise exception using errcode='22023',message='GENERATION_NOT_FOUND';end if;
 if o.queue_attempt_id=p_attempt or o.status in ('accepted','queued','done') then return o.status;end if;
 if o.status<>'failed' or o.failure_code not in ('QUEUE_FAILED','QUEUE_INTERRUPTED','QUEUE_RESULT_EXPIRED','INVALID_RESULT') then raise exception using errcode='22023',message='GENERATION_RETRY_NOT_AVAILABLE';end if;
 if rev is distinct from o.admission_revision then raise exception using errcode='22023',message='GENERATION_RETRY_CONTEXT_CHANGED';end if;
 select m.message_id,m.role,m.content into tail_id,tail_role,tail_content from public.wetapp_messages m where m.user_id=uid and m.conversation_key=o.conversation_key order by m.position desc limit 1;
 if tail_id is distinct from o.user_message_id or tail_role is distinct from 'user'
 or tail_content->'vpsServerGeneration'->>'jobId' is distinct from p_job::text
 or tail_content->'vpsServerGeneration'->>'replyId' is distinct from o.reply_id::text
 or tail_content->>'text' is distinct from coalesce(o.finalizer_context->'group'->>'latestUserMessage',o.finalizer_context->'single'->>'latestUserMessage')
 or exists(select 1 from public.wetapp_messages m where m.user_id=uid and m.conversation_key=o.conversation_key and m.message_id=o.reply_id::text)
 then raise exception using errcode='22023',message='GENERATION_RETRY_CONTEXT_CHANGED';end if;
 if exists(select 1 from aigf_worker.generation_outbox_v4 g where g.job_id=p_attempt or g.queue_attempt_id=p_attempt) then raise exception using errcode='22023',message='GENERATION_RETRY_ID_COLLISION';end if;
 update aigf_worker.generation_outbox_v4 g set queue_attempt_id=p_attempt,retry_at=clock_timestamp(),retry_count=retry_count+1,status='accepted',failure_code=null,lease_id=null,lease_until=null,next_poll_at=clock_timestamp()
 where g.user_id=uid and g.job_id=p_job;
 return 'accepted';
end$$;

create or replace function aigf_worker.finish_generation_v4(p_job uuid,p_lease uuid,p_content jsonb,p_payload jsonb)
returns table(status text,revision bigint) language plpgsql security definer set search_path=''
as $$
declare o aigf_worker.generation_outbox_v4%rowtype; rev bigint; tail_id text; tail_role text; tail_position int; created_ms bigint; fingerprint text; owner_id uuid; current_payload jsonb; director_key text; director_raw jsonb; director_expected text; npc jsonb; room_before jsonb; room_after jsonb;
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
 if o.finalizer_context->>'version'='2' then
  if jsonb_typeof(p_content->'segments') is distinct from 'array' or jsonb_array_length(p_content->'segments')=0
  or jsonb_typeof(p_payload->'rooms'->'rooms') is distinct from 'array' then raise exception using errcode='22023',message='INVALID_GROUP_RESULT';end if;
  select r into room_before from jsonb_array_elements(current_payload->'rooms'->'rooms') r where r->>'id'=o.conversation_key;
  select r into room_after from jsonb_array_elements(p_payload->'rooms'->'rooms') r where r->>'id'=o.conversation_key;
  if room_before is null or room_after is null or room_after->>'lastVpsSceneJobId' is distinct from p_job::text
   or (room_before-'scene'-'updatedAt'-'lastVpsSceneJobId') is distinct from (room_after-'scene'-'updatedAt'-'lastVpsSceneJobId')
   or (current_payload-'rooms') is distinct from (p_payload-'rooms') then raise exception using errcode='22023',message='INVALID_GROUP_STATE';end if;
  if (select coalesce(jsonb_agg(r order by r->>'id'),'[]'::jsonb) from jsonb_array_elements(current_payload->'rooms'->'rooms') r where r->>'id'<>o.conversation_key)
   is distinct from (select coalesce(jsonb_agg(r order by r->>'id'),'[]'::jsonb) from jsonb_array_elements(p_payload->'rooms'->'rooms') r where r->>'id'<>o.conversation_key)
   then raise exception using errcode='22023',message='INVALID_GROUP_STATE';end if;
  npc:=p_content->'npcProposal';
  if npc is not null then
   if jsonb_typeof(npc) is distinct from 'object' or npc->>'id' is distinct from o.reply_id::text||'-npc' or npc->>'status' is distinct from 'pending' or length(coalesce(npc->>'name',''))=0 then raise exception using errcode='22023',message='INVALID_GROUP_NPC';end if;
   p_content:=p_content-'npcProposal';
  end if;
 end if;
 created_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms,source_device_id)
 values(o.user_id,o.conversation_key,o.reply_id::text,tail_position+1,'model',null,p_content,created_ms,'aigf-vps-v4');
 if npc is not null and not exists(select 1 from public.wetapp_messages m where m.user_id=o.user_id and m.conversation_key=o.conversation_key and lower(btrim(m.content->'npcProposal'->>'name'))=lower(btrim(npc->>'name'))) then
  insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms,source_device_id)
  values(o.user_id,o.conversation_key,o.reply_id::text||'-npc',tail_position+2,'system',null,jsonb_build_object('npcProposal',npc),created_ms,'aigf-vps-v4');
 end if;
 update public.wetapp_conversations c set message_count=(select count(*) from public.wetapp_messages m where m.user_id=o.user_id and m.conversation_key=o.conversation_key),last_message_at_ms=created_ms,source_device_id='aigf-vps-v4'
 where c.user_id=o.user_id and c.conversation_key=o.conversation_key;
 update public.wetapp_state s set payload=p_payload,revision=s.revision+1,source_device_id='aigf-vps-v4' where s.user_id=o.user_id returning s.revision into rev;
 update aigf_worker.generation_outbox_v4 g set status='done',result_revision=rev,result_sha256=fingerprint,lease_id=null,lease_until=null
 where g.user_id=o.user_id and g.job_id=o.job_id;
 return query select 'done'::text,rev;
end$$;
