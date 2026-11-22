import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createComposerAutoSize } from '../composerAutoSize.js';

const createHarness = (native = false) => {
    let reads = 0;
    let nextHeight = 96;
    let seq = 1;
    const frames = new Map<number,FrameRequestCallback>();
    const changes: string[] = [];
    const storage = new Map<string,string>();
    const style = {
        height: '44px',
        overflowY: 'hidden',
        setProperty(key:string,value:string,priority?:string) {
            storage.set(key,value);
            if(key==='height')this.height=value;
            changes.push(`set:${key}:${value}:${priority||''}`);
        },
        removeProperty(key:string) {
            if(key==='height')this.height='';
            if(key==='overflow-y')this.overflowY='';
            changes.push(`remove:${key}`);
            return storage.get(key)||'';
        },
    };
    const element = {
        scrollTop:1,
        style,
        get scrollHeight() { reads++; return nextHeight; },
    };
    let v2 = true;
    const controller = createComposerAutoSize({
        textarea: element,
        isV2: () => v2,
        nativeContentSizing: () => native,
        requestFrame: f => { const id=seq++;frames.set(id,f);return id; },
        cancelFrame: id => { frames.delete(id); },
        classicHeight:'48px',
    });
    const flush = () => {
        for(const [id,f] of Array.from(frames)) {frames.delete(id);f(0);}
    };
    return {element,controller,frames,flush,changes,
      get reads(){return reads;},
      set height(value:number){nextHeight=value;},
      set isV2(value:boolean){v2=value;},
    };
};

test('native content sizing performs zero scrollHeight/layout reads during typing',()=>{
    const h=createHarness(true);
    for(let i=0;i<70;i++)h.controller.sync();
    assert.equal(h.reads,0);
    assert.equal(h.frames.size,0);
    assert.deepEqual(h.changes,[]);
    h.controller.reset();
    assert.equal(h.reads,0);
    assert.match(h.changes.join(','),/remove:height/);
});

test('unsupported browsers batch 100 input events into one deferred layout measure',()=>{
    const h=createHarness(false);
    for(let i=0;i<100;i++)h.controller.sync();
    assert.equal(h.reads,0);
    assert.equal(h.frames.size,1);
    h.flush();
    assert.equal(h.reads,1);
    assert.equal(h.element.style.height,'96px');
    assert.equal(h.element.style.overflowY,'hidden');
});

test('deferred fallback clamps height and overflow with only one layout read per frame',()=>{
    const h=createHarness(false);
    h.height=450;
    h.controller.sync();
    h.flush();
    assert.equal(h.reads,1);
    assert.equal(h.element.style.height,'136px');
    assert.equal(h.element.style.overflowY,'auto');
    h.height=15;
    h.controller.sync();
    h.flush();
    assert.equal(h.reads,2);
    assert.equal(h.element.style.height,'44px');
});

test('clearing composer cancels pending layout work and does not revive stale height',()=>{
    const h=createHarness(false);
    h.controller.sync();
    assert.equal(h.frames.size,1);
    h.controller.reset();
    assert.equal(h.frames.size,0);
    h.flush();
    assert.equal(h.reads,0);
    assert.equal(h.element.style.height,'44px');
    assert.equal(h.element.scrollTop,0);
});

test('classic layout remains fixed without measuring scrollHeight',()=>{
    const h=createHarness(false);
    h.isV2=false;
    h.controller.sync();
    h.controller.reset();
    assert.equal(h.reads,0);
    assert.equal(h.element.style.height,'48px');
});

test('UI2 input listener does not directly measure scrollHeight or mutate height',()=>{
    const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
    const css=readFileSync(new URL('../ui-v2.css',import.meta.url),'utf8');
    const callback=app.match(/messageInput\.addEventListener\('input', \(\) => \{([\s\S]*?)\n\s*\}\);/);
    assert.ok(callback);
    assert.doesNotMatch(callback![1],/scrollHeight|offsetHeight|style\.height|setProperty/);
    assert.match(callback![1],/syncMessageInputHeight\(\)/);
    assert.match(css,/@supports \(field-sizing: content\)/);
    assert.match(app,/createComposerAutoSize\(/);
});
