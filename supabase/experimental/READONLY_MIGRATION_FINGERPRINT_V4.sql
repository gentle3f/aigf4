-- Read-only migration fingerprint. Run against source and restored target.
-- Returns aggregate hashes/counts only; no individual message, asset path or identity.
with row_hashes as (
 select 'state' as relation,encode(sha256(convert_to((to_jsonb(t)-'updated_at'||jsonb_build_object('updated_at_epoch',extract(epoch from t.updated_at)))::text,'UTF8')),'hex') as digest from public.wetapp_state t
 union all
 select 'conversations',encode(sha256(convert_to((to_jsonb(t)-'updated_at'||jsonb_build_object('updated_at_epoch',extract(epoch from t.updated_at)))::text,'UTF8')),'hex') from public.wetapp_conversations t
 union all
 select 'messages',encode(sha256(convert_to((to_jsonb(t)-'updated_at'||jsonb_build_object('updated_at_epoch',extract(epoch from t.updated_at)))::text,'UTF8')),'hex') from public.wetapp_messages t
 union all
 select 'media',encode(sha256(convert_to((to_jsonb(t)-'updated_at'||jsonb_build_object('updated_at_epoch',extract(epoch from t.updated_at)))::text,'UTF8')),'hex') from public.wetapp_media t
 union all
 select 'research_turns',encode(sha256(convert_to((to_jsonb(t)-'updated_at'||jsonb_build_object('updated_at_epoch',extract(epoch from t.updated_at)))::text,'UTF8')),'hex') from public.wetapp_research_turns t
), relations(relation) as (values ('state'),('conversations'),('messages'),('media'),('research_turns'))
select r.relation,count(h.digest)::bigint as rows,
 encode(sha256(convert_to(coalesce(string_agg(h.digest,'' order by h.digest),''),'UTF8')),'hex') as sha256
from relations r left join row_hashes h on h.relation=r.relation
group by r.relation order by r.relation;
