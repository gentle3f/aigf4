import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runSingleTurnAdapter } from '../engine/singleTurnAdapter.js';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

test('CASE A: returns the generated candidate when legacy review keeps it', async () => {
    const candidate = { text: 'candidate' };
    const result = await runSingleTurnAdapter({
        generateCandidate: async () => candidate,
        reviewCandidate: async value => value,
    });
    assert.equal(result, candidate);
});

test('CASE B: returns the legacy strict-review revision', async () => {
    const result = await runSingleTurnAdapter({
        generateCandidate: async () => 'candidate',
        reviewCandidate: async () => 'revision',
    });
    assert.equal(result, 'revision');
});

test('CASE C: generation errors propagate and skip review', async () => {
    const error = new Error('generation failed');
    let reviewed = false;
    await assert.rejects(
        runSingleTurnAdapter({
            generateCandidate: async () => { throw error; },
            reviewCandidate: async candidate => { reviewed = true; return candidate; },
        }),
        received => received === error,
    );
    assert.equal(reviewed, false);
});

test('CASE D: generation aborts propagate and skip review', async () => {
    const error = abortError();
    let reviewed = false;
    await assert.rejects(
        runSingleTurnAdapter({
            generateCandidate: async () => { throw error; },
            reviewCandidate: async candidate => { reviewed = true; return candidate; },
        }),
        received => received === error,
    );
    assert.equal(reviewed, false);
});

test('CASE E: review errors propagate unchanged', async () => {
    const error = new Error('review failed');
    await assert.rejects(
        runSingleTurnAdapter({
            generateCandidate: async () => 'candidate',
            reviewCandidate: async () => { throw error; },
        }),
        received => received === error,
    );
});

test('CASE F: review aborts propagate unchanged', async () => {
    const error = abortError();
    await assert.rejects(
        runSingleTurnAdapter({
            generateCandidate: async () => 'candidate',
            reviewCandidate: async () => { throw error; },
        }),
        received => received === error,
    );
});

test('CASE G: calls generation then review exactly once', async () => {
    const calls: string[] = [];
    await runSingleTurnAdapter({
        generateCandidate: async () => { calls.push('generate'); return 'candidate'; },
        reviewCandidate: async candidate => { calls.push(`review:${candidate}`); return candidate; },
    });
    assert.deepEqual(calls, ['generate', 'review:candidate']);
});

test('CASE H: the adapter is a pure dependency seam with no persistence capability', async () => {
    assert.deepEqual(Object.keys(await import('../engine/singleTurnAdapter.js')).sort(), [
        'runSingleTurnAdapter',
    ]);
});

test('Cc single chat passes the optional trace to generation while the group branch remains direct', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    assert.match(source, /const trace = createGenerationTrace\(String\(request\.id\), 'single', request\.conversationKey\);\s*return runSingleTurnAdapter\(createTracedSingleTurnDependencies\(trace, \{\s*generateCandidate: \(\) => runConversationGeneration\(request, latestUserMessage, models, false, trace\),\s*reviewCandidate: candidate => strictReviewSingleReply\(request, latestUserMessage, candidate\),\s*\}, \{\s*isAbortError,\s*\}\)\);/s);
    assert.match(source, /if \(request\.room\) \{\s*const candidate = await runRoomConversationGeneration\(request, latestUserMessage, models\);\s*return strictReviewGroupReply\(request, latestUserMessage, candidate\);\s*\}/s);
    const characterGeneration = source.slice(source.indexOf('const runCharacterChatGeneration'));
    const groupBranch = characterGeneration.slice(
        characterGeneration.indexOf('if (request.room) {'),
        characterGeneration.indexOf("const trace = createGenerationTrace"),
    );
    assert.doesNotMatch(groupBranch, /GenerationTrace|createTracedSingleTurnDependencies|recordGenerationTrace/);
    const strictReviewBranch = source.slice(source.indexOf('const strictReviewSingleReply'), source.indexOf('const runCharacterChatGeneration'));
    assert.doesNotMatch(strictReviewBranch, /markGenerationAttempt|recordSingleGenerationAttempt/);
});
