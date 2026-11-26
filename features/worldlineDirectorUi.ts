import {readDirector,saveDirector} from '../worldlineDirector.js';
import {readFullPromptSettings,writeFullPromptSettings,resolveWorldline2Parts,saveWorldline2Fixed,saveWorldline2Variable,type Worldline2PromptParts} from '../worldline2Prompt.js';
export function openWorldlineDirector(key:string,previewContext?:()=>Worldline2PromptParts,saveToCloud?:(mutate:()=>void)=>Promise<void>){
 const d=document.createElement('dialog');d.className='wl-dialog';d.setAttribute('aria-label','旁白導演');
 const header=document.createElement('div');header.className='wl-header';
 const title=document.createElement('h2');title.textContent='Worldline 2 · 旁白導演';const close=document.createElement('button');close.type='button';close.className='wl-close';close.textContent='×';close.onclick=()=>d.close();header.append(title,close);
 const body=document.createElement('div');body.className='wl-form';
 const hint=document.createElement('p');hint.className='wl-note';hint.textContent='獨立控制敘事節奏、細節、人物反應、氛圍同場景過渡。唔會變成角色對話，唔會改寫之前嘅故事。';
 body.append(hint);
 const initial=readDirector(localStorage,key);
 const status=document.createElement('p');status.className='wl-note';status.setAttribute('aria-live','polite');
 let saving=false;
 const persist=async(mutate:()=>void)=>{if(saving)throw Error('正在保存，請稍候。');saving=true;const buttons=Array.from(d.querySelectorAll('button,input[type=checkbox]')) as (HTMLButtonElement|HTMLInputElement)[];const disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{if(saveToCloud)await saveToCloud(mutate);else mutate();}finally{saving=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);}};
 const settings=readFullPromptSettings(localStorage,key);
 const full=document.createElement('label');full.className='wl-field';
 const title2=document.createElement('span');title2.className='wl-field-label';title2.textContent='每次生成前編輯完整 Prompt';
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=settings.review;
 full.append(title2,toggle);body.append(full);
 const fullHint=document.createElement('p');fullHint.className='wl-note';fullHint.textContent='開啟後，送出故事訊息時會顯示完整 system prompt 編輯器，包括當次重試指令。可修改本輪完整 system prompt；長期設定請保存下方固定 Prompt。';body.append(fullHint);
 toggle.onchange=async()=>{try{const checked=toggle.checked;await persist(()=>writeFullPromptSettings(localStorage,key,{...readFullPromptSettings(localStorage,key),review:checked}));status.textContent='已保存編輯模式。';}catch(e){toggle.checked=readFullPromptSettings(localStorage,key).review;status.textContent=String(e);}};
 const refreshers:(()=>void)[]=[];
 const refresh=()=>{for(const f of refreshers)f();};
 for(const [scope,label,placeholder] of [['next','只限下一輪','例如：留喺目前場景，多寫人物反應，唔好突然跳到第二日。'],['standing','長期生效','例如：細緻描寫氣氛及心理活動，保持故事連續性。']] as const){
  const field=document.createElement('label');field.className='wl-field';const caption=document.createElement('span');caption.className='wl-field-label';caption.textContent=label;
  const input=document.createElement('textarea');input.className='wl-input';input.rows=4;input.maxLength=1500;input.placeholder=placeholder;input.value=initial[scope]?.text||'';
  field.append(caption,input);body.append(field);
  const actions=document.createElement('div');actions.className='wl-actions';
  const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent=scope==='next'?'保存下一輪指令':'保存長期指令';
  const clear=document.createElement('button');clear.type='button';clear.className='wl-button';clear.textContent='清除';
  const apply=async(value:string)=>{try{await persist(()=>{saveDirector(localStorage,key,scope,value);});input.value=value;refresh();status.textContent=value.trim()?label+'指令已保存。':label+'指令已清除。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
  save.onclick=()=>apply(input.value);clear.onclick=()=>apply('');actions.append(clear,save);body.append(actions);
 }
 if(previewContext){
  for(const mode of ['fixed','variable'] as const){
   const details=document.createElement('details');details.className='wl-field';details.open=true;
   const summary=document.createElement('summary');summary.textContent=mode==='fixed'?'固定 Prompt · 長期寫作規則':'Variable Prompt · 每輪動態資料';
   const explanation=document.createElement('p');explanation.className='wl-note';explanation.textContent=mode==='fixed'?'保存後長期使用，不會凍結世界狀態或記憶。':'世界資料、角色、劇情進度、記憶及導演指令每輪重新組合；此欄修改只適用於目前故事輪次，下一輪自動更新。';
   const input=document.createElement('textarea');input.className='wl-input';input.rows=mode==='fixed'?14:18;input.spellcheck=false;input.setAttribute('aria-label',summary.textContent);
   let dirty=false;input.oninput=()=>{dirty=true;};
   const load=(force=false)=>{if(!dirty||force){input.value=resolveWorldline2Parts(localStorage,key,previewContext())[mode];dirty=false;}};
   refreshers.push(()=>load());load();
   const actions=document.createElement('div');actions.className='wl-actions';
   const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent=mode==='fixed'?'保存固定 Prompt':'保存本輪 Variable Prompt';
   const reset=document.createElement('button');reset.type='button';reset.className='wl-button';reset.textContent=mode==='fixed'?'還原預設固定 Prompt':'恢復每輪自動組合';
   const apply=async(value:string|undefined)=>{try{await persist(()=>{if(mode==='fixed')saveWorldline2Fixed(localStorage,key,value);else saveWorldline2Variable(localStorage,key,previewContext().turn,value);});load(true);status.textContent=value===undefined?'已還原預設。':'已保存，下一次生成生效。';}catch(e){status.textContent=String(e);}};
   save.onclick=()=>apply(input.value);reset.onclick=()=>apply(undefined);actions.append(reset,save);details.append(summary,explanation,input,actions);body.append(details);
  }
  const old=readFullPromptSettings(localStorage,key);
  if(old.worldContext!==undefined||old.saved!==undefined){
   const details=document.createElement('details');details.className='wl-field';const summary=document.createElement('summary');summary.textContent='舊版完整 Prompt 備份（已停止自動套用）';details.append(summary);
   const note=document.createElement('p');note.className='wl-note';note.textContent='舊版保存的快照可能包含已過期記憶。原文仍然保留，可將需要的寫作規則複製至固定 Prompt。';details.append(note);
   for(const [label,value] of [['舊世界線 Prompt',old.worldContext],['舊完整 System Prompt',old.saved]] as const){
    if(value===undefined)continue;const caption=document.createElement('label');caption.textContent=label;const input=document.createElement('textarea');input.className='wl-input';input.rows=8;input.value=value;input.setAttribute('aria-label',label);details.append(caption,input);
   }body.append(details);
  }
 }
 body.append(status);d.append(header,body);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
