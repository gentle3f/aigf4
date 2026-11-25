// Isolated pilot: persist a job ID before submission; recover by GET only.
export type PilotJobStatus = 'queued'|'running'|'done'|'failed'|'interrupted'|'cancelled';
export type PilotCompletion={model?:string;usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_tokens_details?:{cached_tokens?:number;cache_creation_input_tokens?:number}};choices:{message:{content:string};finish_reason?:string|null}[]};
export type PilotWorkflowResult={version:1|2;parts:string[];polished?:string|null;review:PilotCompletion;stages:{phase:string;model?:string;finish_reason?:string|null;usage?:PilotCompletion['usage']}[]};
export type PilotJob = {job_id:string;status:PilotJobStatus;reused?:boolean;result?:PilotCompletion&{workflow?:PilotWorkflowResult};error?:string};
export type PilotRequest = {model:string;messages:{role:'system'|'user'|'assistant';content:string}[];max_completion_tokens?:number;temperature?:number;top_p?:number;repetition_penalty?:number;stop?:string[];seed?:number;reasoning_effort?:'none';prompt_cache_key?:string;response_format?:import('./venice.js').VeniceJsonSchemaResponseFormat;venice_parameters?:Record<string,boolean|string>};
export type PilotWorkflowRequest={workflow_version:1;primary:PilotRequest;review:PilotRequest}|{workflow_version:2;primary:PilotRequest;review:PilotRequest;polish:PilotRequest};
export type PilotSubmission=PilotRequest|PilotWorkflowRequest;
export type PilotReceipt = {jobId:string;createdAt:number;};
export type PilotStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const KEY='aigfVpsPilotPendingV1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class QueuePilotError extends Error {
  constructor(public code:string,public jobId:string,public httpStatus?:number){super(code);}
}
export function createQueuePilotClient({storage,fetchImpl=fetch,newId=()=>crypto.randomUUID(),now=Date.now}:{storage:PilotStorage;fetchImpl?:typeof fetch;newId?:()=>string;now?:()=>number}) {
  function pending():PilotReceipt|null {
    const raw=storage.getItem(KEY);
    if(!raw)return null;
    const d=JSON.parse(raw);
    if(!UUID.test(d.jobId)||!Number.isFinite(d.createdAt))throw Error('PILOT_RECEIPT_INVALID');
    return d;
  }
  async function request(jobId:string,method:'GET'|'POST',payload?:PilotRequest):Promise<PilotJob>{
    let r:Response;
    try {r=await fetchImpl(method==='POST'?'/api/venice-chat?queue=1':'/api/venice-chat?queue=1&job_id='+encodeURIComponent(jobId),{
      method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
      ...(payload?{body:JSON.stringify({job_id:jobId,request:payload})}:{})
    });} catch {throw new QueuePilotError('QUEUE_TRANSPORT_UNCERTAIN',jobId);}
    if(!r.ok)throw new QueuePilotError('QUEUE_HTTP_'+r.status,jobId,r.status);
    let d:PilotJob;
    try{d=await r.json();}catch{throw new QueuePilotError('INVALID_QUEUE_RESPONSE',jobId);}
    if(d.job_id!==jobId||!['queued','running','done','failed','interrupted','cancelled'].includes(d.status))throw new QueuePilotError('INVALID_QUEUE_RESPONSE',jobId);
    return d;
  }
  return {
    pending,
    async submit(payload:PilotRequest){
      if(pending())throw Error('PILOT_JOB_ALREADY_PENDING');
      const jobId=newId();
      if(!UUID.test(jobId))throw Error('INVALID_JOB_ID');
      // Storage failure stops submission; never create a server job without a local receipt.
      storage.setItem(KEY,JSON.stringify({jobId,createdAt:now()}));
      return request(jobId,'POST',payload);
    },
    async resume(){const receipt=pending();return receipt?request(receipt.jobId,'GET'):null;},
    acknowledge(jobId:string){if(pending()?.jobId!==jobId)throw Error('PILOT_RECEIPT_MISMATCH');storage.removeItem(KEY);},
  };
}
