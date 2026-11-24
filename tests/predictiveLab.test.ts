import test from 'node:test';
import assert from 'node:assert/strict';
import {PredictiveLab,type LabRequest} from '../predictiveLab.js';
const turn=()=>Promise.resolve();
test('identical submitted draft reuses in-flight candidate and spends one request',async()=>{
 let now=0;let calls=0;
 const request:LabRequest=async()=>{calls++;now+=80;return {text:'回覆',promptTokens:90,completionTokens:10};};
 const lab=new PredictiveLab(request,()=>{},5000,()=>now);
 lab.update('今晚想去食飯',true);lab.precompute();await turn();await turn();now+=20;
 const result=await lab.submit('今晚想去食飯');
 assert.equal(result.reused,true);assert.equal(calls,1);assert.equal(result.postSendMs,0);
 assert.equal(lab.history.length,2);assert.equal(lab.inputTokens,90);lab.close();
});
test('changed draft cancels candidate, never repeats speculative work, final uses exact input',async()=>{
 const sent:string[]=[];const signals:AbortSignal[]=[];
 const request:LabRequest=async(messages,signal)=>{sent.push(messages.at(-1)!.content);signals.push(signal);return {text:'回覆'};};
 const lab=new PredictiveLab(request,()=>{},5000);
 lab.update('今晚想去食飯',true);lab.precompute();await turn();
 lab.update('今晚唔去食飯',true);lab.precompute();await turn();
 const result=await lab.submit('今晚唔去食飯');
 assert.equal(result.reused,false);assert.deepEqual(sent,['今晚想去食飯','今晚唔去食飯']);
 assert.equal(signals[0].aborted,true);assert.equal(lab.discarded,1);
 assert.equal(lab.history[0].content,'今晚唔去食飯');lab.close();
});
test('normal comparison mode does not send unsent text',async()=>{
 let calls=0;const lab=new PredictiveLab(async()=>{calls++;return {text:'ok'};},()=>{},1);
 lab.update('這是尚未發出的草稿',false);
 await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);
 await lab.submit('這是尚未發出的草稿');assert.equal(calls,1);lab.close();
});
test('IME composition and closed lab do not launch a delayed request',async()=>{
 let calls=0;const lab=new PredictiveLab(async()=>{calls++;return {text:'ok'};},()=>{},1);
 lab.update('中文輸入法測試',true,true);await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);
 lab.update('中文輸入法測試',true,false);lab.close();await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);
});
test('failed speculative attempt falls back to final request; unknown costs are not invented',async()=>{
 let calls=0;const lab=new PredictiveLab(async()=>{if(++calls===1)throw Error('network');return {text:'ok'};},()=>{},1000);
 lab.update('測試失敗後重試',true);lab.precompute();const result=await lab.submit('測試失敗後重試');
 assert.equal(result.reused,false);assert.equal(calls,2);assert.equal(lab.unknownUsage,2);lab.close();
});
