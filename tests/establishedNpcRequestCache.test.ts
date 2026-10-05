import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

const sliceBetween = (startMarker: string, endMarker: string) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
};

test('beginChatRequest caches established NPC names once for wardrobe and generation', () => {
    const beginSource = sliceBetween('const beginChatRequest = (', 'const isActiveChatRequest =');
    assert.match(beginSource, /const establishedNpcNames = currentRoom[\s\S]*collectEstablishedNpcNames\(history, persona\.name\)/);
    assert.match(beginSource, /\.\.\.establishedNpcNames/);
    assert.match(beginSource, /mode,[\s\S]*establishedNpcNames,[\s\S]*wardrobeState/);
});

test('single generation reuses the request cache while strict review keeps an independent rescan', () => {
    const generationSource = sliceBetween('const runConversationGeneration = async', 'const runRoomConversationGeneration = async');
    const reviewSource = sliceBetween('const strictReviewSingleReply = async', 'const strictReviewGroupReply = async');

    assert.match(generationSource, /mergeEstablishedNpcNamesForTurn\(\s*request\.establishedNpcNames,/);
    assert.doesNotMatch(generationSource, /collectEstablishedNpcNames\(/);
    assert.match(reviewSource, /collectEstablishedNpcNames\(\s*history,/);
});
