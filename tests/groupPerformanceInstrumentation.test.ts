import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

test('Group generation measures prompt preparation and parser work without changing request order', () => {
    const start = source.indexOf('const runRoomConversationGeneration = async');
    const end = source.indexOf('const getStrictReviewHistory =', start);
    assert.ok(start >= 0 && end > start);
    const groupSource = source.slice(start, end);

    const promptMark = groupSource.indexOf("markChatPerformance('generation:prompt-build'");
    const requestStart = groupSource.indexOf("generation:primary-request-start");
    const parseCall = groupSource.indexOf('parseGroupGeneration(result.text');
    const parseMark = groupSource.indexOf("markChatPerformance('generation:group-parse'");

    assert.ok(promptMark >= 0 && promptMark < requestStart);
    assert.ok(parseCall >= 0 && parseMark > parseCall);
});

test('Group scene persistence is measured before the final response persist/render path', () => {
    const start = source.indexOf("if (typeof generated !== 'string' && request.room)");
    const end = source.indexOf("completeChatPerformanceTurn('response:final-visible')", start);
    assert.ok(start >= 0 && end > start);
    const responseSource = source.slice(start, end);

    const sceneMark = responseSource.indexOf("markChatPerformance('response:group-scene-persist'");
    const finalPersist = responseSource.indexOf("markChatPerformance('response:final-persist'");
    const finalRender = responseSource.indexOf("markChatPerformance('response:final-render'");

    assert.ok(sceneMark >= 0);
    assert.ok(finalPersist > sceneMark);
    assert.ok(finalRender > finalPersist);
});
