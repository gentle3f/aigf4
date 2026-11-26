import {getPilotConnection,pilotConnectionEnabled} from './pilotConnection.js';
import {enablePilotStudioMedia} from './pilotStudioMedia.js';
export function askPilotLogin(connect:(email:string,password:string)=>Promise<void>){
 const d=document.createElement('dialog');d.className='wl-dialog';const body=document.createElement('form');body.className='wl-form';
 const title=document.createElement('h2');title.textContent='測試雲端登入';const email=document.createElement('input');email.className='wl-input';email.type='email';email.placeholder='測試電郵';email.required=true;email.autocomplete='username';const pwd=document.createElement('input');pwd.className='wl-input';pwd.type='password';pwd.required=true;pwd.placeholder='測試帳戶密碼';pwd.autocomplete='current-password';const send=document.createElement('button');send.className='wl-button wl-primary';send.type='submit';send.textContent='登入';const close=document.createElement('button');close.type='button';close.className='wl-button';close.textContent='取消';close.onclick=()=>d.close();const status=document.createElement('p');status.className='wl-note';status.textContent='獨立測試資料庫，不影響正式聊天。';body.append(title,email,pwd,send,close,status);d.append(body);document.body.append(d);d.addEventListener('close',()=>{pwd.value='';d.remove();});body.onsubmit=e=>{e.preventDefault();const p=pwd.value;pwd.value='';send.disabled=true;void connect(email.value.trim(),p).then(()=>d.close()).catch(e=>{status.textContent='登入或同步未完成：'+(e instanceof Error?e.message:'UNKNOWN');send.disabled=false;});};d.showModal();
}

export function openPilotMediaLogin(){
 if(!pilotConnectionEnabled)throw Error('PILOT_CONNECTION_DISABLED');
 const connection=getPilotConnection();
 const enable=async()=>{
  if(!confirm('同步本次登入後新生成的 Studio 圖片及影片至獨立測試資料庫？不會批量上載原有相簿。'))return;
  const r=await enablePilotStudioMedia(connection.getMedia());
  alert('媒體同步已啟用；已核對雲端媒體 '+r.restored+' 項。');
 };
 if(connection.isSignedIn()){void enable().catch(e=>alert('媒體同步未完成：'+(e instanceof Error?e.message:'UNKNOWN')));return;}
 askPilotLogin(async(email,password)=>{await connection.signIn(email,password);await enable();});
}
