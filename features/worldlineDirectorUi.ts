import {readDirector,saveDirector,effectiveNarrativeStyle,NARRATIVE_STYLE_PRESETS} from '../worldlineDirector.js';
export function openWorldlineDirector(key:string){
 const d=document.createElement('dialog');d.className='wl-dialog';d.setAttribute('aria-label','旁白設定');
 const header=document.createElement('div');header.className='wl-header';
 const title=document.createElement('h2');title.textContent='旁白設定';const close=document.createElement('button');close.type='button';close.className='wl-close';close.textContent='×';close.onclick=()=>d.close();header.append(title,close);
 const body=document.createElement('div');body.className='wl-form';
 const hint=document.createElement('p');hint.className='wl-note';hint.textContent='獨立控制敘事節奏、細節、人物反應、氛圍同場景過渡。唔會變成角色對話，唔會改寫之前嘅故事。';
 body.append(hint);
 const initial=readDirector(localStorage,key);
 const status=document.createElement('p');status.className='wl-note';status.setAttribute('aria-live','polite');
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
 const applyStyle=(value:string)=>{try{const saved=saveDirector(localStorage,key,'core',value);styleInput.value=effectiveNarrativeStyle(saved);presets.value='';status.textContent='核心寫作設定已保存。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
 reset.onclick=()=>applyStyle('');saveStyle.onclick=()=>applyStyle(styleInput.value);styleActions.append(reset,saveStyle);body.append(styleActions);
 for(const [scope,label,placeholder] of [['next','只限下一輪','例如：留喺目前場景，多寫人物反應，唔好突然跳到第二日。'],['standing','長期生效','例如：細緻描寫氣氛及心理活動，保持故事連續性。']] as const){
  const field=document.createElement('label');field.className='wl-field';const caption=document.createElement('span');caption.className='wl-field-label';caption.textContent=label;
  const input=document.createElement('textarea');input.className='wl-input';input.rows=4;input.maxLength=1500;input.placeholder=placeholder;input.value=initial[scope]?.text||'';
  field.append(caption,input);body.append(field);
  const actions=document.createElement('div');actions.className='wl-actions';
  const save=document.createElement('button');save.type='button';save.className='wl-button wl-primary';save.textContent=scope==='next'?'保存下一輪指令':'保存長期指令';
  const clear=document.createElement('button');clear.type='button';clear.className='wl-button';clear.textContent='清除';
  const apply=(value:string)=>{try{saveDirector(localStorage,key,scope,value);input.value=value;status.textContent=value.trim()?label+'指令已保存。':label+'指令已清除。';}catch(e){status.textContent=e instanceof Error?e.message:'保存失敗。';}};
  save.onclick=()=>apply(input.value);clear.onclick=()=>apply('');actions.append(clear,save);body.append(actions);
 }
 body.append(status);d.append(header,body);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
