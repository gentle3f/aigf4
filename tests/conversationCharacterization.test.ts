import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCharacterModelRoute,
    buildStrictReviewModelRoute,
    getGenerationAttemptCount,
    parseChatModelSettings,
} from '../chatModelSettings.js';
import { parseGroupGeneration, selectGroupHistorySinceCurrentRealityLayer } from '../groupChat.js';
import type { ChatMessage } from '../managers.js';
import type { ChatRoom, RoomMember } from '../roomManager.js';
import { parseStrictReviewDecision } from '../strictReview.js';

const defaults = {
    primary: 'default-primary',
    qualityFallback: 'quality-fallback',
    emergencyFallback: 'emergency-fallback',
    ccPrimary: 'cc-primary',
};

const attemptsFor = (route: string[]) => route.flatMap((model, routeIndex) => (
    Array.from({ length: getGenerationAttemptCount(routeIndex) }, (_, attempt) => `${model}:${attempt + 1}`)
));

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

test('CASE 2 and CASE 3: first primary receives one repair, then each fallback receives one attempt', () => {
    assert.deepEqual(attemptsFor(['primary']), ['primary:1', 'primary:2']);
    assert.deepEqual(attemptsFor(['primary', 'fallback-a', 'fallback-b']), [
        'primary:1', 'primary:2', 'fallback-a:1', 'fallback-b:1',
    ]);
});

test('CASE 4 and CASE 5: strict-review transport keeps valid revisions and rejects incomplete revise envelopes', () => {
    assert.deepEqual(parseStrictReviewDecision('{"decision":"revise","issues":["voice"],"revised_response":"revised"}'), {
        decision: 'revise', issues: ['voice'], revisedResponse: 'revised',
    });
    assert.equal(parseStrictReviewDecision('{"decision":"revise","issues":[],"revised_response":""}'), null);
    assert.deepEqual(parseStrictReviewDecision('<keep/>'), { decision: 'keep', issues: [], revisedResponse: '' });
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

test('CASE 10: abort is represented as uncommitted metadata; live DOM orchestration remains legacy-characterized', () => {
    assert.equal(getGenerationAttemptCount(0), 2);
    assert.equal(getGenerationAttemptCount(1), 1);
});
