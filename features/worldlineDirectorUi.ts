import {readDirector,saveDirector} from '../worldlineDirector.js';
import {readFullPromptSettings,writeFullPromptSettings,saveWorldline2Context} from '../worldline2Prompt.js';
export function openWorldlineDirector(key:string,previewContext?:()=>string){
 const d=document.createElement('dialog');d.className='wl-dialog';d.setAttribute('aria-label','旁白導演');
 const header=document.createElement('div');header.className='wl-header';
 const title=document.createElement('h2');title.textContent='Worldline 2 · 旁白導演';const close=document.createElement('button');close.type='button';close.className='wl-close';close.textContent='×';close.onclick=()=>d.close();header.append(title,close);
 const body=document.createElement('div');body.className='wl-form';
 const hint=document.createElement('p');hint.className='wl-note';hint.textContent='獨立控制敘事節奏、細節、人物反應、氛圍同場景過渡。唔會變成角色對話，唔會改寫之前嘅故事。';
 body.append(hint);
 const initial=readDirector(localStorage,key);
 const status=document.createElement('p');status.className='wl-note';status.setAttribute('aria-live','polite');
 const settings=readFullPromptSettings(localStorage,key);
 const full=document.createElement('label');full.className='wl-field';
 const title2=document.createElement('span');title2.className='wl-field-label';title2.textContent='每次生成前編輯完整 Prompt';
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=settings.review;
 full.append(title2,toggle);body.append(full);
 const fullHint=document.createElement('p');fullHint.className='wl-note';fullHint.textContent='開啟後，送出故事訊息時會顯示完整 system prompt 編輯器，包括當次重試指令。可修改、刪除、重寫，或保存首段為之後預設。';body.append(fullHint);
 const clearFull=document.createElement('button');clearFull.type='button';clearFull.className='wl-button';clearFull.textContent='清除已保存的完整 Prompt';
 toggle.onchange=()=>{try{writeFullPromptSettings(localStorage,key,{...readFullPromptSettings(localStorage,key),review:toggle.checked});status.textContent='已保存編輯模式。';}catch(e){status.textContent=String(e);}};
 clearFull.onclick=()=>{try{const current=readFullPromptSettings(localStorage,key);delete current.saved;writeFullPromptSettings(localStorage,key,{...current,review:toggle.checked});status.textContent='已清除完整 System Prompt 預設。';}catch(e){status.textContent=String(e);}};body.append(clearFull);
 const preview=document.createElement('textarea');preview.className='wl-input';preview.rows=18;preview.spellcheck=false;preview.setAttribute('aria-label','完整世界線 Prompt');
 let dirty=false;preview.oninput=()=>{dirty=true;};
 const refresh=(force=false)=>{if(previewContext&&(!dirty||force)){preview.value=readFullPromptSettings(localStorage,key).worldContext??previewContext();dirty=false;}};
 for(const [scope,label,placeholder] of [['next','只限下一輪','例如：留喺目前場景，多寫人物反應，唔好突然跳到第二日。'],['standing','長期生效','例如：細緻描寫氣氛及心理活動，保持故事連續性。']] as const){
  const field=document.createElement('label');field.className='wl-field';const caption=document.createElement('span');caption.className='wl-field-label';caption.textContent=label;
  const input=document.createElement('textarea');input.className='wl-input';input.rows=4;input.maxLength=1500;input.placeholder=placeholder;input.value=initial[scope]?.text||'';
  field.append(caption,input);body.append(field);
  const actions=document.createElement('div');actions.className='wl-actions';
  const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent=scope==='next'?'保存下一輪指令':'保存長期指令';
  const clear=document.createElement('button');clear.type='button';clear.className='wl-button';clear.textContent='清除';
  const apply=(value:string)=>{try{saveDirector(localStorage,key,scope,value);input.value=value;refresh();status.textContent=value.trim()?label+'指令已保存。':label+'指令已清除。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
  save.onclick=()=>apply(input.value);clear.onclick=()=>apply('');actions.append(clear,save);body.append(actions);
 }
 if(previewContext){
  const details=document.createElement('details');details.className='wl-field';details.open=true;
  const summary=document.createElement('summary');summary.textContent='完整世界線 Prompt（可編輯）';
  const explanation=document.createElement('p');explanation.className='wl-note';explanation.textContent='可以修改、刪除或重寫全部文字。保存後以這段文字取代自動組合的世界線上下文，直至還原；期間世界資料、記憶及其他導演指令不會自動更新至此段。其他 system 訊息仍可在送出前編輯。';
  const actions=document.createElement('div');actions.className='wl-actions';
  const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent='保存完整世界線 Prompt';
  const reset=document.createElement('button');reset.type='button';reset.className='wl-button';reset.textContent='還原自動組合';
  save.onclick=()=>{try{saveWorldline2Context(localStorage,key,preview.value);refresh(true);status.textContent='完整世界線 Prompt 已保存，下一輪生效。已清除可能覆蓋此段的完整 System Prompt 預設。';}catch(e){status.textContent=String(e);}};
  reset.onclick=()=>{try{saveWorldline2Context(localStorage,key,undefined);refresh(true);status.textContent='已還原自動組合世界線 Prompt。';}catch(e){status.textContent=String(e);}};
  actions.append(reset,save);refresh();details.append(summary,explanation,preview,actions);body.append(details);
 }
 body.append(status);d.append(header,body);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
