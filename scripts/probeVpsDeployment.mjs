// Read-only deployment diagnostic. Never print credentials, receipt contents, or upstream body.
import {createGenerationHandler} from '../server/generationJobs.js';
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/aigf-worldline2-vps-integration-20261126'){
 const handler=createGenerationHandler({authenticate:()=>true});
 const call=async(query)=>{
  let status=0,data;
  await handler({method:'GET',query},{setHeader(){},status(n){status=n;return this;},json(d){data=d;return this;}});
  return {status,error:typeof data?.error==='string'&&/^[A-Z_0-9]+$/.test(data.error)?data.error:undefined,receiptCount:Array.isArray(data?.receipts)?data.receipts.length:undefined};
 };
 try{
  console.log('AIGF_DEPLOY_PROBE',JSON.stringify({unknownJob:await call({job_id:'00000000-0000-4000-8000-000000000000'}),recovery:await call({recovery:'1'})}));
 }catch(e){console.log('AIGF_DEPLOY_PROBE_FAILED',e?.name||'Error');}
}
