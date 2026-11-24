/** Optional, best-effort media-session experiment. No guarantee of preventing
 * suspension: some browsers intentionally ignore silent audio. Never emit sound.
 * Playback has a finite duration even if JS is frozen. No extra AI requests.
 */
export const BACKGROUND_MEDIA_KEY='worldlineBackgroundMediaV1';
export const BACKGROUND_MEDIA_SECONDS=240;
export function makeSilentWave(seconds=BACKGROUND_MEDIA_SECONDS):Uint8Array{
    const samples=Math.max(1,Math.min(300,Math.floor(seconds)))*8000;
    const bytes=new Uint8Array(44+samples);
    const view=new DataView(bytes.buffer);
    const ascii=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[offset+i]=s.charCodeAt(i);};
    ascii(0,'RIFF');view.setUint32(4,36+samples,true);ascii(8,'WAVE');
    ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
    view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,8000,true);
    view.setUint16(32,1,true);view.setUint16(34,8,true);ascii(36,'data');
    view.setUint32(40,samples,true);bytes.fill(128,44);
    return bytes;
}
type MediaState='idle'|'starting'|'playing'|'blocked'|'ended';
export function createBackgroundMedia(){
    let owner:number|null=null;
    let audio:HTMLAudioElement|null=null,url:string|null=null;
    let state:MediaState='idle';
    let previousMetadata:MediaMetadata|null=null;
    let sessionChanged=false;
    const enabled=()=>{try{return localStorage.getItem(BACKGROUND_MEDIA_KEY)==='true';}catch{return false;}};
    const stop=(id?:number)=>{
        if(id!==undefined&&owner!==id)return;
        owner=null;state='idle';
        if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}
        if(url){URL.revokeObjectURL(url);url=null;}
        if(sessionChanged){
            try{navigator.mediaSession.metadata=previousMetadata;navigator.mediaSession.playbackState='none';}catch{/* not supported */}
            sessionChanged=false;previousMetadata=null;
        }
    };
    const start=(id:number)=>{
        if(!enabled())return;
        if(owner===id&&audio&&(state==='starting'||!audio.paused))return;
        stop();
        owner=id;state='starting';
        try{
            const media=new Audio();
            const wave=makeSilentWave();
            url=URL.createObjectURL(new Blob([wave.buffer as ArrayBuffer],{type:'audio/wav'}));
            audio=media;media.src=url;media.loop=false;media.preload='auto';
            media.addEventListener('ended',()=>{if(owner===id&&audio===media){stop(id);state='ended';}},{once:true});
            void media.play().then(()=>{
                if(owner!==id||audio!==media)return;
                state='playing';
                try{
                    if('mediaSession' in navigator&&typeof MediaMetadata!=='undefined'){
                        previousMetadata=navigator.mediaSession.metadata;
                        navigator.mediaSession.metadata=new MediaMetadata({title:'Worldline 正在生成故事',artist:'靜音背景生成（實驗）'});
                        sessionChanged=true;navigator.mediaSession.playbackState='playing';
                    }
                }catch{/* media metadata is optional */}
            }).catch(()=>{if(owner===id&&audio===media){stop(id);state='blocked';}});
        }catch{stop(id);state='blocked';}
    };
    const setEnabled=(value:boolean)=>{
        try{localStorage.setItem(BACKGROUND_MEDIA_KEY,String(value));}catch{return false;}
        if(!value)stop();
        return true;
    };
    return {enabled,setEnabled,start,stop,getState:()=>state};
}
