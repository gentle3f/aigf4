/** Worldline v1 panel: create a new story, move the existing cast into
 * a world, examine/edit durable state and trigger story actions.
 * No second chat transcript, no new Supabase schema, no automatic NPC joins.
 */
import { setPersistedAppSetting } from '../appSettings.js';
import {
    WORLDLINE_SETTING_KEY,getWorldline,makeWorldline,normalizeWorldline,updateWorldlineRegistry,
    worldlineGenreLabel,buildWorldlineOpening,
    type Worldline,type WorldlineStartOptions,type WorldlineGenre,
} from '../worldline.js';
export interface WorldlineUiDeps {
    getActiveConversation:()=>{key:string;title:string;isAssistant:boolean}|null;
    createNarratorConversation:(title:string)=>string;
    openConversation:(key:string)=>void;
    dispatchText:(text:string)=>void;
    afterWorldlineChange:()=>void;
}
const genres: Array<[WorldlineGenre,string]>=[
    ['xianxia','修仙／玄幻'],['isekai','穿越異世界'],
    ['system','系統流'],['rebirth','重生'],
    ['apocalypse','末世／科幻'],['fantasy','奇幻冒險'],
    ['custom','完全自訂'],
];
const read=(key:string):Worldline|null=>{
    try{return getWorldline(localStorage.getItem(WORLDLINE_SETTING_KEY),key);}
    catch{return null;}
};
const save=(key:string,world:Worldline|null)=>{
    const next=updateWorldlineRegistry(localStorage.getItem(WORLDLINE_SETTING_KEY),key,world);
    setPersistedAppSetting(WORLDLINE_SETTING_KEY,JSON.stringify(next));
};
const element=<K extends keyof HTMLElementTagNameMap>(
    tag:K,cls='',text='',
):HTMLElementTagNameMap[K]=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text)node.textContent=text;
    return node;
};
const control=(parent:HTMLElement,label:string,kind:'input'|'textarea'|'select',value='')=>{
    const wrapper=element('label','wl-field');
    wrapper.appendChild(element('span','wl-field-label',label));
    const input=document.createElement(kind);
    if(kind==='input')(input as HTMLInputElement).type='text';
    input.className='wl-input';
    input.value=value;
    wrapper.appendChild(input);
    parent.appendChild(wrapper);
    return input;
};
const formatList=(items:string[])=>items.join('\n');
const editList=(input:string,maximum:number):string[]=>input.split(/[\n\r]+/gu)
    .map(x=>x.trim()).filter(Boolean).slice(-maximum);
const setStatus=(node:HTMLElement,message:string)=>{node.textContent=message;};
const createModal=()=>{
    const dialog=element('dialog','wl-dialog');
    dialog.setAttribute('aria-label','AIGF Worldline 世界線');
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{
        if(event.target===dialog)dialog.close();
    });
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    return dialog;
};
const showDialog=(dialog:HTMLDialogElement)=>{
    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
};
const header=(dialog:HTMLDialogElement,title:string,subtitle:string)=>{
    const bar=element('div','wl-header');
    const name=element('div');
    name.appendChild(element('h2','',title));
    name.appendChild(element('p','',subtitle));
    const close=element('button','wl-close','×');
    close.type='button';close.setAttribute('aria-label','關閉');
    close.addEventListener('click',()=>dialog.close());
    bar.append(name,close);
    dialog.appendChild(bar);
};
const actionButton=(label:string,onClick:()=>void,primary=false)=>{
    const button=element('button',primary?'wl-button wl-primary':'wl-button',label);
    button.type='button';
    button.addEventListener('click',onClick);
    return button;
};
const openStart=(deps:WorldlineUiDeps,preferred:'new'|'current')=>{
    const dialog=createModal();
    header(dialog,'開啟新世界線','自由世界、長篇主線、金手指與成人角色關係都可以同時存在');
    const form=element('form','wl-form');
    form.noValidate=true;
    form.addEventListener('submit',event=>event.preventDefault());
    const title=control(form,'世界名稱','input','我的新世界');
    (title as HTMLInputElement).maxLength=100;
    const genre=control(form,'世界類型','select') as HTMLSelectElement;
    genres.forEach(([id,label])=>{
        const o=document.createElement('option');o.value=id;o.textContent=label;genre.appendChild(o);
    });
    genre.value='xianxia';
    const premise=control(form,'開局構想（最重要）','textarea',
        '我轉生到一個有獨立勢力同人物生活的世界。世界會因為我嘅行動改變，但唔係所有人都圍住我轉。') as HTMLTextAreaElement;
    premise.maxLength=1700;premise.rows=4;
    const protagonist=control(form,'主角身份','input','保留我自己嘅人格與選擇，由新世界安排初始身份');
    const golden=control(form,'金手指／系統能力','textarea',
        '一種可以持續成長、玩法自由嘅獨特系統；由故事揭示真正用途') as HTMLTextAreaElement;
    golden.maxLength=700;golden.rows=2;
    const quest=control(form,'主線目標（可以留空畀 AI 自由生成）','textarea','') as HTMLTextAreaElement;
    quest.maxLength=550;quest.rows=2;
    const options=element('div','wl-settings-row');
    const pacing=element('label','wl-inline');
    pacing.appendChild(element('span','','節奏'));
    const pace=document.createElement('select');pace.className='wl-input';
    [['story','有主線但自由探索'],['free','完全開放世界']].forEach(([v,t])=>{
        const o=document.createElement('option');o.value=v;o.textContent=t;pace.appendChild(o);
    });
    pacing.appendChild(pace);
    const adult=element('label','wl-inline');
    adult.appendChild(element('span','','關係線'));
    const romance=document.createElement('select');romance.className='wl-input';
    [['adult','成人向戀愛／NSFW 支線'],['normal','一般關係與冒險']].forEach(([v,t])=>{
        const o=document.createElement('option');o.value=v;o.textContent=t;romance.appendChild(o);
    });
    adult.appendChild(romance);options.append(pacing,adult);form.appendChild(options);
    const selected=deps.getActiveConversation();
    const choice=element('div','wl-attach-choice');
    const toNew=element('label','wl-radio');
    const a=document.createElement('input');a.type='radio';a.name='worldline-kind';a.value='new';
    toNew.append(a,document.createTextNode('開新世界（獨立故事）'));
    choice.appendChild(toNew);
    let toCurrent:HTMLLabelElement|null=null;
    let b:HTMLInputElement|null=null;
    if(selected&&!selected.isAssistant){
        toCurrent=element('label','wl-radio');
        b=document.createElement('input');b.type='radio';b.name='worldline-kind';b.value='current';
        toCurrent.append(b,document.createTextNode('將目前群組／角色帶入新世界'));
        choice.appendChild(toCurrent);
    }
    if(preferred==='current'&&b)b.checked=true;else a.checked=true;
    form.appendChild(choice);
    const notice=element('p','wl-error');
    notice.setAttribute('aria-live','polite');
    const actions=element('div','wl-actions');
    actions.appendChild(actionButton('取消',()=>dialog.close()));
    const create=element('button','wl-button wl-primary','開始序章');
    create.type='button';
    create.addEventListener('click',()=>{
        try{
            if(!premise.value.trim())throw Error('請輸入你想玩嘅世界背景。');
            const opts:WorldlineStartOptions={
                title:title.value.trim()||'未命名世界',genre:genre.value as WorldlineGenre,
                premise:premise.value.trim(),protagonist:protagonist.value.trim(),
                goldenFinger:golden.value.trim(),mainQuest:quest.value.trim(),
                relationshipMode:romance.value==='adult'?'adult':'normal',
                tone:pace.value==='free'?'free':'story',
            };
            const original=deps.getActiveConversation();
            const attach=Boolean(b?.checked&&original&&!original.isAssistant);
            const key=attach?original!.key:deps.createNarratorConversation(opts.title);
            const world=makeWorldline(key,opts);
            save(key,world);
            dialog.close();
            deps.openConversation(key);
            deps.afterWorldlineChange();
            deps.dispatchText(buildWorldlineOpening(world));
        }catch(e){setStatus(notice,e instanceof Error?e.message:'世界線建立失敗');}
    });
    actions.appendChild(create);form.append(notice,actions);dialog.appendChild(form);
    showDialog(dialog);
    premise.focus();
};
const openManage=(deps:WorldlineUiDeps,key:string,world:Worldline)=>{
    const dialog=createModal();
    header(dialog,'世界線 · '+world.title,
        `${worldlineGenreLabel(world.genre)} · 第 ${world.turnCount} 個故事回合 · ${world.chapter}`);
    const body=element('div','wl-form');
    const summary=element('p','wl-note',
        '以下係世界長期紀錄。你可以改動已確定嘅規則、主線同人物；唔會重新寫你之前嘅聊天紀錄。');
    body.appendChild(summary);
    const chapter=control(body,'章節','input',world.chapter);
    const location=control(body,'所在地','input',world.location);
    const ability=control(body,'目前境界／能力','input',world.ability);
    const quest=control(body,'主線目標','textarea',world.mainQuest) as HTMLTextAreaElement;
    quest.rows=2;
    const progress=control(body,'主線進度／後果','textarea',world.questProgress) as HTMLTextAreaElement;
    progress.rows=2;
    const rules=control(body,'金手指規則','textarea',world.goldenFingerRule) as HTMLTextAreaElement;
    rules.rows=2;
    const inventory=control(body,'物品／寶物（每行一件）','textarea',formatList(world.inventory)) as HTMLTextAreaElement;
    inventory.rows=2;
    const threads=control(body,'未完成支線／勢力動向（每行一項）','textarea',formatList(world.threads)) as HTMLTextAreaElement;
    threads.rows=2;
    const facts=control(body,'已確認世界事實（每行一項）','textarea',formatList(world.facts)) as HTMLTextAreaElement;
    facts.rows=2;
    const cast=element('details','wl-cast');
    cast.appendChild(element('summary','','世界人物／NPC 名冊（'+world.npcs.length+'）'));
    const roster=element('div','wl-cast-body');
    const renderRoster=()=>{
        roster.innerHTML='';
        world.npcs.forEach(npc=>{
            const entry=element('div','wl-npc-entry');
            entry.append(element('strong','',npc.name),element('span','',`${npc.role} · ${npc.motivation} · ${npc.relationship}`));
            entry.appendChild(actionButton('編輯',()=>{
                const name=window.prompt('人物姓名',npc.name);
                if(name===null)return;
                const motivation=window.prompt('佢有咩自己想達成嘅目標？',npc.motivation);
                if(motivation===null)return;
                const relation=window.prompt('同主角／其他角色嘅關係',npc.relationship);
                if(relation===null)return;
                const role=window.prompt('身份／職業',npc.role);
                if(role===null)return;
                const index=world.npcs.findIndex(n=>n.id===npc.id);
                if(index>=0)world.npcs[index]={
                    ...npc,name:name.trim().slice(0,80)||npc.name,
                    motivation:motivation.trim().slice(0,240),
                    relationship:relation.trim().slice(0,200),role:role.trim().slice(0,180),
                };
                renderRoster();
            }));
            roster.appendChild(entry);
        });
    };
    renderRoster();
    cast.appendChild(roster);
    cast.appendChild(actionButton('＋ 記錄世界人物',()=>{
        if(world.npcs.length>=24){alert('人物紀錄已達上限，可編輯現有人物。');return;}
        const name=window.prompt('新人物姓名');
        if(!name?.trim())return;
        const motivation=window.prompt('此人真正想達成嘅目標（可留空）')||'';
        const role=window.prompt('身份／職業（可留空）')||'';
        const relationship=window.prompt('佢同主角或其他人嘅關係（可留空）')||'';
        world.npcs.push({id:'npc-'+Date.now()+'-'+world.npcs.length,
            name:name.trim().slice(0,80),motivation:motivation.slice(0,240),
            role:role.slice(0,180),relationship:relationship.slice(0,200)});
        renderRoster();
    }));
    body.appendChild(cast);
    const note=element('p','wl-error');note.setAttribute('aria-live','polite');
    const storeEdits=()=>{
        const changed=normalizeWorldline({
            ...world,chapter:chapter.value,location:location.value,ability:ability.value,
            mainQuest:quest.value,questProgress:progress.value,goldenFingerRule:rules.value,
            inventory:editList(inventory.value,30),
            threads:editList(threads.value,16),
            facts:editList(facts.value,32),
        });
        save(key,changed);
        deps.afterWorldlineChange();
        return changed;
    };
    const buttons=element('div','wl-actions');
    buttons.appendChild(actionButton('儲存世界紀錄',()=>{
        try{storeEdits();setStatus(note,'世界狀態已保存，之後對話會沿用。');}
        catch(e){setStatus(note,e instanceof Error?e.message:'儲存失敗');}
    },true));
    buttons.appendChild(actionButton(world.paused?'繼續世界線':'暫停世界線',()=>{
        try{
            const next=storeEdits();
            save(key,{...next,paused:!next.paused});
            dialog.close();deps.afterWorldlineChange();
        }catch(e){setStatus(note,e instanceof Error?e.message:'操作失敗');}
    }));
    const storyActions=element('div','wl-actions wl-quick-actions');
    const triggers:Array<[string,string]>=[
        ['▶ 推進主線','請承接之前嘅事件，讓主線以一個合理且有後果嘅新變化推進；我仍可自由改變方向。'],
        ['◈ 自由探索','我暫時放低主線，想探索世界某個有趣地方。請由場景或人物自主帶出新線索，唔需要硬加戰鬥。'],
        ['✦ 發動金手指','我想嘗試運用目前已建立嘅金手指能力。請展示其機制、可能代價同意想不到嘅用途，唔好憑空改規則。'],
        ['✧ 遇見新人物','讓一個具有獨立目標、背景同持續影響力嘅新 NPC 自然進入目前場景；性別、立場、職業、關係唔預設。'],
        ['♡ 人物關係支線','暫時聚焦一位已登場成年角色嘅情感與個人故事；由佢自己嘅想法推動，保持與主線世界因果連貫。'],
    ];
    triggers.forEach(([label,action])=>storyActions.appendChild(actionButton(label,()=>{
        try{
            const latest=storeEdits();
            if(latest.paused){setStatus(note,'世界線已暫停，請先恢復。');return;}
            dialog.close();deps.dispatchText(action);
        }catch(e){setStatus(note,e instanceof Error?e.message:'未能開始行動');}
    })));
    body.append(note,buttons,element('h3','','故事行動'),storyActions);
    if(world.chronicle.length){
        const log=element('details','wl-chronicle');
        log.appendChild(element('summary','','最近故事紀錄（'+world.chronicle.length+' 回合）'));
        world.chronicle.slice(-8).reverse().forEach(item=>{
            log.appendChild(element('p','',`#${item.turn} 你：${item.input}；進展：${item.outcome}`));
        });
        body.appendChild(log);
    }
    const footer=element('div','wl-actions');
    footer.appendChild(actionButton('另開新世界線',()=>{
        dialog.close();openStart(deps,'new');
    }));
    footer.appendChild(actionButton('刪除此世界線設定',()=>{
        if(!window.confirm('只刪除呢個世界嘅遊戲設定，保留原有全部聊天紀錄。確定？'))return;
        try{save(key,null);dialog.close();deps.afterWorldlineChange();}
        catch(e){setStatus(note,e instanceof Error?e.message:'刪除設定失敗');}
    }));
    body.appendChild(footer);
    dialog.appendChild(body);
    showDialog(dialog);
};
export const openWorldlineUi=(deps:WorldlineUiDeps,source:'new'|'current'='current')=>{
    const current=deps.getActiveConversation();
    const existing=current?.isAssistant?null:current?read(current.key):null;
    if(source==='current'&&existing&&current){
        openManage(deps,current.key,existing);
        return;
    }
    openStart(deps,source);
};
