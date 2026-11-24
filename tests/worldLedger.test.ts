import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLedger, parseWorldExtraction, appendWorldBatches, getValidBatches,
  pendingWorldSources, projectWorld, compileWorldLedger, mergeLedgers,
  selectWorldBatch, copyWorldLedgerAt, scopedWorldLedger, sourceFingerprint,
  type Observation,
} from '../worldLedger.js';
import { makeWorldline, forkWorldlineAt, updateWorldlineRegistry, getWorldline, parseWorldlineRegistry, scopedWorldlineRegistry } from '../worldline.js';
import type { WorldSource } from '../worldOs.js';
const msg=(id:string,text:string,role:'user'|'model'|'system'='model'):WorldSource=>({id,role,content:{text}});
const a=msg('a','青禾又名阿禾。青禾是守衛，擅長符文。');
const b=msg('b','青禾得知古門的位置。研究甲尚未完成。');
const c=msg('c','阿禾突破至第二境。研究甲完成。');
const d=msg('d','我想得到第三境，可能要找一枚晶石。','user');
const e=msg('e','青禾是商人。');
const sys=msg('system','系統通知：邀請其他角色。','system');
const obs=(source:WorldSource,quote:string,kind:Observation['kind'],subject:string,key:string,value:string,state:Observation['state']='established'):Observation=>({sourceId:source.id!,quote,kind,subject,key,value,state});
const rows=[
 obs(a,'青禾又名阿禾','alias','青禾','alias','阿禾'),
 obs(a,'青禾是守衛','identity','青禾','role','守衛'),
 obs(a,'擅長符文','ability','青禾','realm','初境'),
 obs(b,'青禾得知古門的位置','knowledge','青禾','secret','古門的位置'),
 obs(b,'研究甲尚未完成','research','玩家','研究甲','未完成'),
 obs(c,'阿禾突破至第二境','ability','阿禾','realm','第二境','change'),
 obs(c,'研究甲完成','research','玩家','研究甲','完成','resolved'),
 obs(d,'我想得到第三境','ability','青禾','realm','第三境','plan'),
 obs(e,'青禾是商人','identity','青禾','role','商人'),
];
const history=[a,b,c,d,e,sys];
const all=()=>appendWorldBatches(emptyLedger(),'world',parseWorldExtraction(JSON.stringify({observations:rows}),history,100),history);
test('exact source quote, unsupported category and unrelated source are rejected',()=>{
 assert.throws(()=>parseWorldExtraction(JSON.stringify({observations:[{...rows[0],quote:'沒有這句'}]}),[a]));
 assert.throws(()=>parseWorldExtraction(JSON.stringify({observations:[{...rows[0],kind:'anything'}]}),[a]));
 assert.throws(()=>parseWorldExtraction(JSON.stringify({observations:[rows[0]]}),[b]));
});
test('historical projection resolves alias, preserves identities, and distinguishes plan from current ability',()=>{
 const p=projectWorld(all(),'world',history);
 assert.equal(p.processed,5);assert.equal(p.total,5);
 assert.equal(p.current.find(x=>x.kind==='ability')?.value,'第二境');
 assert.equal(p.current.find(x=>x.kind==='identity')?.value,'守衛');
 assert.equal(p.conflicts[0].value,'商人');
 assert.equal(p.uncertain[0].value,'第三境');
 assert.equal(p.current.filter(x=>x.kind==='ability').length,1);
 assert.equal(p.open.length,0);
 assert.equal(p.current.find(x=>x.kind==='knowledge')?.subject,'青禾');
});
test('branch prefix excludes later abilities, resolved research and unconfirmed plans',()=>{
 const ledger=copyWorldLedgerAt(all(),'world','branch',[a,b]);
 const p=projectWorld(ledger,'branch',[a,b]);
 assert.equal(p.current.find(x=>x.kind==='ability')?.value,'初境');
 assert.equal(p.open[0].value,'未完成');
 assert.equal(p.uncertain.length,0);
 assert.equal(projectWorld(ledger,'world',history).processed,5);
});
test('edited or deleted source no longer certifies state; pending work is recoverable',()=>{
 const ledger=all(), edited=msg('c','這段故事已經修改。');
 assert.notEqual(sourceFingerprint(c),sourceFingerprint(edited));
 assert.equal(getValidBatches(ledger,'world',[a,b,edited]).length,2);
 assert.deepEqual(pendingWorldSources(ledger,'world',[a,b,edited]).map(x=>x.id),['c']);
 assert.equal(projectWorld(ledger,'world',[a,b,edited]).open.length,1);
});
test('incremental batches merge by source without deleting unrelated worlds',()=>{
 const one=appendWorldBatches(emptyLedger(),'world',parseWorldExtraction(JSON.stringify({observations:rows.slice(0,3)}),[a],100),[a]);
 const two=appendWorldBatches(emptyLedger(),'world',parseWorldExtraction(JSON.stringify({observations:rows.slice(3,5)}),[b],200),[b]);
 const merged=mergeLedgers(one,two);
 assert.equal(projectWorld(merged,'world',[a,b]).processed,2);
 assert.deepEqual(Object.keys(scopedWorldLedger(merged,'other').worlds),[]);
 assert.equal(selectWorldBatch([a,b,c],true,30).at(-1)?.id,'c');
});
test('context distinguishes uncertainty and identity conflict from current state',()=>{
 const text=compileWorldLedger(all(),'world',history,'青禾');
 assert.match(text,/CURRENT.*第二境/);
 assert.match(text,/UNCONFIRMED.*第三境/);
 assert.match(text,/CONFLICT.*商人/);
 assert.match(text,/knowledge.*古門/);
});
test('fork retains opening not later editable powers or progress; registry never drops older worlds silently',()=>{
 const initial=makeWorldline('world',{title:'古門',genre:'xianxia',premise:'古門初始',mainQuest:'初始主線'});
 const changed={...initial,mainQuest:'未來主線',ability:'未來境界'};
 const fork=forkWorldlineAt(changed,'branch',[msg('start','【世界線開局】\n我嘅設定：初始世界\n主角身份：旅人。金手指：解構\n主線方向：初始主線','user')]);
 assert.equal(fork.conversationKey,'branch');assert.equal(fork.mainQuest,'初始主線');assert.equal(fork.goldenFinger,'解構');assert.notEqual(fork.ability,'未來境界');
 let register=updateWorldlineRegistry(null,'world',changed);
 for(let i=0;i<25;i++)register=updateWorldlineRegistry(register,'w'+i,{...initial,conversationKey:'w'+i});
 assert.equal(Object.keys(parseWorldlineRegistry(JSON.stringify(register)).records).length,26);
 assert.equal(getWorldline(scopedWorldlineRegistry(register,'world'),'world')?.mainQuest,'未來主線');
});
