import {readDirector,saveDirector} from '../worldlineDirector.js';
export function openWorldlineDirector(key:string){
 const d=document.createElement('dialog');d.className='wl-dialog';d.setAttribute('aria-label','旁白導演');
 const header=document.createElement('div');header.className='wl-header';
 const title=document.createElement('h2');title.textContent='旁白導演';const close=document.createElement('button');close.type='button';close.className='wl-close';close.textContent='×';close.onclick=()=>d.close();header.append(title,close);
 const body=document.createElement('div');body.className='wl-form';
 const hint=document.createElement('p');hint.className='wl-note';hint.textContent='獨立控制敘事節奏、細節、人物反應、氛圍同場景過渡。唔會變成角色對話，唔會改寫之前嘅故事。';
 body.append(hint);
 const initial=readDirector(localStorage,key);
 const status=document.createElement('p');status.className='wl-note';status.setAttribute('aria-live','polite');
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
