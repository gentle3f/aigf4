// Read-only deployment diagnostic. Never print credentials, receipt contents, or upstream body.
import {createGenerationHandler} from '../server/generationJobs.js';
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/aigf-worldline2-vps-integration-20261126'){
 const handler=createGenerationHandler({authenticate:()=>true});
 const call=async(query)=>{
  let status=0,data;
  await handler({method:'GET',query},{setHeader(){},status(n){status=n;return this;},json(d){data=d;return this;}});
  return {status,data};
 };
 const safe=({status,data})=>({status,error:typeof data?.error==='string'&&/^[A-Z_0-9 ;a-z]+$/.test(data.error)?data.error:undefined});
 try{
  const recovery=await call({recovery:'1'});
  const jobs=[];
  for(const row of (recovery.data?.receipts||[]).slice(0,10)){
   const j=await call({job_id:row.receipt.jobId});
   jobs.push({ageMinutes:Math.round((Date.now()-row.receipt.createdAt)/60000),listedStatus:row.status,world:!!row.receipt.worldDigest,group:!!row.receipt.roomDigest,workflow:row.receipt.workflowVersion,contextVersion:row.receipt.contextDigestVersion,job:safe(j),jobStatus:j.data?.status,visibleReply:!!j.data?.result?.choices?.[0]?.message?.content,hasWorkflow:!!j.data?.result?.workflow});
  }
  console.log('AIGF_DEPLOY_PROBE',JSON.stringify({recovery:safe(recovery),jobs}));
 }catch(e){console.log('AIGF_DEPLOY_PROBE_FAILED',e?.name||'Error');}
}
