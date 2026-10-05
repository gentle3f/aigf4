import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

const sliceBetween = (startMarker: string, endMarker: string) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0, `missing start marker: ${startMarker}`);
    assert.ok(end > start, `missing end marker: ${endMarker}`);
    return source.slice(start, end);
};

test('chat performance starts only after basic send validation, not in dispatch', () => {
    const sendSource = sliceBetween('const sendMessage = async', 'const dispatchSendMessage');
    const dispatchSource = sliceBetween('const dispatchSendMessage', 'let albumUi:');

    const startIndex = sendSource.indexOf('startChatPerformanceTurn();');
    assert.ok(startIndex > sendSource.indexOf("const assistantMode = isAssistantPersonaKey(currentPersonaKey);"));
    assert.ok(startIndex > sendSource.indexOf("if (!typedMessage && pendingChatAttachments.length === 0) return;"));
    assert.doesNotMatch(dispatchSource, /startChatPerformanceTurn\(\)/);
});

test('all visible sendMessage early terminals after timing starts explicitly close timing', () => {
    const sendSource = sliceBetween('const sendMessage = async', 'const dispatchSendMessage');

    assert.match(sendSource, /completeChatPerformanceTurn\('send:god-mode-enter-visible'\)/);
    assert.match(sendSource, /completeChatPerformanceTurn\('send:god-mode-exit-visible'\)/);
    assert.match(sendSource, /cancelChatPerformanceTurn\('send:rejected'\)/);
    assert.match(sendSource, /cancelChatPerformanceTurn\('send:attachment-error'\)/);
    assert.match(sendSource, /completeChatPerformanceTurn\('send:god-mode-inspect-visible'\)/);
    assert.match(sendSource, /completeChatPerformanceTurn\('send:memory-proposal-visible'\)[^]*schedulePersonaListRefreshAfterPaint\(\)/u);
    assert.match(sendSource, /completeChatPerformanceTurn\('send:photo-intent-visible'\)[^]*schedulePersonaListRefreshAfterPaint\(\)/u);
    assert.match(sendSource, /completeChatPerformanceTurn\('send:npc-proposal-visible'\)[^]*schedulePersonaListRefreshAfterPaint\(\)/u);

    const afterStart = sendSource.slice(sendSource.indexOf('startChatPerformanceTurn();'));
    const unclosedReturns = afterStart
        .split('\n')
        .map((line, index, lines) => ({ line, index, lines }))
        .filter(({ line }) => /\breturn;/.test(line))
        .filter(({ index, lines }) => {
            const nearby = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
            return !/completeChatPerformanceTurn|cancelChatPerformanceTurn|await getGodModeResponse/.test(nearby);
        });
    assert.deepEqual(unclosedReturns.map(({ line }) => line.trim()), []);
});

test('request cancellation closes the current performance turn', () => {
    const cancelSource = sliceBetween('const cancelActiveChatRequest = () =>', 'const isAbortError =');
    assert.match(cancelSource, /request\.controller\.abort\(\)/);
    assert.match(cancelSource, /cancelChatPerformanceTurn\('send:cancelled'\)/);
});

test('normal and God Mode response terminals complete or cancel performance timing', () => {
    const godSource = sliceBetween('const getGodModeResponse = async', 'const prepareCharacterAvatarReference');
    assert.match(godSource, /completeChatPerformanceTurn\('response:god-mode-visible'\)/);
    assert.match(godSource, /cancelChatPerformanceTurn\('send:aborted'\)/);
    assert.match(godSource, /cancelChatPerformanceTurn\('send:auth-error'\)/);
    assert.match(godSource, /cancelChatPerformanceTurn\('send:error'\)/);

    const responseSource = sliceBetween('const getResponse = async', 'let autoMemoryModuleLoad');
    assert.match(responseSource, /completeChatPerformanceTurn\('response:final-visible'\)/);
    assert.match(responseSource, /cancelChatPerformanceTurn\('send:aborted'\)/);
    assert.match(responseSource, /cancelChatPerformanceTurn\('send:auth-error'\)/);
    assert.match(responseSource, /cancelChatPerformanceTurn\('send:error'\)/);
});

test('photo proposal response closes timing and records the visible persist/render path', () => {
    const responseSource = sliceBetween('const getResponse = async', 'let autoMemoryModuleLoad');

    const photoStart = responseSource.indexOf("if (request.mode === 'photo'");
    const photoEnd = responseSource.indexOf("const generated = request.mode === 'assistant'", photoStart);
    assert.ok(photoStart >= 0 && photoEnd > photoStart);
    const photoSource = responseSource.slice(photoStart, photoEnd);

    assert.match(photoSource, /markChatPerformance\('response:final-persist'/);
    assert.match(photoSource, /markChatPerformance\('response:final-render'/);
    assert.match(photoSource, /completeChatPerformanceTurn\('response:photo-proposal-visible'\)/);
    assert.match(photoSource, /schedulePersonaListRefreshAfterPaint\(\)/);
});
