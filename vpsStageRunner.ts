import type {TurnReceipt,TurnStage} from './durableChatTurn.js';
import type {PilotJob,PilotRequest} from './generationQueuePilot.js';
export async function runDurableChatStage(input:{
 parent:TurnReceipt; phase:TurnStage;payload:PilotRequest;signal:AbortSignal;
 stage:(parent:TurnReceipt,phase:TurnStage,payload:PilotRequest)=>Promise<PilotJob>;
 verifyContext:()=>Promise<void>;onPending?:()=>void;
 now?:()=>number;delay?:(ms:number)=>Promise<void>;timeoutMs?:number;
}):Promise<PilotJob>{
 const now=input.now??Date.now,delay=input.delay??(ms=>new Promise<void>(r=>setTimeout(r,ms)));
 const deadline=now()+(input.timeoutMs??300000);
 const check=async()=>{if(input.signal.aborted)throw new DOMException('Aborted','AbortError');await input.verifyContext();if(input.signal.aborted)throw new DOMException('Aborted','AbortError');};
 await check();
 let job=await input.stage(input.parent,input.phase,input.payload);
 while(job.status==='queued'||job.status==='running'||(job.status==='done'&&!job.result)){
   await check();if(now()>=deadline)throw Error('VPS_STAGE_PENDING');
   input.onPending?.();await delay(1600);await check();
   if(now()>=deadline)throw Error('VPS_STAGE_PENDING');
   job=await input.stage(input.parent,input.phase,input.payload);
 }
 await check();
 if(job.status!=='done'||!job.result?.choices?.[0]?.message?.content?.trim())throw Error('VPS_STAGE_'+job.status.toUpperCase());
 return job;
}
