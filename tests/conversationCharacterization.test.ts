import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCharacterModelRoute,
    buildGenerationPlan,
    buildStrictReviewModelRoute,
    parseChatModelSettings,
} from '../chatModelSettings.js';
import { applyGroupStrictReview, applySingleStrictReview } from '../engine/reviewApplication.js';
import { parseGroupGeneration, selectGroupHistorySinceCurrentRealityLayer } from '../groupChat.js';
import type { ChatMessage } from '../managers.js';
import type { ChatRoom, RoomMember } from '../roomManager.js';
import { parseStrictReviewDecision } from '../engine/review/reviewResultParser.js';

const defaults = {
    primary: 'default-primary',
    qualityFallback: 'quality-fallback',
    emergencyFallback: 'emergency-fallback',
    ccPrimary: 'cc-primary',
};

const member = (id: string, name: string): RoomMember => ({
    id,
    joinedAt: 1,
    soul: [],
    memories: [],
    persona: {
        name,
        emoji: '*',
        gender: 'female',
        description: `${name} description`,
        prompt: `${name} prompt`,
        greeting: '',
        avatarPrompt: '',
        avatarUrl: null,
    },
});

const room = (): ChatRoom => ({
    id: 'room-1',
    type: 'group',
    title: 'Room',
    description: '',
    leadMemberId: 'a',
    members: [member('a', 'A'), member('b', 'B')],
    scene: {
        id: 'scene-1',
        location: 'remote chat',
        realityLayer: 'texting',
        realityEpochId: 'epoch-current',
        presentMemberIds: ['a', 'b'],
        summary: 'Both members are texting.',
        unresolved: [],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

test('CASE 1 and CASE 9: saved primary wins over the env/default route and preserves strict review order', () => {
    const saved = parseChatModelSettings(JSON.stringify({ primary: 'saved-primary' }), defaults);
    assert.equal(saved.primary, 'saved-primary');
    assert.deepEqual(buildCharacterModelRoute(saved, false), ['saved-primary', 'quality-fallback', 'emergency-fallback']);
    assert.deepEqual(buildCharacterModelRoute(saved, true), ['cc-primary', 'quality-fallback', 'saved-primary', 'emergency-fallback']);
    assert.deepEqual(buildStrictReviewModelRoute(saved, false), ['quality-fallback', 'saved-primary', 'emergency-fallback']);
});

test('CASE 2 and CASE 3: Phase 2 generation plans are derived from the existing normal and Cc routes', () => {
    const normal = buildGenerationPlan(defaults, false);
    assert.deepEqual(normal.models, ['default-primary', 'quality-fallback', 'emergency-fallback']);
    assert.deepEqual(normal.attempts.map(attempt => `${attempt.phase}:${attempt.model}:${attempt.attemptIndex}`), [
        'primary:default-primary:1',
        'repair:default-primary:2',
        'fallback:quality-fallback:1',
        'fallback:emergency-fallback:1',
    ]);

    const cc = buildGenerationPlan(defaults, true);
    assert.deepEqual(cc.models, ['cc-primary', 'quality-fallback', 'default-primary', 'emergency-fallback']);
    assert.deepEqual(cc.attempts.slice(0, 2).map(attempt => `${attempt.phase}:${attempt.model}:${attempt.attemptIndex}`), [
        'primary:cc-primary:1',
        'repair:cc-primary:2',
    ]);
    assert.equal(cc.attempts.filter(attempt => attempt.phase === 'fallback').length, 3);
});

test('CASE 4 and CASE 5: strict-review transport parses keep and revise decisions', () => {
    assert.deepEqual(parseStrictReviewDecision('{"decision":"revise","issues":["persona_voice"],"revised_response":"revised"}'), {
        decision: 'revise', issues: ['persona_voice'], revisedResponse: 'revised',
    });
    assert.equal(parseStrictReviewDecision('{"decision":"revise","issues":[],"revised_response":""}'), null);
    assert.deepEqual(parseStrictReviewDecision('<keep/>'), { decision: 'keep', issues: [], revisedResponse: '' });
});

test('CASE 4 and CASE 5: single strict review only replaces a candidate with a valid revision', () => {
    const candidate = { text: 'candidate', wardrobe: 'original' };
    const revise = { decision: 'revise' as const, issues: ['persona_voice'], revisedResponse: 'revision' };

    assert.equal(
        applySingleStrictReview(candidate, { decision: 'keep', issues: [], revisedResponse: '' }, () => null),
        candidate,
    );
    assert.deepEqual(
        applySingleStrictReview(candidate, revise, response => (
            response === 'revision' ? { text: response, wardrobe: 'revised' } : null
        )),
        { text: 'revision', wardrobe: 'revised' },
    );
    assert.equal(applySingleStrictReview(candidate, revise, () => null), candidate);
    assert.equal(applySingleStrictReview(candidate, null, () => ({ text: 'unexpected', wardrobe: 'bad' })), candidate);
});

test('CASE 6 and CASE 8: group transport preserves structured dialogue and proposed current scene', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [{ speaker_id: 'a', text: 'A replies.' }, { speaker_id: 'b', text: 'B reacts.' }],
        scene: {
            location: 'remote chat', reality_layer: 'texting', present_member_ids: ['a', 'b'],
            summary: 'The conversation continues.', unresolved: [],
        },
        npc_candidate: null,
    }), room());
    assert.deepEqual(parsed.segments.map(segment => segment.speakerId), ['a', 'b']);
    assert.equal(parsed.scene.realityLayer, 'texting');
    assert.equal(parsed.scene.realityEpochId, 'epoch-current');
});

test('CASE 6 and CASE 8: group strict review retains the candidate for incomplete or rejected revisions', () => {
    const candidate = { id: 'candidate' };
    const revise = {
        decision: 'revise' as const,
        issues: ['voice'],
        revisedResponse: '<chat>{"segments":[]}</chat><scene>{}</scene><npc_candidate>null</npc_candidate>',
    };
    let validationCalls = 0;

    assert.equal(
        applyGroupStrictReview(candidate, { decision: 'keep', issues: [], revisedResponse: '' }, () => {
            validationCalls += 1;
            return null;
        }),
        candidate,
    );
    assert.deepEqual(
        applyGroupStrictReview(candidate, revise, () => ({ id: 'revision' })),
        { id: 'revision' },
    );
    assert.equal(
        applyGroupStrictReview(candidate, {
            ...revise,
            revisedResponse: '<chat>{"segments":[]}</chat><scene>{}</scene>',
        }, () => {
            validationCalls += 1;
            return { id: 'must-not-run' };
        }),
        candidate,
    );
    assert.equal(applyGroupStrictReview(candidate, revise, () => null), candidate);
    assert.equal(validationCalls, 0);
});

test('CASE 7: texting epoch selection excludes legacy raw dialogue before the current epoch', () => {
    const history = [
        { role: 'user', content: { text: 'legacy user', roomSceneBeforeTurn: { realityEpochId: undefined } } },
        { role: 'model', content: { text: 'legacy model' } },
        { role: 'user', content: { text: 'current user', roomSceneBeforeTurn: { realityEpochId: 'epoch-current' } } },
        { role: 'model', content: { text: 'current model' } },
    ] as ChatMessage[];
    assert.deepEqual(
        selectGroupHistorySinceCurrentRealityLayer(history, 'texting', 'epoch-current').map(message => message.content.text),
        ['current user', 'current model'],
    );
});

test('CASE 10 limitation: live DOM abort commit eligibility remains uncharacterized until Phase 2', () => {
    assert.equal(buildGenerationPlan(defaults, false).attempts[0]?.phase, 'primary');
});
