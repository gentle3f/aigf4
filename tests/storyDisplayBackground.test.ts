import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokenizeStoryInline} from '../storyInline.js';
import {makeSilentWave,BACKGROUND_MEDIA_SECONDS,createBackgroundMedia} from '../backgroundMedia.js';
test('story emphasis renders without marker characters; unformatted text remains intact',()=>{
 const raw='**青禾**輕聲道：*走吧*，接着說「***快走***」。';
 assert.deepEqual(tokenizeStoryInline(raw).filter(x=>x.kind!=='text'),[{kind:'strong',text:'青禾'},{kind:'em',text:'走吧'},{kind:'strong',text:'快走'}]);
 assert.equal(tokenizeStoryInline(raw).map(x=>x.text).join(''),'青禾輕聲道：走吧，接着說「快走」。');
 assert.deepEqual(tokenizeStoryInline('2 * 3 = 6；未完成的 *'),[{kind:'text',text:'2 * 3 = 6；未完成的 *'}]);
 assert.equal(tokenizeStoryInline('<img src=x> **文字**')[0].text,'<img src=x> ');
});
test('silent WAV has finite duration, valid 8-bit PCM header and no audible samples',()=>{
 const bytes=makeSilentWave(1),view=new DataView(bytes.buffer);
 assert.equal(String.fromCharCode(...bytes.slice(0,4)),'RIFF');
 assert.equal(String.fromCharCode(...bytes.slice(8,12)),'WAVE');
 assert.equal(view.getUint32(24,true),8000);
 assert.equal(view.getUint32(40,true),8000);
 assert.ok(bytes.slice(44).every(n=>n===128));
 assert.ok(BACKGROUND_MEDIA_SECONDS<=300);
});
test('media is opt-in; absent browser APIs fail harmlessly',()=>{
 const manager=createBackgroundMedia();
 assert.equal(manager.enabled(),false);
 manager.start(7);
 assert.equal(manager.getState(),'idle');
 manager.stop(7);
});
test('render-only emphasis and background audio integrate with request lifecycle',()=>{
 const source=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(source,/appendStoryInline\(text, segment\.text\)/);
 assert.match(source,/if\(sender === 'bot'\) appendStoryInline\(textElement,content\.text\)/);
 assert.match(source,/worldlineBackgroundMedia\.start\(request\.id\)/);
 assert.match(source,/worldlineBackgroundMedia\.stop\(request\.id\)/);
 assert.match(source,/worldlineBackgroundMedia\.start\(mediaOwner\)/);
 assert.match(source,/worldline-background-media-btn/);
});
