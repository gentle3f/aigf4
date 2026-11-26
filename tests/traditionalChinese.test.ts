import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHongKongTraditional} from '../traditionalChinese.js';

test('converts simplified narration including characters omitted by the old map',()=>{
 assert.equal(normalizeHongKongTraditional('龙骑士紧握剑柄，随后穿越森林。'),'龍騎士緊握劍柄，隨後穿越森林。');
 assert.equal(normalizeHongKongTraditional('她的头发被风吹乱了。'),'她的頭髮被風吹亂了。');
});
test('preserves traditional text and Latin identifiers',()=>{
 const input='龍騎士走進森林。 NPC A-01';
 assert.equal(normalizeHongKongTraditional(input),input);
 assert.equal(normalizeHongKongTraditional('Hello, 192!'),'Hello, 192!');
});
