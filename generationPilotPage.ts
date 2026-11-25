import {createSameKeyVideoRetrieval} from './sameKeyVideoRetrieval.js';
import {createMediaAcceptance,VIDEO_OPTIONS} from './mediaAcceptance.js';
import {quoteVeniceVideo,retrieveVeniceVideo,completeVeniceVideo} from './veniceVideo.js';
import {acceptanceCases,createAcceptanceRunner} from './vpsAcceptance.js';
import {createVpsChatTransport} from './vpsCharacterTransport.js';
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
probe.onclick=()=>void action(async()=>{const r=await fetch('/api/venice-chat?queue=1&job_id=00000000-0000-4000-8000-000000000000',{credentials:'same-origin',cache:'no-store'});const d=await r.json();status.textContent=r.status===404&&d.error==='QUEUE_HTTP_404'?'GATEWAY_AUTH_PASS：已認證連通 VPS，未知任務正確回傳 404。':'GATEWAY_HTTP_'+r.status+' '+(d.error??'');});
submit.onclick=()=>void action(async()=>{result.textContent='';last=null;show(await client.submit({model:el<HTMLSelectElement>('model').value,messages:[{role:'user',content:'請用香港廣東話寫一個約五百字的海邊旅行短故事。'}],max_completion_tokens:2048,venice_parameters:{include_venice_system_prompt:false,disable_thinking:true,strip_thinking_response:true,enable_web_search:'off',enable_web_scraping:false,enable_web_citations:false}}));});
resume.onclick=()=>void action(async()=>show(await client.resume()));
ack.onclick=()=>{if(last){client.acknowledge(last.job_id);last=null;status.textContent='已確認結果；本機任務編號已清除。';update();}};
session().catch(()=>{status.textContent='無法檢查登入狀態。';});

const acceptanceButton=el<HTMLButtonElement>('acceptance-run'),acceptanceReport=el<HTMLElement>('acceptance-report');
const suite=createAcceptanceRunner({storage:localStorage,transport:createVpsChatTransport(),lock:async work=>{if(!navigator.locks)throw Error('WEB_LOCKS_REQUIRED');return navigator.locks.request('aigf-vps-acceptance-v1',work);}});
function renderSuite(){const j=suite.read();acceptanceReport.textContent=acceptanceCases.map((c,i)=>{const row=j.rows[i];return c.title+': '+(row?row.status.toUpperCase()+(row.detail?' — '+row.detail:'')+' ['+row.jobId+']':'未測試');}).join('\n');acceptanceButton.disabled=j.rows.length===acceptanceCases.length&&j.rows.every(r=>r.status!=='pending');}
acceptanceButton.onclick=()=>void action(async()=>{if(!confirm('執行固定合成文字測試，會使用少量 Venice API 額度。不會讀取私人聊天。繼續？'))return;acceptanceButton.disabled=true;try{const deadline=Date.now()+600000;while(Date.now()<deadline){const next=await suite.step();renderSuite();acceptanceButton.disabled=true;if(next==='complete'){status.textContent='綜合驗收完成，請查看及複製報告。';return;}if(next==='pending')await new Promise(r=>setTimeout(r,1800));}status.textContent='測試未完成，按同一按鈕繼續取回，唔會重發原任務。';}finally{renderSuite();}});
try{renderSuite();}catch(e){acceptanceReport.textContent='驗收紀錄無效，請保留原紀錄以供排查。';acceptanceButton.disabled=true;}

const media=createMediaAcceptance({storage:localStorage,lock:async fn=>{if(!navigator.locks)throw Error('WEB_LOCKS_REQUIRED');return navigator.locks.request('aigf-media-acceptance-v1',fn);},retrieveVideo:createSameKeyVideoRetrieval(localStorage),cleanupVideo:j=>completeVeniceVideo(j.model,j.queueId),onProgress:message=>{status.textContent=message;renderMedia();}});
const videoOnly=el<HTMLButtonElement>('video-only');
const mediaButton=el<HTMLButtonElement>('media-run'),mediaReport=el<HTMLElement>('media-report');
function renderMedia(){const r=media.read();const line=(label:string,v:typeof r.image,p:string|null)=>label+': '+(v?'PASS · '+v.size+' bytes · '+v.mime+' · '+(v.cloudSizeEligible?'50 MiB 內':'超出雲端上限')+'\nSHA-256 '+v.sha256:p?'PENDING · '+p:'未測試');mediaReport.textContent=line('圖片',r.image,r.imagePending)+'\n'+line('影片',r.video,r.videoPending);mediaButton.disabled=!!r.image&&!!r.video;videoOnly.disabled=!!r.video;}
mediaButton.onclick=()=>void action(async()=>{
 const state=media.read();let allowVideo=!!state.videoPending;
 if(!state.video&&!state.videoPending){
   const quote=await quoteVeniceVideo(VIDEO_OPTIONS);
   if(!Number.isFinite(quote)||quote<0||quote>5)throw Error('影片報價超出驗收上限或無效；未有提交。');
   if(!confirm('只生成一張測試圖片及一段 5 秒影片。影片報價 US$'+quote+'，圖片另計。繼續？'))return;
   allowVideo=true;
 }else if(!state.image&&!state.imagePending&&!confirm('生成一張測試圖片（會扣費）？'))return;
 mediaButton.disabled=true;
 try{
  const deadline=Date.now()+600000;
  while(Date.now()<deadline){const r=media.read();if(!r.image)await media.imageStep();else if(!r.video)await media.videoStep(allowVideo);else{status.textContent='媒體驗收完成。報告只包含檔案大小及 SHA-256。';return;}renderMedia();mediaButton.disabled=true;await new Promise(r=>setTimeout(r,2500));}
  status.textContent='仍未完成，按原按鈕取回；不會重新生成已提交任務。';
 }finally{renderMedia();}
});
try{renderMedia();}catch{mediaReport.textContent='媒體驗收紀錄無效；保留原紀錄。';mediaButton.disabled=true;}

videoOnly.onclick=()=>void action(async()=>{const r=media.read();if(r.video)return;let allow=!!r.videoPending;if(!allow){const quote=await quoteVeniceVideo(VIDEO_OPTIONS);if(!Number.isFinite(quote)||quote<0||quote>5)throw Error('影片報價無效或超出上限；未提交。');if(!confirm('只生成一段 5 秒 Wan Enhanced 影片（模型固定原生聲音），報價 US$'+quote+'。繼續？'))return;allow=true;}videoOnly.disabled=true;try{const deadline=Date.now()+600000;while(Date.now()<deadline){const next=await media.videoStep(allow);renderMedia();videoOnly.disabled=true;if(next==='done'){status.textContent='影片驗收完成，毋須再生成圖片。';return;}await new Promise(r=>setTimeout(r,2500));}status.textContent='按同一按鈕取回影片，不會重複提交。';}finally{renderMedia();}});

const existingId=el<HTMLInputElement>('existing-video-id'),recoverVideo=el<HTMLButtonElement>('recover-video');
existingId.value=new URLSearchParams(location.search).get('video_id')||'';
recoverVideo.onclick=()=>void action(async()=>{const id=existingId.value.trim(),r=media.read();if(r.video){status.textContent='已有保存影片。';return;}if(r.videoPending&&r.videoPending!==id)throw Error('已有其他影片任務，不能覆蓋。');if(!r.videoPending){if(!confirm('只取回已有 Venice 影片 '+id+'；不會提交生成。繼續？'))return;await media.adoptProviderVideo(id);}renderMedia();recoverVideo.disabled=true;try{const deadline=Date.now()+600000;while(Date.now()<deadline){const next=await media.videoStep(false);renderMedia();if(next==='done'){status.textContent='影片取回及保存 PASS。';return;}await new Promise(r=>setTimeout(r,5000));}status.textContent='仍未完成；可按原按鈕繼續取回。';}finally{recoverVideo.disabled=false;}});
