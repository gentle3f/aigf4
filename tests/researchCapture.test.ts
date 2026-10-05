import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReviewState } from '../engine/contracts.js';
import type { GroupGenerationResult } from '../groupChat.js';
import {
    buildResearchCloudProjection,
    buildResearchGroupTurnRecord,
    getResearchCloudSampleReasons,
    listPendingResearchTurnRecords,
    markResearchTurnsSynced,
    measureGroupInteraction,
    patchResearchTurnRecord,
    RESEARCH_CAPTURE_DB_NAME,
    saveResearchTurnRecord,
} from '../researchCapture.js';

test('measureGroupInteraction detects rigid narration-separated round robin', () => {
    const segments = [
        { type: 'narration' as const, text: 'room settles' },
        { type: 'dialogue' as const, speakerId: 'a', speakerName: 'A', text: 'one' },
        { type: 'narration' as const, text: 'B looks over' },
        { type: 'dialogue' as const, speakerId: 'b', speakerName: 'B', text: 'two' },
        { type: 'narration' as const, text: 'the moment closes' },
    ];
    const metrics = measureGroupInteraction(segments, ['a', 'b']);
    assert.equal(metrics.segmentCount, 5);
    assert.equal(metrics.narrationCount, 3);
    assert.equal(metrics.dialogueCount, 2);
    assert.equal(metrics.uniqueSpeakerCount, 2);
    assert.equal(metrics.narratorFirst, true);
    assert.equal(metrics.narratorLast, true);
    assert.equal(metrics.everyonePresentSpeaks, true);
    assert.equal(metrics.directCharacterToCharacterTransitions, 0);
    assert.equal(metrics.speakerReentryCount, 0);
    assert.equal(metrics.narrationBetweenEverySpeakerChange, true);
});

test('measureGroupInteraction detects direct character interaction and speaker re-entry', () => {
    const segments = [
        { type: 'dialogue' as const, speakerId: 'a', speakerName: 'A', text: 'first' },
        { type: 'dialogue' as const, speakerId: 'b', speakerName: 'B', text: 'reply to A' },
        { type: 'dialogue' as const, speakerId: 'a', speakerName: 'A', text: 'answers B' },
    ];
    const metrics = measureGroupInteraction(segments, ['a', 'b', 'c']);
    assert.equal(metrics.narratorFirst, false);
    assert.equal(metrics.narratorLast, false);
    assert.equal(metrics.everyonePresentSpeaks, false);
    assert.equal(metrics.directCharacterToCharacterTransitions, 2);
    assert.equal(metrics.speakerReentryCount, 1);
    assert.equal(metrics.narrationBetweenEverySpeakerChange, false);
    assert.deepEqual(metrics.dialogueSpeakerIds, ['a', 'b', 'a']);
});

test('buildResearchGroupTurnRecord keeps review context and starts pending', () => {
    const scene = {
        location: 'living room',
        realityLayer: 'physical' as const,
        presentMemberIds: ['a', 'b'],
        summary: 'A and B are talking.',
        unresolved: [],
        wardrobe: {
            user: 'KEEP',
            members: [
                { memberId: 'a', outfit: 'KEEP' },
                { memberId: 'b', outfit: 'KEEP' },
            ],
        },
    };
    const candidate: GroupGenerationResult = {
        text: 'A：「Hi」\nB：「Hey」',
        segments: [
            { type: 'dialogue', speakerId: 'a', speakerName: 'A', text: 'Hi' },
            { type: 'dialogue', speakerId: 'b', speakerName: 'B', text: 'Hey' },
        ],
        scene,
    };
    const reviewState: ReviewState = {
        mode: 'group',
        ccMode: false,
        latestUserText: 'hello both',
        realityLayer: 'physical',
        sceneSummary: 'A and B are talking.',
        participants: [
            { id: 'a', name: 'A', present: true },
            { id: 'b', name: 'B', present: true },
        ],
        relevantMemories: [{ id: 'm1', summary: 'prior context' }],
        candidateText: candidate.text,
        proposedScene: scene,
        personaEvidence: 'A is direct. B is playful.',
        recentHistoryText: 'User: earlier message',
    };
    const record = buildResearchGroupTurnRecord({
        recordId: 'research-test-1',
        requestId: '42',
        conversationKey: 'room:test',
        userMessage: 'hello both',
        reviewState,
        candidate,
        createdAtMs: 123456,
    });
    assert.equal(record.recordId, 'research-test-1');
    assert.equal(record.createdAtMs, 123456);
    assert.equal(record.syncState, 'pending');
    assert.equal(record.lifecycle, 'captured');
    assert.equal(record.reviewState.latestUserText, 'hello both');
    assert.equal(record.reviewState.personaEvidence, 'A is direct. B is playful.');
    assert.equal(record.candidate.interaction.directCharacterToCharacterTransitions, 1);
    assert.equal(record.candidate.interaction.everyonePresentSpeaks, true);
});


const resetResearchDb = () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(RESEARCH_CAPTURE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('failed to reset research db'));
    request.onblocked = () => reject(new Error('research db reset blocked'));
});

test('research queue keeps an updated turn pending when an older upload finishes late', async () => {
    await resetResearchDb();
    const scene = {
        location: 'cafe',
        realityLayer: 'physical' as const,
        presentMemberIds: ['a', 'b'],
        summary: 'A and B are at the cafe.',
        unresolved: [],
        wardrobe: {
            user: 'KEEP',
            members: [
                { memberId: 'a', outfit: 'KEEP' },
                { memberId: 'b', outfit: 'KEEP' },
            ],
        },
    };
    const candidate: GroupGenerationResult = {
        text: 'A：「Hi」\nB：「Hey」',
        segments: [
            { type: 'dialogue', speakerId: 'a', speakerName: 'A', text: 'Hi' },
            { type: 'dialogue', speakerId: 'b', speakerName: 'B', text: 'Hey' },
        ],
        scene,
    };
    const reviewState: ReviewState = {
        mode: 'group',
        ccMode: false,
        latestUserText: 'hello',
        participants: [
            { id: 'a', name: 'A', present: true },
            { id: 'b', name: 'B', present: true },
        ],
        relevantMemories: [],
        candidateText: candidate.text,
        proposedScene: scene,
        recentHistoryText: '',
    };
    const record = buildResearchGroupTurnRecord({
        recordId: 'race-test',
        requestId: '9',
        conversationKey: 'room:race',
        userMessage: 'hello',
        reviewState,
        candidate,
        createdAtMs: Date.now(),
    });
    record.lifecycle = 'completed';
    assert.equal(await saveResearchTurnRecord(record), true);
    const beforePatch = await listPendingResearchTurnRecords();
    assert.equal(beforePatch.length, 1);
    const staleVersion = beforePatch[0].updatedAtMs;

    assert.equal(await patchResearchTurnRecord('race-test', {
        gemma: {
            decision: 'keep',
            issueCodes: [],
        },
    }), true);

    const afterPatch = await listPendingResearchTurnRecords();
    assert.equal(afterPatch.length, 1);
    assert.ok(afterPatch[0].updatedAtMs > staleVersion);

    const staleMarked = await markResearchTurnsSynced([
        { recordId: 'race-test', updatedAtMs: staleVersion },
    ], 2000);
    assert.equal(staleMarked, 0);
    assert.equal((await listPendingResearchTurnRecords()).length, 1);

    const currentVersion = (await listPendingResearchTurnRecords())[0].updatedAtMs;
    const freshMarked = await markResearchTurnsSynced([
        { recordId: 'race-test', updatedAtMs: currentVersion },
    ], 3000);
    assert.equal(freshMarked, 1);
    assert.equal((await listPendingResearchTurnRecords()).length, 0);
    await resetResearchDb();
});


const makeCloudPolicyRecord = (
    recordId: string,
    options: { decision?: 'keep' | 'revise'; rigid?: boolean } = {},
) => {
    const scene = {
        location: 'studio',
        realityLayer: 'physical' as const,
        presentMemberIds: ['a', 'b'],
        summary: 'A and B are together.',
        unresolved: [],
        wardrobe: {
            user: 'KEEP',
            members: [
                { memberId: 'a', outfit: 'KEEP' },
                { memberId: 'b', outfit: 'KEEP' },
            ],
        },
    };
    const segments = options.rigid ? [
        { type: 'narration' as const, text: 'The room settles.' },
        { type: 'dialogue' as const, speakerId: 'a', speakerName: 'A', text: 'First.' },
        { type: 'narration' as const, text: 'B looks across.' },
        { type: 'dialogue' as const, speakerId: 'b', speakerName: 'B', text: 'Second.' },
        { type: 'narration' as const, text: 'The moment closes.' },
    ] : [
        { type: 'dialogue' as const, speakerId: 'a', speakerName: 'A', text: 'First.' },
        { type: 'dialogue' as const, speakerId: 'b', speakerName: 'B', text: 'Replies.' },
    ];
    const candidate: GroupGenerationResult = {
        text: segments.map(segment => segment.text).join('\n'),
        segments,
        scene,
    };
    const reviewState: ReviewState = {
        mode: 'group',
        ccMode: false,
        latestUserText: 'private user message',
        participants: [
            { id: 'a', name: 'A', present: true },
            { id: 'b', name: 'B', present: true },
        ],
        relevantMemories: [{ id: 'm1', summary: 'private memory context' }],
        candidateText: candidate.text,
        proposedScene: scene,
        recentHistoryText: 'private recent history',
    };
    const record = buildResearchGroupTurnRecord({
        recordId,
        requestId: 'cloud-policy',
        conversationKey: 'room:cloud-policy',
        userMessage: 'private user message',
        reviewState,
        candidate,
        createdAtMs: 1000,
    });
    record.lifecycle = 'completed';
    record.gemma = {
        decision: options.decision || 'keep',
        issueCodes: options.decision === 'revise' ? ['continuity'] : [],
    };
    record.final = {
        text: candidate.text,
        segments: candidate.segments,
        scene,
        interaction: measureGroupInteraction(candidate.segments, scene.presentMemberIds),
    };
    return record;
};

test('cloud projection keeps ordinary full chat content local', () => {
    let record = makeCloudPolicyRecord('ordinary-0');
    for (let index = 0; index < 200; index += 1) {
        const candidate = makeCloudPolicyRecord(`ordinary-${index}`);
        if (getResearchCloudSampleReasons(candidate).length === 0) {
            record = candidate;
            break;
        }
    }
    assert.deepEqual(getResearchCloudSampleReasons(record), []);
    const projection = buildResearchCloudProjection(record);
    assert.equal(projection.samplePayload, undefined);
    assert.equal((projection.metadata as unknown as Record<string, unknown>).userMessage, undefined);
    assert.equal((projection.metadata as unknown as Record<string, unknown>).reviewState, undefined);
    assert.equal((projection.metadata as unknown as Record<string, unknown>).candidate, undefined);
    assert.deepEqual(projection.metadata.gemma?.issueCodes, []);
});

test('Gemma revise remains visible in metadata while only about half carry full content', () => {
    let selected = 0;
    let sampledRecord = makeCloudPolicyRecord('gemma-revise-0', { decision: 'revise' });
    for (let index = 0; index < 1000; index += 1) {
        const record = makeCloudPolicyRecord(`gemma-revise-${index}`, { decision: 'revise' });
        const reasons = getResearchCloudSampleReasons(record);
        assert.ok(reasons.includes('gemma-revise'));
        const projection = buildResearchCloudProjection(record);
        assert.equal(projection.metadata.gemma?.decision, 'revise');
        if (projection.samplePayload) {
            selected += 1;
            sampledRecord = record;
        }
    }
    assert.ok(selected >= 450 && selected <= 550, `expected ~50% Gemma-revise full sampling, got ${selected}/1000`);
    const sampledProjection = buildResearchCloudProjection(sampledRecord);
    assert.equal(sampledProjection.samplePayload?.userMessage, 'private user message');
    assert.equal(sampledProjection.samplePayload?.reviewState.recentHistoryText, 'private recent history');
    assert.equal(sampledProjection.samplePayload?.candidate.text, sampledRecord.candidate.text);
});

test('rigid structure is sampled instead of uploading every rigid turn', () => {
    let selected = 0;
    for (let index = 0; index < 1000; index += 1) {
        const reasons = getResearchCloudSampleReasons(
            makeCloudPolicyRecord(`rigid-${index}`, { rigid: true }),
        );
        if (reasons.includes('rigid-structure')) selected += 1;
    }
    assert.ok(selected >= 70 && selected <= 130, `expected ~10% rigid sampling, got ${selected}/1000`);
});

test('captured turns stay local until review completes or fails', async () => {
    await resetResearchDb();
    const record = makeCloudPolicyRecord('lifecycle-local-only');
    record.createdAtMs = Date.now();
    record.updatedAtMs = record.createdAtMs;
    record.lifecycle = 'captured';
    assert.equal(await saveResearchTurnRecord(record), true);
    assert.equal((await listPendingResearchTurnRecords()).length, 0);
    assert.equal(await patchResearchTurnRecord(record.recordId, { lifecycle: 'completed' }), true);
    assert.equal((await listPendingResearchTurnRecords()).length, 1);
    await resetResearchDb();
});
