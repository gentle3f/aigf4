import type {VeniceMessage} from './venice.js';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type PromptSettings={review:boolean;saved?:string;worldContext?:string;fixedPrompt?:string;variableOverride?:{turn:number;text:string}};
const key=(world:string)=>'aigfWorldline2FullPrompt:'+world;
export function readFullPromptSettings(store:Store,world:string):PromptSettings{
 try{
  const raw=store.getItem(key(world));const v=raw?JSON.parse(raw):{};const variable=v.variableOverride;
  return {review:v.review!==false,...(typeof v.saved==='string'?{saved:v.saved}:{}),...(typeof v.worldContext==='string'?{worldContext:v.worldContext}:{}),...(typeof v.fixedPrompt==='string'?{fixedPrompt:v.fixedPrompt}:{}),...(Number.isSafeInteger(variable?.turn)&&typeof variable?.text==='string'?{variableOverride:{turn:variable.turn,text:variable.text}}:{})};
 }catch{return {review:true};}
}
export function writeFullPromptSettings(store:Store,world:string,value:PromptSettings){store.setItem(key(world),JSON.stringify(value));}
export type Worldline2PromptParts={fixed:string;variable:string;turn:number};
export function resolveWorldline2Parts(store:Store,world:string,generated:Worldline2PromptParts):Worldline2PromptParts{
 const s=readFullPromptSettings(store,world);
 return {...generated,fixed:s.fixedPrompt??generated.fixed,variable:s.variableOverride?.turn===generated.turn?s.variableOverride.text:generated.variable};
}
export function composeWorldline2Parts(parts:Worldline2PromptParts):string{return [parts.fixed,parts.variable].filter(Boolean).join('\n\n');}
export function saveWorldline2Fixed(store:Store,world:string,value:string|undefined){
 const s=readFullPromptSettings(store,world);
 if(value===undefined)delete s.fixedPrompt;else s.fixedPrompt=value;
 writeFullPromptSettings(store,world,s);
}
export function saveWorldline2Variable(store:Store,world:string,turn:number,value:string|undefined){
 const s=readFullPromptSettings(store,world);
 if(value===undefined)delete s.variableOverride;else s.variableOverride={turn,text:value};
 writeFullPromptSettings(store,world,s);
}
export function applySystemTexts(messages:readonly VeniceMessage[],texts:readonly string[]):VeniceMessage[]{
 let i=0;return messages.map(m=>m.role==='system'?{...m,content:texts[i++]??m.content}:m);
}
export function getSystemTexts(messages:readonly VeniceMessage[]):string[]{
 return messages.filter(m=>m.role==='system').map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content));
}
export async function editWorldline2Request(world:string,messages:VeniceMessage[],signal?:AbortSignal):Promise<VeniceMessage[]>{
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const settings=readFullPromptSettings(localStorage,world);
 const defaults=getSystemTexts(messages);
 if(!defaults.length)return messages;
 const texts=[...defaults];
 if(!settings.review)return applySystemTexts(messages,texts);
 return new Promise<VeniceMessage[]>((resolve,reject)=>{
  const d=document.createElement('dialog');d.className='wl-dialog';d.setAttribute('aria-label','Worldline 2 完整 Prompt');
  const header=document.createElement('div');header.className='wl-header';
  const title=document.createElement('h2');title.textContent='Worldline 2 · 完整 Prompt';
  const close=document.createElement('button');close.type='button';close.className='wl-close';close.textContent='×';header.append(title,close);
  const body=document.createElement('div');body.className='wl-form';
  const hint=document.createElement('p');hint.className='wl-note';hint.textContent='以下是當次旁白請求所有 system 訊息。可編輯、清空或重寫。聊天紀錄及本輪玩家訊息另行傳送。';body.append(hint);
  const fields=texts.map((text,i)=>{const label=document.createElement('label');label.className='wl-field';const caption=document.createElement('span');caption.className='wl-field-label';caption.textContent=i===0?'完整 System Prompt':'額外 System Prompt '+(i+1);const input=document.createElement('textarea');input.className='wl-input';input.rows=i===0?18:8;input.value=text;input.spellcheck=false;label.append(caption,input);body.append(label);return input;});
  const status=document.createElement('p');status.className='wl-note';status.setAttribute('aria-live','polite');
  const actions=document.createElement('div');actions.className='wl-actions';
  const make=(label:string,primary=false)=>{const b=document.createElement('button');b.type='button';b.className='wl-button'+(primary?' wl-primary':'');b.textContent=label;actions.append(b);return b;};
  const reset=make('載入本輪原始 Prompt');const cancel=make('取消生成');const send=make('本輪送出',true);
  const note=document.createElement('p');note.className='wl-note';note.textContent='此處修改只用於本次請求；長期修改請在旁白導演保存固定 Prompt，以免凍結動態記憶。';
  body.append(actions,note,status);d.append(header,body);document.body.append(d);
  let settled=false;
  const cleanup=()=>{signal?.removeEventListener('abort',abort);if(d.open)d.close();d.remove();};
  const abort=()=>{if(settled)return;settled=true;cleanup();reject(new DOMException('Cancelled','AbortError'));};
  const finish=()=>{if(settled)return;const values=fields.map(f=>f.value);settled=true;cleanup();resolve(applySystemTexts(messages,values));};
  reset.onclick=()=>{fields.forEach((f,i)=>f.value=defaults[i]);status.textContent='已還原本輪組合。';};
  close.onclick=abort;cancel.onclick=abort;send.onclick=finish;
  d.addEventListener('cancel',e=>{e.preventDefault();abort();});d.addEventListener('close',abort,{once:true});signal?.addEventListener('abort',abort,{once:true});
  try{d.showModal();if(signal?.aborted)abort();}catch(e){settled=true;cleanup();reject(e);}
 });
}
