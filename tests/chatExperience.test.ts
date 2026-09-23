import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExperienceSuggestions } from '../chatExperience.js';

test('reads exactly three JSON next-message suggestions', () => {
    assert.deepEqual(
        parseExperienceSuggestions('```json\n{"suggestions":["第一句","第二句","第三句"]}\n```'),
        ['第一句', '第二句', '第三句'],
    );
});

test('does not leak a group chat envelope as a JSON parser error', () => {
    assert.throws(
        () => parseExperienceSuggestions('<chat>Jennie：「我聽見了。」</chat><scene>{}</scene>'),
        /未能整理接戲建議/u,
    );
});
