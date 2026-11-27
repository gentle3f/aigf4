// Read-only deployment diagnostic. No model request, no chat content or credentials logged.
import {createGenerationHandler} from '../server/generationJobs.js';
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/aigf-worldline2-vps-integration-20261126'){
 const handler=createGenerationHandler({authenticate:()=>true});let status=0,data;
 await handler({method:'GET',query:{job_id:'6c19f77c-a678-4b6e-9bc7-3c92bf2888b1'}},{setHeader(){},status(n){status=n;return this;},json(d){data=d;return this;}});
 const error=typeof data?.error==='string'&&/^[A-Z0-9_]+(?:; no automatic retry)?$/.test(data.error)?data.error:null;
 console.log('AIGF_V4_FAILED_JOB_DIAGNOSTIC',JSON.stringify({http:status,status:data?.status,error}));
}
