import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runGroupTurnAdapter } from '../engine/groupTurnAdapter.js';
import type { GroupGenerationResult } from '../groupChat.js';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

const candidate: GroupGenerationResult = {
    text: 'candidate',
    segments: [],
    scene: {
        id: 'proposed-scene',
        location: 'test location',
        realityLayer: 'physical',
        presentMemberIds: ['member-a'],
        summary: 'proposed state remains uncommitted',
        unresolved: [],
        startedAt: 1,
    },
};

test('group adapter calls generation and review once with the exact candidate', async () => {
    let generated = 0;
    let reviewed = 0;
    let received: GroupGenerationResult | undefined;
    const result = await runGroupTurnAdapter({
        generateCandidate: async () => { generated += 1; return candidate; },
        reviewCandidate: async value => {
            reviewed += 1;
            received = value;
            return value;
        },
    });

    assert.equal(generated, 1);
    assert.equal(reviewed, 1);
    assert.equal(received, candidate);
    assert.equal(result, candidate);
    assert.equal(result.scene, candidate.scene);
});

test('group adapter propagates the same generation error and skips review', async () => {
    const error = new Error('generation failed');
    let reviewed = false;
    await assert.rejects(
        runGroupTurnAdapter({
            generateCandidate: async () => { throw error; },
            reviewCandidate: async value => { reviewed = true; return value; },
        }),
        received => received === error,
    );
    assert.equal(reviewed, false);
});

test('group adapter propagates the same review error', async () => {
    const error = new Error('review failed');
    let generated = 0;
    await assert.rejects(
        runGroupTurnAdapter({
            generateCandidate: async () => { generated += 1; return candidate; },
            reviewCandidate: async () => { throw error; },
        }),
        received => received === error,
    );
    assert.equal(generated, 1);
});

test('group adapter propagates the same abort object without transformation', async () => {
    const error = abortError();
    await assert.rejects(
        runGroupTurnAdapter({
            generateCandidate: async () => candidate,
            reviewCandidate: async () => { throw error; },
        }),
        received => received === error,
    );
});

test('group adapter does not expose persistence or state-commit capabilities', async () => {
    assert.deepEqual(Object.keys(await import('../engine/groupTurnAdapter.js')).sort(), [
        'runGroupTurnAdapter',
    ]);
});

test('group wiring uses the broad trace adapter seam and leaves downstream scene commit in getResponse', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const characterGeneration = source.slice(source.indexOf('const runCharacterChatGeneration'));
    const groupBranchStart = characterGeneration.indexOf('if (request.room) {');
    const groupBranch = characterGeneration.slice(
        groupBranchStart,
        characterGeneration.indexOf("const trace = createGenerationTrace(String(request.id), 'single'", groupBranchStart),
    );

    assert.match(groupBranch, /const trace = createGenerationTrace\(String\(request\.id\), 'group', request\.conversationKey\);\s*return runGroupTurnAdapter\(createTracedGroupTurnDependencies\(trace, \{\s*generateCandidate: \(\) => runRoomConversationGeneration\(request, latestUserMessage, models\),\s*reviewCandidate: candidate => strictReviewGroupReply\(request, latestUserMessage, candidate\),\s*\}, \{\s*isAbortError,\s*\}\)\);/s);
    assert.doesNotMatch(groupBranch, /markGenerationAttempt|markStrictReviewAttempt|recordGenerationTrace/);
    assert.match(characterGeneration, /return runSingleTurnAdapter\(createTracedSingleTurnDependencies\(trace,/);

    const getResponse = source.slice(source.indexOf('const getResponse'));
    assert.match(getResponse, /if \(typeof generated !== 'string' && request\.room\) \{[\s\S]*roomManager\.updateRoom\(request\.room\.id, room => \{\s*room\.scene = generated\.scene;/);
});
