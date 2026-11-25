import {createQueuePilotClient} from './generationQueuePilot';
import type {PilotJob} from './generationQueuePilot';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const login=el<HTMLElement>('login'),panel=el<HTMLElement>('panel'),status=el<HTMLElement>('status'),result=el<HTMLElement>('result');
const submit=el<HTMLButtonElement>('submit'),resume=el<HTMLButtonElement>('resume'),ack=el<HTMLButtonElement>('ack'),probe=el<HTMLButtonElement>('probe');
const client=createQueuePilotClient({storage:localStorage});
let last: PilotJob|null=null;
let busy=false;
const update=()=>{const p=client.pending();submit.disabled=busy||!!p;resume.disabled=busy||!p;probe.disabled=busy;ack.disabled=busy||!p||!last||last.job_id!==p.jobId||!['done','failed','interrupted','cancelled'].includes(last.status);};
const show=(j:PilotJob|null)=>{if(!j){status.textContent='未有待處理任務';return;}last=j;status.textContent='Job ID: '+j.job_id+'\n狀態: '+j.status+(j.error?'\n'+j.error:'');result.textContent=j.result?.choices?.[0]?.message?.content??'';};
async function action(fn:()=>Promise<void>){if(busy)return;busy=true;update();try{await fn();}catch(e){status.textContent=e instanceof Error?e.message:'REQUEST_FAILED';const p=client.pending();if(p)status.textContent+='\n保留 Job ID: '+p.jobId+'；請取回，唔好重複生成。';}finally{busy=false;update();}}
async function session(){const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});const d=await r.json();login.hidden=!!d.authenticated;panel.hidden=!d.authenticated;if(d.authenticated){status.textContent=client.pending()?'有原有任務，請按取回。':'已登入，請先檢查 Gateway。';update();}else status.textContent='請先登入。';}
el<HTMLFormElement>('unlock').addEventListener('submit',async e=>{e.preventDefault();const pw=el<HTMLInputElement>('password');try{const r=await fetch('/api/unlock',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({password:pw.value})});pw.value='';if(!r.ok)throw Error('登入失敗');await session();}catch(e){status.textContent=e instanceof Error?e.message:'登入失敗';}});
probe.onclick=()=>void action(async()=>{const r=await fetch('/api/generation-jobs?job_id=00000000-0000-4000-8000-000000000000',{credentials:'same-origin',cache:'no-store'});const d=await r.json();status.textContent=r.status===404&&d.error==='QUEUE_HTTP_404'?'GATEWAY_AUTH_PASS：已認證連通 VPS，未知任務正確回傳 404。':'GATEWAY_HTTP_'+r.status+' '+(d.error??'');});
submit.onclick=()=>void action(async()=>{result.textContent='';last=null;show(await client.submit({model:el<HTMLSelectElement>('model').value,messages:[{role:'user',content:'請用香港廣東話寫一個約五百字的海邊旅行短故事。'}],max_completion_tokens:2048,venice_parameters:{include_venice_system_prompt:false,disable_thinking:true,strip_thinking_response:true,enable_web_search:'off',enable_web_scraping:false,enable_web_citations:false}}));});
resume.onclick=()=>void action(async()=>show(await client.resume()));
ack.onclick=()=>{if(last){client.acknowledge(last.job_id);last=null;status.textContent='已確認結果；本機任務編號已清除。';update();}};
session().catch(()=>{status.textContent='無法檢查登入狀態。';});
