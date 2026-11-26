import {readDirector,saveDirector} from '../worldlineDirector.js';
import {readFullPromptSettings,writeFullPromptSettings} from '../worldline2Prompt.js';
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
 clearFull.onclick=()=>{try{writeFullPromptSettings(localStorage,key,{review:toggle.checked});status.textContent='已還原自動組合 Prompt。';}catch(e){status.textContent=String(e);}};body.append(clearFull);
 const preview=document.createElement('textarea');preview.className='wl-input';preview.rows=12;preview.readOnly=true;preview.setAttribute('aria-label','世界線上下文預覽');
 const refresh=()=>{if(previewContext)preview.value=previewContext();};
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
 if(previewContext){const details=document.createElement('details');details.className='wl-field';const summary=document.createElement('summary');summary.textContent='查看世界線上下文（唯讀）';const explanation=document.createElement('p');explanation.className='wl-note';explanation.textContent='目前世界設定、記憶及已保存指令的預覽；不等於下一次完整模型請求，未包含未來輸入、其他聊天引擎或供應商指令。';refresh();details.append(summary,explanation,preview);body.append(details);}
 body.append(status);d.append(header,body);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
