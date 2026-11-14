import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    ASSISTANT_TOPIC_PREFIX,
    isAssistantConversationKey,
    listAssistantConversationKeys,
    getAssistantTopicTitle,
    parseAssistantTopicTitles,
    normalizeAssistantTopicTitle,
} from '../assistantTopics.js';
import {
    extractAssistantJsonExport,
    isAssistantTextFile,
    wrapAssistantFileText,
} from '../assistantFiles.js';

test('Venice topics preserve the legacy conversation and isolate new keys', () => {
    const legacy = 'venice_assistant';
    const topic = ASSISTANT_TOPIC_PREFIX + '1a2b-3c4d';
    assert.equal(isAssistantConversationKey(legacy, legacy), true);
    assert.equal(isAssistantConversationKey(topic, legacy), true);
    assert.equal(isAssistantConversationKey('cc', legacy), false);
    assert.deepEqual(
        listAssistantConversationKeys([legacy, 'cc', topic], { [topic]: 'JSON 修正' }, legacy),
        [legacy, topic],
    );
    assert.equal(getAssistantTopicTitle(legacy, legacy, {}), '原有對話');
    assert.equal(getAssistantTopicTitle(topic, legacy, { [topic]: 'JSON 修正' }), 'JSON 修正');
});

test('topic names sanitize malformed, oversized and cross-character data', () => {
    const legacy = 'assistant';
    const topic = ASSISTANT_TOPIC_PREFIX + '0f8';
    const titles = parseAssistantTopicTitles(JSON.stringify({
        [topic]: '  程序 \n　開發  ',
        'cc': 'should not become Venice topic',
    }));
    assert.deepEqual({ ...titles }, { [topic]: '程序 開發' });
    assert.equal(normalizeAssistantTopicTitle('  \nX  Y  '), 'X Y');
    assert.deepEqual({ ...parseAssistantTopicTitles('{invalid') }, {});
    assert.equal(getAssistantTopicTitle(topic, legacy, {}, 'My topic  '), 'My topic');
});

test('assistant accepts JSON and plain-text file sources with exact content', () => {
    assert.equal(isAssistantTextFile('session.JSON', ''), true);
    assert.equal(isAssistantTextFile('notes.txt', 'application/octet-stream'), true);
    assert.equal(isAssistantTextFile('dump.yaml', ''), true);
    assert.equal(isAssistantTextFile('shot.png', 'image/png'), false);
    const wrapped = wrapAssistantFileText('demo.json', '{"scene":"中文"}');
    assert.match(wrapped, /demo.json/);
    assert.match(wrapped, /\{"scene":"中文"\}/u);
    assert.throws(() => wrapAssistantFileText('big.json', 'a'.repeat(65_001)), /65,000/);
});

test('JSON download validates complete raw object and fenced array', () => {
    assert.deepEqual(
        extractAssistantJsonExport('{"你好":true}', '測試'),
        { json: '{"你好":true}\n', suggestedName: '測試.json' },
    );
    const fenced = '以下是成品：\n' + '\x60\x60\x60json\n[{"id":1}]\n\x60\x60\x60\n';
    assert.equal(JSON.parse(extractAssistantJsonExport(fenced)?.json || 'null')[0].id, 1);
    assert.equal(extractAssistantJsonExport('\x60\x60\x60json\n{"incomplete"\n\x60\x60\x60'), null);
    assert.equal(extractAssistantJsonExport('普通文字'), null);
    assert.equal(extractAssistantJsonExport('{"bad":1} trailing prose'), null);
});

test('integration: Venice thread routing and assistant file context do not touch character generation', () => {
    const app = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const settings = readFileSync(new URL('../appSettings.ts', import.meta.url), 'utf8');
    assert.match(app, /currentPersonaKey = assistantConversation \? VENICE_ASSISTANT_PERSONA_KEY : key/);
    assert.match(app, /getAssistantTopicEntries\(\)/);
    assert.match(app, /assistantFileContext: assistantMode \? attachmentBundle\.assistantFileContext/);
    assert.match(app, /onTextDelta: assistantMode \? text => showAssistantStreamPreview/);
    assert.match(app, /extractAssistantJsonExport\(text, topicLabel\)/);
    assert.match(settings, /veniceAssistantTopicsV1/);
});
