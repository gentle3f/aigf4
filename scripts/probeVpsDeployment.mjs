// Preview build-only probe. Never print credentials, real chat contents, or receipt IDs.
import {createGenerationHandler} from '../server/generationJobs.js';
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/aigf-worldline2-vps-integration-20261126'){
 const handler=createGenerationHandler({authenticate:()=>true});
 const call=async(method,query,body)=>{
  let status=0,data;
  await handler({method,query,body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;return this;}});
  return {status,data};
 };
 try{
  const recovery=await call('GET',{recovery:'1'});
  const id='b661407a-66f5-4cc2-bfbf-1a8eadc36c91';
  let j=await call('GET',{job_id:id});
  let submitted=null;
  if(j.status===404){
   const first=await call('POST',{}, {job_id:id,request:{model:'glm-5-3-flash-uncensored',messages:[{role:'user',content:'Reply with the single word READY.'}],max_completion_tokens:32}});
   submitted={http:first.status,status:first.data?.status,error:first.data?.error};
  }
  for(let i=0;i<12;i++){
   j=await call('GET',{job_id:id});
   if(!['queued','running'].includes(j.data?.status))break;
   await new Promise(r=>setTimeout(r,1000));
  }
  console.log('AIGF_LIVE_QUEUE_PROBE',JSON.stringify({recoveryHttp:recovery.status,submitted,independentGetHttp:j.status,jobStatus:j.data?.status,error:j.data?.error,visibleReply:!!j.data?.result?.choices?.[0]?.message?.content}));
 }catch(e){console.log('AIGF_LIVE_QUEUE_PROBE_FAILED',e?.name||'Error');}
}
