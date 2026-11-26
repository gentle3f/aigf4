import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeWorldline,getWorldline,updateWorldlineRegistry} from '../worldline.js';
import {digestWorldlineContext,verifyWorldlineAppliedPrefix,commitWorldlineReply} from '../durableWorldlineTurn.js';
import {digestVpsHistory} from '../vpsChatMode.js';
import {createDurableChatTurn,type TurnReceipt} from '../durableChatTurn.js';

const uid='12345678-1234-4234-8234-123456789abc',jid='12345678-1234-4234-8234-123456789abd',rid='12345678-1234-4234-8234-123456789abe';
const world=makeWorldline('w',{title:'Village',genre:'fantasy',premise:'Explore an old village'},1000);
const user={id:uid,role:'user',createdAt:1001,content:{text:'Walk to the well'}};
const reply={id:rid,role:'model',createdAt:1002,content:{text:'The well is quiet.'}};
const preferences={director:{next:{id:'note',text:'Use a concise style'}},fixedPrompt:'Narrate in Traditional Chinese',variableOverride:{turn:0,text:'At the village'}};
test('world context fingerprint changes on world, ledger, fixed or variable instruction changes',async()=>{
 const ledger={events:['arrival']};
 const original=await digestWorldlineContext(world,ledger,preferences);
 assert.equal(original,await digestWorldlineContext(world,{events:['arrival']},structuredClone(preferences)));
 for(const [w,l,p] of [[{...world,turnCount:1},ledger,preferences],[world,{events:['different']},preferences],[world,ledger,{...preferences,fixedPrompt:''}],[world,ledger,{...preferences,variableOverride:{turn:0,text:'Changed'}}],[world,ledger,{...preferences,director:{}}]] as const)assert.notEqual(await digestWorldlineContext(w,l,p),original);
});
test('accepted reply updates chronicle once and survives registry serialization',()=>{
 const committed=commitWorldlineReply(world,rid,user.content.text,reply.content.text);
 assert.equal(committed.turnCount,1);
 assert.equal(committed.chronicle[0].sourceMessageId,rid);
 const reloaded=getWorldline(JSON.stringify(updateWorldlineRegistry(null,'w',committed)),'w')!;
 assert.equal(commitWorldlineReply(reloaded,rid,user.content.text,reply.content.text),reloaded);
});
test('recovery rejects recalled, reordered or edited source messages',async()=>{
 const r:TurnReceipt={conversationKey:'w',personaKey:'w',userMessageId:uid,jobId:jid,replyId:rid,createdAt:1000,model:'glm-5-3-flash-uncensored',contextDigestVersion:2,contextDigest:await digestVpsHistory([user],2),worldDigest:await digestWorldlineContext(world,{},preferences)};
 assert.deepEqual(await verifyWorldlineAppliedPrefix([user,reply],r,false),{userIndex:0,replyIndex:1});
 await assert.rejects(verifyWorldlineAppliedPrefix([reply],r,false),/PREFIX_INVALID/);
 await assert.rejects(verifyWorldlineAppliedPrefix([{...user,content:{text:'edited'}},reply],r,false),/HISTORY_CHANGED/);
 await assert.rejects(verifyWorldlineAppliedPrefix([user,reply,{id:'later',role:'user'}],r,false),/ORDER_CHANGED/);
});
test('receipt binds world digest and rejects reuse with changed context',async()=>{
 const m=new Map<string,string>(),ids=[jid,rid];
 const storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}};
 const controller=createDurableChatTurn({storage,newId:()=>ids.shift()!,lock:fn=>fn(),history:{read:()=>[user],persistUser:async()=>{},persistReply:async()=>{},confirmReply:async()=>{}},transport:{submit:async id=>({job_id:id,status:'queued'}),get:async id=>({job_id:id,status:'queued'})}});
 const turn={conversationKey:'w',personaKey:'w',userMessageId:uid,contextDigestVersion:2 as const,contextDigest:await digestVpsHistory([user],2),worldDigest:await digestWorldlineContext(world,{},preferences)};
 await controller.submit(turn,{model:'glm-5-3-flash-uncensored',messages:[{role:'user',content:'fixture'}]});
 assert.equal(controller.pending()?.worldDigest,turn.worldDigest);
 await assert.rejects(controller.resume({...turn,worldDigest:'0'.repeat(64)}),/OTHER_CHAT_TURN_PENDING/);
});
test('real application wires world fingerprint and durable commit before receipt cleanup',()=>{
 const source=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(source,/await checkWorldlineTurnContext\(r\)/);
 assert.match(source,/verifyWorldlineAppliedPrefix\(history,r,exists\)/);
 assert.match(source,/commitWorldlineReply\(world,r.replyId/);
 assert.match(source,/worldDigest=await digestVpsWorld\(conversationKey\)/);
 assert.match(source,/!request.vpsTurn\?\.identity.worldDigest/);
});
