import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGroupSystemPrompt,
    parseGroupGeneration,
} from '../groupChat.js';
import { ChatRoom, RoomMember } from '../roomManager.js';

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
        prompt: `${name} has a distinct voice and identity.`,
        greeting: `${name} greeting`,
        avatarPrompt: '',
        avatarUrl: null,
    },
});

const createRoom = (): ChatRoom => ({
    id: 'room-test',
    type: 'group',
    title: 'Test room',
    description: 'Test group',
    leadMemberId: 'iu',
    members: [member('iu', 'IU'), member('jennie', 'Jennie'), member('irene', 'Irene')],
    scene: {
        id: 'scene-1',
        location: 'living room',
        realityLayer: 'physical',
        presentMemberIds: ['iu', 'jennie'],
        summary: 'IU and Jennie are talking with the user.',
        unresolved: [],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

test('group prompt keeps immutable member and presence ledgers', () => {
    const prompt = buildGroupSystemPrompt(createRoom());
    assert.match(prompt, /MEMBER ID: iu/);
    assert.match(prompt, /MEMBER ID: irene/);
    assert.match(prompt, /Presence now: ABSENT/);
    assert.match(prompt, /never one of the listed characters/i);
});

test('group parser preserves separate speakers and scene state', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [
            { type: 'narration', speaker_id: null, text: 'Morning light reaches the sofa.' },
            { type: 'dialogue', speaker_id: 'iu', text: 'I heard you.' },
            { type: 'dialogue', speaker_id: 'jennie', text: 'Me too.' },
        ],
        scene: {
            location: 'living room',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie'],
            summary: 'Both members answered the newest turn.',
            unresolved: [],
        },
        npc_candidate: {
            name: 'New friend',
            gender: 'female',
            description: 'A newly introduced recurring friend.',
            public_figure_query: null,
        },
    }), createRoom());

    assert.deepEqual(parsed.segments.map(segment => segment.speakerId).filter(Boolean), ['iu', 'jennie']);
    assert.equal(parsed.scene.presentMemberIds.join(','), 'iu,jennie');
    assert.equal(parsed.npcCandidate?.gender, 'female');
});

test('group parser rejects dialogue spoken only by an absent member', () => {
    assert.throws(() => parseGroupGeneration(JSON.stringify({
        segments: [{ type: 'dialogue', speaker_id: 'irene', text: 'I should not know this.' }],
        scene: {
            location: 'living room',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie'],
            summary: 'Invalid turn.',
            unresolved: [],
        },
        npc_candidate: null,
    }), createRoom()), /valid member dialogue/i);
});
