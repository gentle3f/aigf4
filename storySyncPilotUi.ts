import {createStoryCheckpointSupabaseTransport} from './storyCheckpointSupabaseTransport.js';
import {createStoryCheckpointSession} from './storyCheckpointSession.js';
import {captureStorySnapshot,restoreStorySnapshot,type StorySnapshotV2} from './storySnapshotLab.js';
import {WORLDLINE_SETTING_KEY,makeWorldline,getWorldline,updateWorldlineRegistry,recordWorldlineTurn,buildWorldlinePrompt} from './worldline.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import {digestVpsHistory} from './vpsChatMode.js';
import {createVpsChatTransport} from './vpsCharacterTransport.js';
import {buildVpsWorkflowPayload,decodeVpsWorkflow} from './vpsWorkflow.js';
import {listVpsRecovery} from './vpsRecovery.js';
import {normalizeHongKongTraditional} from './traditionalChinese.js';
import type {TurnReceipt} from './durableChatTurn.js';
import type {ChatMessage} from './managers.js';
import type {VeniceMessage} from './venice.js';

const site='worldline2' as const,key='aigf-sync-pilot-'+site;
const projectUrl='https://hmrcvjxdmedrjjcjbtmd.supabase.co',productionUrl='https://ebinyocojscfnxskybax.supabase.co';
const publishableKey=String(import.meta.env?.VITE_AIGF_SYNC_PILOT_KEY||'');
export const STORY_SYNC_PILOT_ENABLED=import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT==='1'&&!!publishableKey;
const equal=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const digest=(x:unknown)=>hashContextJson(canonicalContextJson(x));
const storage={getItem:(k:string)=>localStorage.getItem('isolated-sync-pilot:'+k),setItem:(k:string,v:string)=>localStorage.setItem('isolated-sync-pilot:'+k,v),removeItem:(k:string)=>localStorage.removeItem('isolated-sync-pilot:'+k)};
const receiptKey='queue:'+site;
const lock=async<T>(fn:()=>Promise<T>)=>{if(!navigator.locks)throw Error('WEB_LOCKS_REQUIRED');return navigator.locks.request('aigf-isolated-sync-pilot:'+site,fn);};
const button=(label:string)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:8px 12px;border:1px solid #aaa;border-radius:6px;color:#171717;background:#fff;cursor:pointer';return b;};

export function openStorySyncPilot(getModel:()=>string|null=()=> 'glm-5-3-flash-uncensored'){
 if(!STORY_SYNC_PILOT_ENABLED)throw Error('SYNC_PILOT_DISABLED');
 if(document.getElementById('aigf-story-sync-pilot'))return;
 const remote=createStoryCheckpointSupabaseTransport<StorySnapshotV2>({projectUrl,productionUrl,enabled:true,publishableKey});
 const queue=createVpsChatTransport();
 let history:ChatMessage[]=[],signedIn=false,busy=false,closed=false;
 let pollTimer:ReturnType<typeof setTimeout>|undefined;
 const map=new Map<string,string>();
 const worldStore={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};
 const capture=()=>captureStorySnapshot(worldStore,key,history);
 const session=createStoryCheckpointSession({site,storage,transport:remote.transport,history:()=>history,capture,deviceId:crypto.randomUUID(),lock});
 const dialog=document.createElement('dialog');dialog.id='aigf-story-sync-pilot';dialog.style.cssText='width:min(96vw,760px);height:min(86dvh,800px);max-height:86dvh;overflow:auto;padding:18px;color:#252321;background:#f9f8f5;border:1px solid #d9d5ce;border-radius:18px;color-scheme:light';
 const title=document.createElement('h3');title.textContent='古塔 · 同步試用';title.style.cssText='font-size:20px;font-weight:600;margin:0 0 8px';
 const intro=document.createElement('p');intro.textContent='獨立測試故事 · VPS 背景生成 · 不影響原有聊天';intro.style.cssText='font-size:12px;color:#777';
 const email=document.createElement('input');email.type='email';email.placeholder='測試資料庫登入電郵';email.autocomplete='username';
 const password=document.createElement('input');password.type='password';password.placeholder='測試帳戶密碼';password.autocomplete='current-password';
 for(const el of [email,password])el.style.cssText='display:block;width:100%;margin:8px 0;padding:8px;color:#171717;background:#fff;border:1px solid #aaa;border-radius:4px';
 const login=button('登入測試資料庫'),load=button('同步／重新讀取'),send=button('發送'),resume=button('取回 VPS 回覆'),recall=button('收回最新一輪'),close=button('關閉');
 const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='white-space:pre-wrap;color:#333';
 const transcript=document.createElement('div');transcript.setAttribute('role','log');transcript.style.cssText='display:flex;flex-direction:column;gap:14px;padding:12px 2px;min-height:180px;max-height:48dvh;overflow:auto;color:#252321';
 const input=document.createElement('textarea');input.placeholder='輸入訊息…';input.rows=2;input.style.cssText='flex:1;min-width:0;padding:12px;border:1px solid #dfdcd6;border-radius:16px;background:#fff;color:#252321;resize:vertical';
 const composer=document.createElement('div');composer.style.cssText='display:flex;gap:8px;align-items:center;margin-top:12px';composer.append(input,send);
 const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:10px 0';actions.append(load,resume,recall,close);
 const setStatus=(s:string)=>{status.textContent=s;};
 const render=()=>{const nearBottom=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<80;transcript.replaceChildren();if(!history.length){const p=document.createElement('p');p.textContent='故事從這裏開始。';p.style.cssText='text-align:center;color:#888;font-size:13px';transcript.append(p);}for(const m of history){const bubble=document.createElement('div');bubble.textContent=m.content.text||'';bubble.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:88%;padding:11px 15px;border-radius:16px;line-height:1.65;font-size:14px;'+(m.role==='user'?'align-self:flex-end;background:#e1eae2;color:#24372b':'align-self:flex-start;background:#fff;color:#252321;border:1px solid #e8e5df');transcript.append(bubble);}if(nearBottom)transcript.scrollTop=transcript.scrollHeight;};
 const enable=()=>{login.disabled=busy||signedIn;for(const b of [load,resume,recall])b.disabled=busy||!signedIn;send.disabled=busy||!signedIn||!!lastUser()||!input.value.trim();input.disabled=!signedIn;};
 const run=(fn:()=>Promise<void>)=>{if(busy||closed)return;busy=true;enable();void fn().catch(e=>setStatus('操作未完成：'+(e instanceof Error?e.message:'UNKNOWN')+'。不會自動重複生成。')).finally(()=>{busy=false;if(!closed){enable();render();schedulePoll();}});};
 const reload=async()=>{
  const pending=session.pending();
  if(pending){const outcome=await session.recover();if(outcome!=='confirmed')throw Error('CHECKPOINT_'+outcome);}
  const view=await session.load(key);
  if(view.stale)throw Error('STORY_SNAPSHOT_STALE');
  const rows:ChatMessage[]=view.rows.map(r=>({id:r.message_id,createdAt:r.created_at_ms,role:r.role as ChatMessage['role'],speakerId:r.speaker_id||undefined,content:r.content}));
  // Rebuild from remote into isolated memory only.
  map.clear();history=rows;
  if(view.snapshot)await restoreStorySnapshot(worldStore,key,history,view.snapshot);
  else{
   if(history.length)throw Error('STORY_SNAPSHOT_MISSING');
   const w=makeWorldline(key,{title:'古塔同步測試',genre:'fantasy',premise:'旅人探索古塔，記錄沿途發現。'},1000);
   worldStore.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(null,key,w,1000)));
  }
  render();return view;
 };
 const context=async()=>({contextDigest:await digestVpsHistory(history,2),worldDigest:await digest(await capture())});
 const lastUser=()=>{const last=history.at(-1);return last?.role==='user'?last:null;};
 login.onclick=()=>run(async()=>{const pwd=password.value;password.value='';await remote.signIn(email.value.trim(),pwd);await remote.initialize(site);await reload();signedIn=true;email.hidden=true;password.hidden=true;login.hidden=true;setStatus('已同步');if(lastUser())await resumePending(true);});
 load.onclick=()=>run(async()=>{await reload();setStatus('已同步雲端故事。');});
 send.onclick=()=>run(async()=>{
  const text=input.value.trim();if(!text)return;
  const model=getModel();if(!model)throw Error('請在原有模型設定選擇支援 VPS 的模型');
  await reload();if(lastUser())throw Error('已有待處理訊息，請先取回回覆或收回');
  const baseline=await session.begin(key,true);
  const user:ChatMessage={id:crypto.randomUUID(),role:'user',createdAt:Date.now(),content:{text}};
  history=[...history,user];
  if(await session.commit(baseline,{kind:'user',id:user.id!})!=='confirmed')throw Error('USER_SYNC_NOT_CONFIRMED');
  if(input.value.trim()===text)input.value='';render();setStatus('已同步訊息 · 正在提交背景生成');
  const c=await context(),w=getWorldline(worldStore.getItem(WORLDLINE_SETTING_KEY),key)!;
  const system=buildWorldlinePrompt(w);
  const messages:VeniceMessage[]=history.map(m=>({role:m.role==='model'?'assistant':'user',content:m.content.text||''}));
  const payload=buildVpsWorkflowPayload({model,messages:[{role:'system',content:system},...messages],maxCompletionTokens:400,temperature:.7,stop:[]},{editorPrompt:'Review the narrative for continuity and natural Traditional Chinese. Return the required strict review JSON.',authoritativePrompt:system,reviewHistory:messages.slice(0,-1),latestUserMessage:user.content.text!,promptCacheKey:'wetapp-review-v1-syncpilot'});
  const receipt:TurnReceipt={conversationKey:key,personaKey:key,userMessageId:user.id!,jobId:crypto.randomUUID(),replyId:crypto.randomUUID(),createdAt:Date.now(),model:payload.primary.model,workflowVersion:payload.workflow_version,contextDigestVersion:2,...c};
  storage.setItem(receiptKey,JSON.stringify(receipt));
  if(storage.getItem(receiptKey)!==JSON.stringify(receipt))throw Error('RECEIPT_NOT_DURABLE');
  const job=await queue.submit(receipt.jobId,payload,receipt);
  setStatus('VPS 任務已提交：'+job.status+'。可以關閉網站，之後在另一部裝置登入並取回。');
 });
 const resumePending=async(alreadyLoaded=false)=>{
  if(!alreadyLoaded)await reload();const user=lastUser();if(!user){setStatus('沒有待處理訊息。');return;}
  const c=await context();
  const matches=(r:TurnReceipt)=>r.conversationKey===key&&r.personaKey===key&&r.userMessageId===user.id&&r.contextDigestVersion===2&&r.contextDigest===c.contextDigest&&r.worldDigest===c.worldDigest&&r.workflowVersion===1;
  const localRaw=storage.getItem(receiptKey),local=localRaw?JSON.parse(localRaw) as TurnReceipt:null;
  const remoteRows=(await listVpsRecovery()).filter(row=>matches(row.receipt));
  const receipts=new Map(remoteRows.map(row=>[row.receipt.jobId,row.receipt]));
  if(local&&matches(local))receipts.set(local.jobId,local);
  if(!receipts.size){setStatus('等待 VPS 任務確認…');return;}
  if(receipts.size!==1)throw Error('MULTIPLE_MATCHING_JOBS');
  const r=[...receipts.values()][0],job=await queue.get(r.jobId);
  if(job.status!=='done'){setStatus(['queued','running'].includes(job.status)?'旁白正在背景生成…':'任務狀態：'+job.status+'。可收回此輪。');return;}
  const result=decodeVpsWorkflow(job);
  const raw=result.decision.decision==='revise'?result.decision.revisedResponse:result.polished||result.parts.join('\n');
  if(typeof raw!=='string'||!raw.trim())throw Error('EMPTY_REPLY');
  const baseline=await session.begin(key);
  const w=getWorldline(worldStore.getItem(WORLDLINE_SETTING_KEY),key)!;
  const reply:ChatMessage={id:r.replyId,role:'model',createdAt:r.createdAt+1,content:{text:normalizeHongKongTraditional(raw),worldlineStoryTurn:true}};
  history=[...history,reply];
  worldStore.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(worldStore.getItem(WORLDLINE_SETTING_KEY),key,recordWorldlineTurn(w,user.content.text||'',reply.content.text!,reply.createdAt,reply.id),reply.createdAt)));
  if(await session.commit(baseline,{kind:'reply',id:r.replyId,userId:r.userMessageId})!=='confirmed')throw Error('REPLY_SYNC_NOT_CONFIRMED');
  storage.removeItem(receiptKey);
  setStatus('已同步');
 };
 resume.onclick=()=>run(()=>resumePending());
 function schedulePoll(){if(pollTimer)clearTimeout(pollTimer);if(!signedIn||closed)return;pollTimer=setTimeout(()=>{if(closed)return;if(document.visibilityState!=='visible'||busy){schedulePoll();return;}run(async()=>{await reload();if(lastUser())await resumePending(true);else setStatus('已同步');});},8000);}
 input.addEventListener('input',enable);
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!send.disabled)send.click();}});
 recall.onclick=()=>run(async()=>{
  await reload();const user=[...history].reverse().find(m=>m.role==='user');if(!user?.id){setStatus('沒有可收回訊息。');return;}
  const baseline=await session.begin(key);
  history=history.slice(0,history.findIndex(m=>m.id===user.id));
  if(await session.commit(baseline,{kind:'recall',userId:user.id})!=='confirmed')throw Error('RECALL_SYNC_NOT_CONFIRMED');
  storage.removeItem(receiptKey);setStatus('已收回最新一輪；舊任務不可寫回。');
 });
 close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{closed=true;if(pollTimer)clearTimeout(pollTimer);document.removeEventListener('visibilitychange',onVisible);password.value='';dialog.remove();});
 const onVisible=()=>{if(signedIn&&!closed&&!busy&&document.visibilityState==='visible')run(async()=>{await reload();if(lastUser())await resumePending(true);else setStatus('已同步');});};
 document.addEventListener('visibilitychange',onVisible);
 dialog.append(title,intro,email,password,login,actions,status,transcript,composer);document.body.append(dialog);enable();render();dialog.showModal();
}
