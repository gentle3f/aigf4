/** Isolated predictive-chat prototype. One speculative request per draft,
 * never reuse a response to edited input. No canonical conversation writes. */
export type LabMessage={role:'user'|'assistant';content:string};
export type LabResult={text:string;model?:string;promptTokens?:number;completionTokens?:number};
export type LabRequest=(messages:LabMessage[],signal:AbortSignal)=>Promise<LabResult>;
type Candidate={text:string;controller:AbortController;promise:Promise<LabResult>;started:number};
export class PredictiveLab {
    private draft='';
    private attempted=false;
    private candidate:Candidate|null=null;
    private timer:ReturnType<typeof setTimeout>|null=null;
    private disposed=false;
    private committed=false;
    readonly history:LabMessage[]=[];
    calls=0;discarded=0;inputTokens=0;outputTokens=0;unknownUsage=0;pendingCalls=0;
    constructor(private request:LabRequest,private changed:()=>void=()=>{},private delay=1100,private clock=()=>performance.now()){}
    private cancelTimer(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
    private discardCandidate(){if(this.candidate){this.discarded++;this.candidate.controller.abort();this.candidate=null;}}
    private call(text:string,controller:AbortController):Promise<LabResult>{
        this.calls++;this.pendingCalls++;
        return Promise.resolve().then(()=>this.request([...this.history,{role:'user',content:text}],controller.signal)).then(r=>{
            if(r.promptTokens==null||r.completionTokens==null)this.unknownUsage++;
            this.inputTokens+=r.promptTokens??0;this.outputTokens+=r.completionTokens??0;
            return r;
        },e=>{this.unknownUsage++;throw e;}).finally(()=>{this.pendingCalls--;if(!this.disposed)this.changed();});
    }
    update(value:string,enabled:boolean,composing=false){
        if(this.disposed||this.committed)return;
        const next=value.trim();
        this.cancelTimer();
        if(next!==this.draft){this.discardCandidate();this.draft=next;}
        if(!enabled||composing){this.discardCandidate();this.changed();return;}
        if(!this.attempted&&next.length>=6){
            this.timer=setTimeout(()=>{this.timer=null;void this.precompute();},this.delay);
        }
        this.changed();
    }
    precompute(){
        if(this.disposed||this.committed||this.attempted||this.draft.length<6)return;
        this.cancelTimer();this.attempted=true;
        const controller=new AbortController(),text=this.draft;
        const candidate:Candidate={text,controller,started:this.clock(),promise:this.call(text,controller)};
        this.candidate=candidate;
        // A failed speculative request must not become an unhandled rejection.
        void candidate.promise.catch(()=>{});this.changed();
    }
    get hasCandidate(){return this.candidate!==null;}
    private finalController:AbortController|null=null;
    async submit(value:string){
        const text=value.trim();if(this.disposed||this.committed||!text)throw Error('No available draft');
        this.committed=true;this.cancelTimer();const sent=this.clock();
        const eligible=this.candidate?.text===text?this.candidate:null;
        if(!eligible)this.discardCandidate();
        let reused=false;let result:LabResult;
        try{
            if(eligible){
                try{result=await eligible.promise;reused=true;}
                catch{if(this.disposed)throw Error('Lab closed');const controller=new AbortController();this.finalController=controller;result=await this.call(text,controller);}
            }else{const controller=new AbortController();this.finalController=controller;result=await this.call(text,controller);}
            if(this.disposed)throw Error('Lab closed');
            this.history.push({role:'user',content:text},{role:'assistant',content:result.text});
            return {result,reused,postSendMs:Math.round(this.clock()-sent)};
        }finally{
            this.candidate=null;this.finalController=null;this.attempted=false;this.draft='';this.committed=false;
            if(!this.disposed)this.changed();
        }
    }
    close(){this.disposed=true;this.cancelTimer();this.discardCandidate();this.finalController?.abort();}
}
export function openPredictiveLab(request:LabRequest){
    const dialog=document.createElement('dialog');
    dialog.style.cssText='width:min(94vw,560px);max-height:86vh;overflow:auto;padding:18px;border-radius:14px;background:var(--mori-surface,#fff);color:var(--mori-text,#222);border:1px solid #999';
    const title=document.createElement('h2');title.textContent='預判式對話實驗室';
    const info=document.createElement('p');info.textContent='獨立測試聊天，不會寫入原有故事。開啟預判後，停止輸入約 1.1 秒，未發送的草稿會傳送至現有 AI API。每輪最多一次預判請求；修改後不會重用舊答案。';
    const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';
    label.append(toggle,document.createTextNode(' 允許 AI 預先讀取未發送草稿（可能有額外費用）'));
    const log=document.createElement('div');log.style.cssText='white-space:pre-wrap;max-height:36vh;overflow:auto;margin:12px 0;line-height:1.65';
    const input=document.createElement('textarea');input.rows=3;input.placeholder='輸入一句日常聊天，例如：今晚食咩好？';input.style.cssText='width:100%;box-sizing:border-box;resize:vertical;color:inherit;background:transparent;border:1px solid #888;padding:8px';
    const status=document.createElement('p');status.setAttribute('aria-live','polite');
    const stats=document.createElement('p');stats.style.fontSize='12px';
    const send=document.createElement('button');send.type='button';send.textContent='發送';
    const close=document.createElement('button');close.type='button';close.textContent='關閉實驗';
    let composing=false,busy=false,last='';
    const refresh=()=>{
        status.textContent=busy?'AI 正在完成回覆…':lab.hasCandidate?'AI 已開始預先準備回覆…':last||'等待輸入';
        stats.textContent='請求 '+lab.calls+' · 捨棄候選 '+lab.discarded+' · 已知輸入/輸出 Token '+lab.inputTokens+'/'+lab.outputTokens+' · 用量未知 '+lab.unknownUsage;
    };
    const lab=new PredictiveLab(request,refresh);
    const update=()=>lab.update(input.value,toggle.checked,composing);
    input.addEventListener('compositionstart',()=>{composing=true;update();});
    input.addEventListener('compositionend',()=>{composing=false;update();});
    input.addEventListener('input',update);toggle.addEventListener('change',update);
    const line=(label:string,text:string)=>{const p=document.createElement('p');p.textContent=label+'：'+text;log.appendChild(p);log.scrollTop=log.scrollHeight;};
    const submit=async()=>{
        if(busy||composing||!input.value.trim())return;
        const value=input.value.trim();busy=true;input.disabled=true;send.disabled=true;toggle.disabled=true;
        line('你',value);refresh();
        try{
            const result=await lab.submit(value);
            if(!dialog.isConnected)return;
            line('AI',result.result.text);
            last=(result.reused?'成功重用預判':'正常生成')+'；按發送後 '+result.postSendMs+' ms';
            input.value='';
        }catch(e){if(dialog.isConnected)last='請求失敗：'+(e instanceof Error?e.message:String(e));}
        finally{busy=false;input.disabled=false;send.disabled=false;toggle.disabled=false;refresh();if(dialog.isConnected)input.focus();}
    };
    send.addEventListener('click',()=>void submit());
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void submit();}});
    close.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{lab.close();dialog.remove();},{once:true});
    dialog.append(title,info,label,log,input,status,stats,send,close);
    document.body.appendChild(dialog);dialog.showModal();refresh();
}
