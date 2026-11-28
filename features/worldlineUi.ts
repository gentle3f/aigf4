/** Worldline v1 panel: create a new story, move the existing cast into
 * a world, examine/edit durable state and trigger story actions.
 * No second chat transcript, no new Supabase schema, no automatic NPC joins.
 */
import { setPersistedAppSetting } from '../appSettings.js';
import type { RandomMainQuestInput } from '../worldlineRandomQuest.js';
import {WORLD_TOPICS,ideaToWorldOptions,existingIdeaToWorldOptions,type WorldIdea,type WorldIdeaInput,type ExistingWorldInput,type WorldRecommendationMode} from '../worldlineQuickStart.js';
import type { projectWorld } from '../worldLedger.js';
import {
    WORLDLINE_SETTING_KEY,getWorldline,makeWorldline,normalizeWorldline,updateWorldlineRegistry,parseWorldlineRegistry,
    worldlineGenreLabel,buildWorldlineOpening,
    type Worldline,type WorldlineStartOptions,type WorldlineGenre,
} from '../worldline.js';
export interface WorldlineUiDeps {
    getActiveConversation:()=>{key:string;title:string;isAssistant:boolean}|null;
    createNarratorConversation:(title:string)=>string;
    openConversation:(key:string)=>void;
    dispatchText:(text:string)=>void;
    afterWorldlineChange:()=>void;
    generateRandomQuest:(input:RandomMainQuestInput)=>Promise<string>;
    generateWorldIdeas:(input:WorldIdeaInput)=>Promise<WorldIdea[]>;
    generateExistingWorldIdeas:(input:ExistingWorldInput)=>Promise<WorldIdea[]>;
    getWorldLedger:(key:string)=>ReturnType<typeof projectWorld>;
    rebuildWorldLedger:(key:string,skipIds:readonly string[])=>Promise<{advanced:number;deferred:string[];issueCount:number}>;
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
const startWorld=(deps:WorldlineUiDeps,dialog:HTMLDialogElement,opts:WorldlineStartOptions,attachKey?:string)=>{
    const key=attachKey||deps.createNarratorConversation(opts.title);
    const world=makeWorldline(key,opts);
    save(key,world);
    dialog.close();
    deps.openConversation(key);
    deps.afterWorldlineChange();
    deps.dispatchText(buildWorldlineOpening(world));
};
const openExistingWorld=(deps:WorldlineUiDeps)=>{
    const dialog=createModal();
    header(dialog,'進入原著世界','漫畫、小說、電影、遊戲都可以；由你決定故事點樣發展。');
    const body=element('div','wl-form');
    const work=control(body,'作品名稱','input') as HTMLInputElement;
    work.maxLength=100;work.placeholder='例如：ONE PIECE、斗羅大陸';
    const character=control(body,'想扮演邊個？（選填）','input') as HTMLInputElement;
    character.maxLength=100;character.placeholder='例如：路飛、唐三、自創角色';
    const presets=element('div','wl-actions');
    for(const [name,role] of [['ONE PIECE','路飛'],['斗羅大陸','唐三']]){
        presets.appendChild(actionButton(name+' · '+role,()=>{work.value=name;character.value=role;}));
    }
    body.appendChild(presets);
    const point=control(body,'故事起點（選填）','input') as HTMLInputElement;
    point.maxLength=200;point.placeholder='例如：原著開局、出海前、覺醒武魂時';
    const comment=control(body,'想改變啲咩？（選填）','textarea') as HTMLTextAreaElement;
    comment.rows=2;comment.maxLength=1000;comment.placeholder='例如：保留原著能力，自由探索，唔一定跟原著主線。';
    const actions=element('div','wl-actions'),notice=element('p','wl-note'),ideas=element('div','wl-cast-body');
    notice.setAttribute('aria-live','polite');
    let previous:WorldIdea[]=[],previousSignature='',busy=false,closed=false,starting=false;
    dialog.addEventListener('close',()=>{closed=true;},{once:true});
    const generate=actionButton('生成 3 個開局',()=>{
        if(busy||starting||closed)return;
        if(!work.value.trim()){notice.textContent='請輸入作品名稱。';work.focus();return;}
        const input:ExistingWorldInput={work:work.value.trim(),character:character.value.trim(),startingPoint:point.value.trim(),comment:comment.value};
        const signature=JSON.stringify(input);
        if(signature===previousSignature)input.previous=previous;
        busy=true;generate.disabled=true;generate.textContent='AI 構思開局中…';
        notice.textContent='建立獨立故事分支，未改動任何現有世界。';
        void (async()=>{
            try{
                const results=await deps.generateExistingWorldIdeas(input);
                if(closed)return;
                previous=results;previousSignature=signature;ideas.replaceChildren();
                for(const idea of results){
                    const opts=existingIdeaToWorldOptions(idea,input);
                    const card=element('article','wl-world-idea');
                    card.append(element('h3','',idea.title),element('p','wl-note',input.work),element('p','',idea.premise));
                    const details=element('details','wl-chronicle');
                    details.append(element('summary','','主角、能力及可能主線'),element('p','','主角：'+opts.protagonist),element('p','','能力：'+idea.goldenFinger),element('p','','主線：'+idea.mainQuest));
                    const buttons=element('div','wl-actions');
                    buttons.append(actionButton('進入呢個世界',()=>{
                        if(busy||starting||closed)return;
                        starting=true;
                        try{startWorld(deps,dialog,opts);}catch(e){starting=false;notice.textContent=e instanceof Error?e.message:'建立世界失敗';}
                    },true),actionButton('修改設定',()=>{
                        if(busy||starting||closed)return;
                        dialog.close();openStart(deps,'new',opts);
                    }));
                    card.append(details,buttons);ideas.appendChild(card);
                }
                notice.textContent='揀一個開局；原著資料由模型知識生成，細節可以先修改。';
            }catch(e){if(!closed)notice.textContent=e instanceof Error?e.message:'世界構想生成失敗，請再試。';}
            finally{busy=false;if(!closed){generate.disabled=false;generate.textContent=previous.length?'再抽 3 個開局':'生成 3 個開局';}}
        })();
    },true);
    actions.append(generate,actionButton('返回原創世界',()=>{if(starting)return;dialog.close();openQuickStart(deps);}));
    body.append(actions,notice,ideas);dialog.appendChild(body);showDialog(dialog);
};
const openRecommendations=(deps:WorldlineUiDeps)=>{
    const dialog=createModal();
    header(dialog,'今日玩咩？','唔需要填任何設定，揀一種探索方式就可以。');
    const body=element('div','wl-form');
    const previousGenres=Object.values(parseWorldlineRegistry(localStorage.getItem(WORLDLINE_SETTING_KEY)).records).flatMap(row=>row.world?[row.world.genre]:[]).slice(0,12);
    const modes: Array<[WorldRecommendationMode,string,string]>=[
        ['similar','延續熟悉玩法','參考已建立世界嘅題材，創作三個新方向。'],
        ['different','試吓完全唔同','避開常玩題材，探索三個不同世界。'],
        ['inspiration','今日靈感','六個不同題材嘅即場創作。'],
        ['blind','盲盒世界','唔睇設定，直接進入第一幕。'],
    ];
    const comment=control(body,'額外偏好（選填）','textarea') as HTMLTextAreaElement;
    comment.rows=2;comment.maxLength=1000;comment.placeholder='例如：今次想玩輕鬆啲，唔想打怪。';
    const choices=element('div','wl-cast-body'),notice=element('p','wl-note'),results=element('div','wl-cast-body');
    notice.setAttribute('aria-live','polite');
    let busy=false,closed=false,starting=false,lastMode:WorldRecommendationMode|undefined,lastComment='',previous:WorldIdea[]=[];
    dialog.addEventListener('close',()=>{closed=true;},{once:true});
    const buttons:HTMLButtonElement[]=[];
    const generate=(mode:WorldRecommendationMode)=>{
        if(busy||closed||starting)return;
        busy=true;buttons.forEach(b=>b.disabled=true);results.replaceChildren();
        const preference=comment.value;
        const input:WorldIdeaInput={topics:[],comment:preference,recommendation:mode,pastGenres:mode==='similar'||mode==='different'?previousGenres:[],previous:mode===lastMode&&lastComment===preference?previous:[]};
        notice.textContent=mode==='blind'?'正在創造未知世界，唔會預先展示設定。':'AI 正構思新世界…';
        void (async()=>{
            try{
                const ideas=await deps.generateWorldIdeas(input);
                if(closed)return;
                previous=ideas;lastMode=mode;lastComment=preference;
                if(mode==='blind'){
                    starting=true;
                    const opts=ideaToWorldOptions(ideas[0]);
                    startWorld(deps,dialog,{...opts,title:'盲盒世界',blindStart:true});
                    return;
                }
                for(const idea of ideas){
                    const card=element('article','wl-world-idea');
                    card.append(element('h3','',idea.title),element('p','wl-note',worldlineGenreLabel(idea.genre)),element('p','',idea.premise));
                    const detail=element('details','wl-chronicle');
                    detail.append(element('summary','','主角、能力及主線'),element('p','','主角：'+idea.protagonist),element('p','','能力／資源：'+idea.goldenFinger),element('p','','主線：'+idea.mainQuest));
                    const actions=element('div','wl-actions');
                    actions.append(actionButton('開始呢個世界',()=>{
                        if(busy||starting||closed)return;
                        starting=true;try{startWorld(deps,dialog,ideaToWorldOptions(idea));}catch(e){starting=false;notice.textContent=e instanceof Error?e.message:'建立世界失敗';}
                    },true),actionButton('修改設定',()=>{
                        if(busy||starting||closed)return;dialog.close();openStart(deps,'new',ideaToWorldOptions(idea));
                    }));
                    card.append(detail,actions);results.appendChild(card);
                }
                notice.textContent='揀一個開始，或者再撳同一個玩法抽新世界。';
            }catch(e){starting=false;if(!closed)notice.textContent=e instanceof Error?e.message:'生成失敗，請再試。';}
            finally{busy=false;if(!closed)buttons.forEach(b=>b.disabled=false);}
        })();
    };
    for(const [mode,label,description] of modes){
        const item=element('div','wl-world-idea');
        const btn=actionButton(label,()=>generate(mode),mode==='blind');
        buttons.push(btn);item.append(btn,element('p','wl-note',description));choices.appendChild(item);
    }
    body.append(choices,notice,results,actionButton('返回開新世界',()=>{if(starting)return;dialog.close();openQuickStart(deps);}));
    dialog.appendChild(body);showDialog(dialog);
};
const openQuickStart=(deps:WorldlineUiDeps)=>{
    const dialog=createModal();
    header(dialog,'開啟新世界','揀一個或多個題材，AI 幫你創作三個完整世界。');
    const body=element('div','wl-form');
    const entrances=element('div','wl-actions');
    entrances.append(actionButton('今日玩咩？',()=>{dialog.close();openRecommendations(deps);},true),actionButton('進入原著世界（漫畫／小說／遊戲）',()=>{dialog.close();openExistingWorld(deps);}));
    body.appendChild(entrances);
    const chosen=new Set<string>();
    const topics=element('div','wl-actions wl-topic-grid');
    for(const [topic] of WORLD_TOPICS){
        const button=actionButton(topic,()=>{
            if(chosen.has(topic))chosen.delete(topic);else chosen.add(topic);
            button.setAttribute('aria-pressed',String(chosen.has(topic)));
        });
        button.setAttribute('aria-pressed','false');
        topics.appendChild(button);
    }
    body.append(element('p','wl-note','可以混合題材，唔揀亦得，交畀 AI 自由發揮。'),topics);
    const comment=control(body,'有咩特別想玩？（選填）','textarea') as HTMLTextAreaElement;
    comment.rows=2;comment.maxLength=1000;comment.placeholder='例如：由小人物開始，擅長經營，唔想太快無敵。';
    const actions=element('div','wl-actions');
    const notice=element('p','wl-note');notice.setAttribute('aria-live','polite');
    const ideas=element('div','wl-cast-body');
    let previous:WorldIdea[]=[];let busy=false;let closed=false;let starting=false;
    dialog.addEventListener('close',()=>{closed=true;},{once:true});
    const generate=actionButton('生成 3 個世界',()=>{
        if(busy||starting)return;
        busy=true;generate.disabled=true;generate.textContent='AI 構思世界中…';
        notice.textContent='根據你選擇嘅題材創作，未建立任何世界。';
        const input:WorldIdeaInput={topics:[...chosen],comment:comment.value,previous};
        void (async()=>{
            try{
                const results=await deps.generateWorldIdeas(input);
                if(closed)return;
                previous=results;
                ideas.replaceChildren();
                for(const idea of results){
                    const card=element('article','wl-world-idea');
                    card.append(element('h3','',idea.title),element('p','wl-note',worldlineGenreLabel(idea.genre)),element('p','',idea.premise));
                    const details=element('details','wl-chronicle');
                    details.append(element('summary','','主角、能力及故事主線'),element('p','','主角：'+idea.protagonist),element('p','','能力／資源：'+idea.goldenFinger),element('p','','主線：'+idea.mainQuest));
                    const buttons=element('div','wl-actions');
                    buttons.append(actionButton('開始呢個世界',()=>{
                        if(busy||starting||closed)return;
                        starting=true;
                        try{startWorld(deps,dialog,ideaToWorldOptions(idea));}
                        catch(e){starting=false;notice.textContent=e instanceof Error?e.message:'建立世界失敗';}
                    },true),actionButton('修改設定',()=>{
                        if(busy||starting||closed)return;
                        dialog.close();openStart(deps,'new',ideaToWorldOptions(idea));
                    }));
                    card.append(details,buttons);ideas.appendChild(card);
                }
                notice.textContent='揀一個直接開始，或者修改設定。未揀中嘅構想唔會建立對話。';
            }catch(e){if(!closed)notice.textContent=e instanceof Error?e.message:'世界構想生成失敗，請再試。';}
            finally{busy=false;if(!closed){generate.disabled=false;generate.textContent=previous.length?'再抽 3 個世界':'生成 3 個世界';}}
        })();
    },true);
    actions.append(generate,actionButton('手動建立',()=>{if(starting)return;dialog.close();openStart(deps,'new');}));
    body.append(actions,notice,ideas);
    dialog.appendChild(body);showDialog(dialog);
};
const openStart=(deps:WorldlineUiDeps,preferred:'new'|'current',initial?:WorldlineStartOptions)=>{
    const dialog=createModal();
    header(dialog,'開啟新世界線','自由世界、長篇主線、金手指與成人角色關係都可以同時存在');
    const form=element('form','wl-form');
    form.noValidate=true;
    form.addEventListener('submit',event=>event.preventDefault());
    const title=control(form,'世界名稱','input',initial?.title||'我的新世界');
    (title as HTMLInputElement).maxLength=100;
    const genre=control(form,'世界類型','select') as HTMLSelectElement;
    genres.forEach(([id,label])=>{
        const o=document.createElement('option');o.value=id;o.textContent=label;genre.appendChild(o);
    });
    genre.value=initial?.genre||'xianxia';
    const premise=control(form,'開局構想（最重要）','textarea',
        initial?.premise||'我轉生到一個有獨立勢力同人物生活的世界。世界會因為我嘅行動改變，但唔係所有人都圍住我轉。') as HTMLTextAreaElement;
    premise.maxLength=1700;premise.rows=4;
    const protagonist=control(form,'主角身份','input',initial?.protagonist||'保留我自己嘅人格與選擇，由新世界安排初始身份');
    const golden=control(form,'金手指／系統能力','textarea',
        initial?.goldenFinger||'一種可以持續成長、玩法自由嘅獨特系統；由故事揭示真正用途') as HTMLTextAreaElement;
    golden.maxLength=700;golden.rows=2;
    const quest=control(form,'主線目標（留空會喺開始時自動生成）','textarea',initial?.mainQuest||'') as HTMLTextAreaElement;
    quest.maxLength=550;quest.rows=3;
    quest.placeholder='按「🎲 AI 隨機生成主線」，或者直接輸入你自己嘅故事。';
    const questTools=element('div','wl-quest-tools');
    const randomButton=element('button','wl-button wl-random-quest','🎲 AI 隨機生成主線');
    randomButton.type='button';
    const questNotice=element('p','wl-quest-feedback','由 AI 根據世界、身份同金手指原創主線；可以再抽或者修改。');
    questNotice.setAttribute('aria-live','polite');
    questTools.append(randomButton,questNotice);
    form.appendChild(questTools);
    let generatingQuest=false;
    let startInProgress=false;
    let closed=false;
    dialog.addEventListener('close',()=>{closed=true;},{once:true});
    const generateQuest=async ():Promise<string>=>{
        if(generatingQuest)throw Error('上一條主線仲喺生成中。');
        if(!premise.value.trim())throw Error('請先設定世界背景。');
        const previousQuest=quest.value.trim();
        const input:RandomMainQuestInput={
            title:title.value.trim()||'未命名世界',
            genre:genre.value as WorldlineGenre,
            premise:premise.value.trim(),
            protagonist:protagonist.value.trim(),
            goldenFinger:golden.value.trim(),
            previousQuest,
        };
        generatingQuest=true;
        randomButton.disabled=true;
        create.disabled=true;
        randomButton.textContent='主線創作中…';
        setStatus(questNotice,'AI 正按目前世界設定生成主線，唔會預設人物關係。');
        try{
            const generated=await deps.generateRandomQuest(input);
            if(closed)throw Error('世界線視窗已關閉。');
            if(quest.value.trim()!==previousQuest){
                setStatus(questNotice,'你已手動修改主線，保留你嘅文字。');
                return quest.value.trim();
            }
            quest.value=generated;
            setStatus(questNotice,'已生成新主線。你可以再抽一次，或者直接編輯。');
            return generated;
        }catch(error){
            const msg=error instanceof Error?error.message:'主線生成失敗';
            if(!closed)setStatus(questNotice,msg);
            throw error;
        }finally{
            generatingQuest=false;
            randomButton.disabled=false;
            create.disabled=false;
            randomButton.textContent=quest.value.trim()
                ? '🎲 再抽一條新主線':'🎲 AI 隨機生成主線';
        }
    };
    randomButton.addEventListener('click',()=>{
        void generateQuest().catch(()=>{ /* feedback already visible */ });
    });
    const options=element('div','wl-settings-row');
    const pacing=element('label','wl-inline');
    pacing.appendChild(element('span','','節奏'));
    const pace=document.createElement('select');pace.className='wl-input';
    [['story','有主線但自由探索'],['free','完全開放世界']].forEach(([v,t])=>{
        const o=document.createElement('option');o.value=v;o.textContent=t;pace.appendChild(o);
    });
    if(initial?.tone)pace.value=initial.tone;
    pacing.appendChild(pace);
    const adult=element('label','wl-inline');
    adult.appendChild(element('span','','關係線'));
    const romance=document.createElement('select');romance.className='wl-input';
    [['adult','成人向戀愛／NSFW 支線'],['normal','一般關係與冒險']].forEach(([v,t])=>{
        const o=document.createElement('option');o.value=v;o.textContent=t;romance.appendChild(o);
    });
    if(initial?.relationshipMode)romance.value=initial.relationshipMode;
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
    if(preferred==='new')actions.appendChild(actionButton('AI 快速建立',()=>{dialog.close();openQuickStart(deps);}));
    const create=element('button','wl-button wl-primary','開始序章');
    create.type='button';
    create.addEventListener('click',()=>{
        if(startInProgress||generatingQuest)return;
        startInProgress=true;
        create.disabled=true;
        void (async()=>{
            try{
                if(!premise.value.trim())throw Error('請輸入你想玩嘅世界背景。');
                if(!quest.value.trim())await generateQuest();
                if(closed)return;
            const opts:WorldlineStartOptions={
                title:title.value.trim()||'未命名世界',genre:genre.value as WorldlineGenre,
                premise:premise.value.trim(),protagonist:protagonist.value.trim(),
                goldenFinger:golden.value.trim(),mainQuest:quest.value.trim(),
                relationshipMode:romance.value==='adult'?'adult':'normal',
                tone:pace.value==='free'?'free':'story',
            };
            const original=deps.getActiveConversation();
            const attach=Boolean(b?.checked&&original&&!original.isAssistant);
            startWorld(deps,dialog,opts,attach?original!.key:undefined);
            }catch(e){
                if(!closed)setStatus(notice,e instanceof Error?e.message:'世界線建立失敗');
            }finally{
                startInProgress=false;
                create.disabled=false;
            }
        })();
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
    const os=element('details','wl-cast');
    os.open=true;
    os.appendChild(element('summary','','World OS · 世界百科與歷史重建'));
    const osStatus=element('p','wl-note');
    osStatus.setAttribute('aria-live','polite');
    const search=element('input','wl-input');
    search.placeholder='搜尋人物、能力、研究、主線、情報…';
    search.type='search';
    const subjectFilter=element('select','wl-input');
    subjectFilter.setAttribute('aria-label','依人物／研究項目篩選');
    const rows=element('div','wl-cast-body');
    let stopped=false;
    let rebuilding=false;
    let sectionClosed=false;
    dialog.addEventListener('close',()=>{stopped=true;sectionClosed=true;},{once:true});
    const renderOs=()=>{
        const state=deps.getWorldLedger(key);
        osStatus.textContent='已完整分析 '+state.processed+' / '+state.total+' 則原始訊息；'+(state.partial?'另有 '+state.partial+' 則已保存部分證據，待補核；':'')+state.current.length+' 項狀態，'+state.open.length+' 項尚未標記完成的紀錄（不等於獨立任務），'+state.conflicts.length+' 項待核對衝突。';
        const query=search.value.trim().normalize('NFKC').toLocaleLowerCase();
        const previousSubject=subjectFilter.value;
        const subjects=[...new Set(state.timeline.map(x=>x.subject))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
        subjectFilter.replaceChildren();
        const allSubjects=element('option','','全部人物／項目');allSubjects.value='';subjectFilter.appendChild(allSubjects);
        for(const subject of subjects){const option=element('option','',subject);option.value=subject;subjectFilter.appendChild(option);}
        if(subjects.includes(previousSubject))subjectFilter.value=previousSubject;
        const selectedSubject=subjectFilter.value;
        rows.replaceChildren();
        const categories=[
            ['當前人物與世界狀態',state.current],
            ['未完成研究／故事線',state.open],
            ['已標記完成',state.current.filter(x=>['thread','research','goal','faction'].includes(x.kind)&&x.state==='resolved')],
            ['假設、計劃及未證實說法',state.uncertain],
            ['衝突：保留原有資料，待核對',state.conflicts],
            ['歷史事件紀錄',state.timeline],
        ] as const;
        for(const [label,items] of categories){
            const filtered=items.filter(x=>(!selectedSubject||x.subject===selectedSubject)&&(!query||[x.subject,x.key,x.value,x.kind,x.state].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query)));
            if(!filtered.length)continue;
            const group=element('details','wl-chronicle');
            group.open=Boolean(query)||label==='未完成研究／故事線';
            group.appendChild(element('summary','',label+'（'+filtered.length+'）'));
            const ordered=filtered.slice().reverse();
            const pageSize=30;let page=0;
            const entries=element('div','wl-cast-body'),nav=element('div','wl-cast-body');
            const renderPage=()=>{
                entries.replaceChildren();nav.replaceChildren();
                const first=page*pageSize,last=Math.min(first+pageSize,ordered.length);
                for(const item of ordered.slice(first,last)){
                    const row=element('details','wl-chronicle');
                    row.appendChild(element('summary','',item.subject+' · '+item.key+'：'+item.value+' ['+item.state+']'));
                    row.appendChild(element('p','','原文 #'+(item.position+1)+'：'+item.quote));
                    entries.appendChild(row);
                }
                nav.appendChild(element('p','wl-note','顯示 '+(first+1)+'–'+last+' / '+ordered.length+' 項 · 第 '+(page+1)+' / '+Math.ceil(ordered.length/pageSize)+' 頁'));
                if(page>0)nav.appendChild(actionButton('上一頁',()=>{page--;renderPage();}));
                if(last<ordered.length)nav.appendChild(actionButton('下一頁',()=>{page++;renderPage();}));
                if(ordered.length>pageSize){
                    const jump=element('input','wl-input');jump.type='number';jump.min='1';jump.max=String(Math.ceil(ordered.length/pageSize));jump.value=String(page+1);jump.setAttribute('aria-label','前往頁數');
                    nav.append(jump,actionButton('前往指定頁',()=>{const n=Number(jump.value);if(Number.isInteger(n)&&n>=1&&n<=Math.ceil(ordered.length/pageSize)){page=n-1;renderPage();}}));
                }
            };
            group.append(entries,nav);renderPage();
            rows.appendChild(group);
        }
    };
    const rebuild=actionButton('重建原有故事（自動分批）',()=>{
        if(rebuilding){stopped=true;rebuild.textContent='正在停止…';return;}
        rebuilding=true;stopped=false;rebuild.textContent='停止重建';
        const deferred=new Set<string>();let blocked=0;
        void (async()=>{
            try{
                while(!stopped&&!sectionClosed){
                    const before=deps.getWorldLedger(key);
                    if(before.processed>=before.total)break;
                    osStatus.textContent='分析原始故事中… '+before.processed+' / '+before.total+'。細批核對，失敗會自動縮批重試。已保存紀錄保留。';
                    const result=await deps.rebuildWorldLedger(key,[...deferred]);
                    if(sectionClosed)break;
                    const after=deps.getWorldLedger(key);
                    result.deferred.forEach(id=>deferred.add(id));
                    renderOs();
                    if(after.processed>before.processed){blocked=0;continue;}
                    if(result.deferred.length){
                        blocked++;
                        if(blocked>=3){
                            osStatus.textContent='重建暫停：連續三則訊息未能完整核對。已完成 '+after.processed+' / '+after.total+'，未核對部分保留，可再重試。';
                            break;
                        }
                        continue;
                    }
                    if(after.processed<after.total)osStatus.textContent='本輪完成可核對部分：'+after.processed+' / '+after.total+'；'+deferred.size+' 則需重新核對，按繼續可再試。';
                    break;
                }
            }catch(e){if(!sectionClosed)osStatus.textContent='重建暫停：'+(e instanceof Error?e.message:'未能核對資料')+'。已完成批次保留，可再繼續。';}
            finally{rebuilding=false;rebuild.textContent='繼續／重建原有故事';}
        })();
    });
    search.addEventListener('input',renderOs);
    subjectFilter.addEventListener('change',renderOs);
    os.append(osStatus,rebuild,search,subjectFilter,rows);
    body.appendChild(os);
    renderOs();
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
        dialog.close();openQuickStart(deps);
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
    if(source==='new')openQuickStart(deps);else openStart(deps,source);
};
