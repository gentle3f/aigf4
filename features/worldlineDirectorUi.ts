import {readDirector,saveDirector,effectiveNarrativeStyle,NARRATIVE_STYLE_PRESETS,CREATIVE_SECTIONS,effectiveCreativeSection,formatDirector,effectiveDirectorPreface} from '../worldlineDirector.js';
export function openWorldlineDirector(key:string,saveToCloud?:(mutate:()=>void)=>Promise<void>){
 const d=document.createElement('dialog');d.className='wl-dialog';d.setAttribute('aria-label','旁白設定');
 const header=document.createElement('div');header.className='wl-header';
 const title=document.createElement('h2');title.textContent='旁白設定 · Prompt Studio V3';const close=document.createElement('button');close.type='button';close.className='wl-close';close.textContent='×';close.onclick=()=>d.close();header.append(title,close);
 const body=document.createElement('div');body.className='wl-form';
 const hint=document.createElement('p');hint.className='wl-note';hint.textContent='獨立控制敘事節奏、細節、人物反應、氛圍同場景過渡。唔會變成角色對話，唔會改寫之前嘅故事。';
 body.append(hint);
 let saving=false;
 const persist=async(mutate:()=>void)=>{if(saving)throw Error('正在保存，請稍候。');saving=true;const buttons=Array.from(d.querySelectorAll('button'));const old=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{if(saveToCloud)await saveToCloud(mutate);else mutate();}finally{saving=false;buttons.forEach((b,i)=>b.disabled=old[i]);}};
 const initial=readDirector(localStorage,key);
 const status=document.createElement('p');status.className='wl-note';status.setAttribute('aria-live','polite');
 const preview=document.createElement('textarea');preview.className='wl-input';preview.rows=10;preview.readOnly=true;preview.setAttribute('aria-label','已保存的旁白創作指令');
 const refreshPreview=()=>{preview.value=formatDirector(readDirector(localStorage,key));};
 const intro=document.createElement('label');intro.className='wl-field';
 const introLabel=document.createElement('span');introLabel.className='wl-field-label';introLabel.textContent='旁白總則（創作導言）';
 const introInput=document.createElement('textarea');introInput.className='wl-input';introInput.rows=5;introInput.maxLength=1500;introInput.value=effectiveDirectorPreface(initial);
 intro.append(introLabel,introInput);body.append(intro);
 const introHelp=document.createElement('p');introHelp.className='wl-note';introHelp.textContent='自訂旁白創作方向及寫作目的。固定運作規則另行保留。';body.append(introHelp);
 const introActions=document.createElement('div');introActions.className='wl-actions';
 const introReset=document.createElement('button');introReset.type='button';introReset.className='wl-button';introReset.textContent='還原預設導言';
 const introSave=document.createElement('button');introSave.type='button';introSave.className='wl-button wl-primary';introSave.textContent='保存旁白導言';
 const applyIntro=async(value:string)=>{try{await persist(()=>{saveDirector(localStorage,key,'preface',value);});introInput.value=effectiveDirectorPreface(readDirector(localStorage,key));refreshPreview();status.textContent='旁白導言已保存。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
 introReset.onclick=()=>applyIntro('');introSave.onclick=()=>applyIntro(introInput.value);introActions.append(introReset,introSave);body.append(introActions);
 const styleField=document.createElement('label');styleField.className='wl-field';
 const styleCaption=document.createElement('span');styleCaption.className='wl-field-label';styleCaption.textContent='核心寫作設定';
 const styleInput=document.createElement('textarea');styleInput.className='wl-input';styleInput.rows=6;styleInput.maxLength=1500;styleInput.value=effectiveNarrativeStyle(initial);
 const presets=document.createElement('select');presets.className='wl-input';presets.setAttribute('aria-label','文風範本');
 const custom=document.createElement('option');custom.value='';custom.textContent='選擇文風範本（可再修改）';presets.append(custom);
 NARRATIVE_STYLE_PRESETS.forEach((preset,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=preset.label;presets.append(option);});
 presets.onchange=()=>{if(presets.value!==''){styleInput.value=NARRATIVE_STYLE_PRESETS[Number(presets.value)].text;status.textContent='已載入範本，保存後生效。';}};
 styleField.append(styleCaption,styleInput);body.append(styleField,presets);
 const styleHint=document.createElement('p');styleHint.className='wl-note';styleHint.textContent='每條世界線獨立保存；長期及下一輪指令可補充文風。';body.append(styleHint);
 const styleActions=document.createElement('div');styleActions.className='wl-actions';
 const reset=document.createElement('button');reset.type='button';reset.className='wl-button';reset.textContent='還原預設文風';
 const saveStyle=document.createElement('button');saveStyle.type='button';saveStyle.className='wl-button wl-primary';saveStyle.textContent='保存核心寫作設定';
 const applyStyle=async(value:string)=>{try{await persist(()=>{saveDirector(localStorage,key,'core',value);});styleInput.value=effectiveNarrativeStyle(readDirector(localStorage,key));presets.value='';status.textContent='核心寫作設定已保存。';refreshPreview();}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
 reset.onclick=()=>applyStyle('');saveStyle.onclick=()=>applyStyle(styleInput.value);styleActions.append(reset,saveStyle);body.append(styleActions);
 for(const section of CREATIVE_SECTIONS){
  const details=document.createElement('details');details.className='wl-field';
  const summary=document.createElement('summary');summary.className='wl-field-label';summary.textContent=section.label;
  const field=document.createElement('textarea');field.className='wl-input';field.rows=4;field.maxLength=1500;field.setAttribute('aria-label',section.label);field.value=effectiveCreativeSection(initial,section.key);
  const buttons=document.createElement('div');buttons.className='wl-actions';
  const restore=document.createElement('button');restore.type='button';restore.className='wl-button';restore.textContent='還原預設';
  const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent='保存'+section.label;
  const apply=async(value:string)=>{try{await persist(()=>{saveDirector(localStorage,key,section.key,value);});field.value=effectiveCreativeSection(readDirector(localStorage,key),section.key);refreshPreview();status.textContent=section.label+'已保存。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
  restore.onclick=()=>apply('');save.onclick=()=>apply(field.value);buttons.append(restore,save);details.append(summary,field,buttons);body.append(details);
 }
 for(const [scope,label,placeholder] of [['next','只限下一輪','例如：留喺目前場景，多寫人物反應，唔好突然跳到第二日。'],['standing','長期生效','例如：細緻描寫氣氛及心理活動，保持故事連續性。']] as const){
  const field=document.createElement('label');field.className='wl-field';const caption=document.createElement('span');caption.className='wl-field-label';caption.textContent=label;
  const input=document.createElement('textarea');input.className='wl-input';input.rows=4;input.maxLength=1500;input.placeholder=placeholder;input.value=initial[scope]?.text||'';
  field.append(caption,input);body.append(field);
  const actions=document.createElement('div');actions.className='wl-actions';
  const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent=scope==='next'?'保存下一輪指令':'保存長期指令';
  const clear=document.createElement('button');clear.type='button';clear.className='wl-button';clear.textContent='清除';
  const apply=async(value:string)=>{try{await persist(()=>{saveDirector(localStorage,key,scope,value);});input.value=value;refreshPreview();status.textContent=value.trim()?label+'指令已保存。':label+'指令已清除。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
  save.onclick=()=>apply(input.value);clear.onclick=()=>apply('');actions.append(clear,save);body.append(actions);
 }
 const view=document.createElement('details');view.className='wl-field';
 const viewTitle=document.createElement('summary');viewTitle.className='wl-field-label';viewTitle.textContent='查看已生效的旁白創作指令';
 const viewHint=document.createElement('p');viewHint.className='wl-note';viewHint.textContent='這是實際加入生成及一般品質檢查的旁白創作指令區塊；不包括動態聊天紀錄、世界資料、模型供應商指令或完整請求。未保存的修改不會顯示。';
 refreshPreview();view.append(viewTitle,viewHint,preview);body.append(view,status);d.append(header,body);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
