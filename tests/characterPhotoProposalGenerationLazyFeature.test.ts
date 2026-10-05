import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Persona } from '../managers.js';
import {
    buildPhotoContinuityEvidence,
    generateCharacterPhotoProposalDraft,
    parseCharacterPhotoProposalDraft,
} from '../features/characterPhotoProposalGeneration.js';

const persona: Persona = {
    name: 'Aster Vale',
    emoji: 'A',
    gender: 'female',
    description: 'A careful fictional cartographer.',
    prompt: 'Speak in measured formal English.',
    greeting: '',
    avatarPrompt: 'Aster with dark hair and a green coat.',
    avatarUrl: null,
};

test('character photo proposal generation stays behind an explicit lazy boundary', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/characterPhotoProposalGeneration.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/characterPhotoProposalGeneration\.js['"]\)/);
    assert.doesNotMatch(indexSource, /from ["']\.\/features\/characterPhotoProposalGeneration\.js["']/);
    assert.match(featureSource, /CURRENT-MOMENT CONTINUITY LOCK/);
    assert.match(featureSource, /character_photo_proposal/);
    assert.match(featureSource, /SAVED FAVORITE PHOTO INSTRUCTION/);
    assert.doesNotMatch(indexSource, /CURRENT-MOMENT CONTINUITY LOCK/);
    assert.doesNotMatch(indexSource, /character_photo_proposal/);
    assert.doesNotMatch(indexSource, /SAVED FAVORITE PHOTO INSTRUCTION/);

    // Shared prompt composition and card interaction remain synchronous/hot.
    assert.match(indexSource, /const buildCharacterPhotoPrompt =/);
    assert.match(indexSource, /const getPreferredCharacterPhotoModel =/);
});

test('cold character photo feature owns no persistence, send, review, or image execution', () => {
    const source = readFileSync(new URL('../features/characterPhotoProposalGeneration.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /memoryManager|sendMessage|getResponse|startJevShadowEvaluation|runReviewPipeline|requestVeniceImage|localStorage|sessionStorage|indexedDB|Supabase/);
    assert.match(source, /dependencies\.runModel/);
    assert.match(source, /dependencies\.getRecentMessages/);
});

test('photo proposal parser preserves JSON and legacy XML compatibility', () => {
    const clean = (value: string) => value.trim();
    const json = parseCharacterPhotoProposalDraft(JSON.stringify({
        reply: '我諗好點影。',
        prompt: 'Aster Vale standing beside a repaired blue lantern in a quiet workshop, medium shot, warm practical lighting.',
        favorite_prompt: '',
        caption: '影好喇。',
        ratio: '16:9',
    }), 'aster', clean);
    assert.equal(json?.reply, '我諗好點影。');
    assert.equal(json?.aspectRatio, '16:9');
    assert.equal(json?.favoriteScenePrompt, undefined);

    const legacy = parseCharacterPhotoProposalDraft([
        '<reply>可以，等我照住而家個場景影。</reply>',
        '<prompt>Aster Vale beside the repaired blue lantern at the workbench, natural posture, soft workshop lighting.</prompt>',
        '<caption>拍好了。</caption>',
        '<ratio>1:1</ratio>',
    ].join(''), 'aster', clean);
    assert.equal(legacy?.aspectRatio, '1:1');
    assert.match(legacy?.scenePrompt || '', /repaired blue lantern/);
});

test('photo draft generator preserves primary route, request shape, continuity prompt, and recent-message trimming', async () => {
    const calls: Array<{
        model: string;
        messages: Array<{ role: string; content: unknown }>;
        temperature: number;
        topP: number;
        repetitionPenalty: number;
        responseFormat: unknown;
    }> = [];
    const runtime: string[] = [];
    const result = await generateCharacterPhotoProposalDraft({
        id: 7,
        personaKey: 'aster',
        conversationKey: 'aster',
        persona,
        signal: new AbortController().signal,
    }, {
        latestUserMessage: 'Take a photo beside the lantern.',
        baseChatSystemPrompt: 'BASE CHARACTER SYSTEM PROMPT',
        latestUserContent: 'Take a photo beside the lantern.',
        chatModelSettings: {
            primary: 'model-primary',
            qualityFallback: 'model-quality',
            emergencyFallback: 'model-emergency',
            ccPrimary: 'model-cc',
        },
        getRecentMessages: () => [
            { role: 'assistant', content: 'old assistant' },
            { role: 'user', content: 'recent user context' },
        ],
        setRuntimeState: (state, detail) => runtime.push(`${state}:${detail}`),
        runModel: async request => {
            calls.push(request as typeof calls[number]);
            return JSON.stringify({
                reply: '好，我會喺工作檯旁邊影。',
                prompt: 'Aster Vale standing beside the repaired blue lantern on the workshop workbench, natural pose, medium framing, warm practical light.',
                favorite_prompt: '',
                caption: '拍好了，給你。',
                ratio: '3:4',
            });
        },
        cleanChatReply: value => value.trim(),
        isAbortError: () => false,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.model, 'model-primary');
    assert.equal(calls[0]?.temperature, 0.76);
    assert.equal(calls[0]?.topP, 0.92);
    assert.equal(calls[0]?.repetitionPenalty, 1.06);
    assert.deepEqual(calls[0]?.messages.map(message => message.role), ['system', 'user', 'user']);
    assert.match(String(calls[0]?.messages[0]?.content), /BASE CHARACTER SYSTEM PROMPT/);
    assert.match(String(calls[0]?.messages[0]?.content), /CURRENT-MOMENT CONTINUITY LOCK/);
    assert.match(JSON.stringify(calls[0]?.responseFormat), /character_photo_proposal/);
    assert.deepEqual(runtime, ['generating:構思照片中...']);
    assert.equal(result.draft.aspectRatio, '3:4');
    assert.equal(result.isMultiSubject, false);
    assert.equal(result.useAvatarReference, false);
    assert.equal(result.subjectPersonas[0]?.name, 'Aster Vale');
});


test('photo continuity evidence gives newest completed interaction priority over stale room summary', async () => {
    const calls: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
    const room = {
        id: 'room-photo',
        title: 'Trip Room',
        leadMemberId: 'aster',
        favoritePhotoPrompt: '',
        members: [{ id: 'aster', persona, soul: [], memories: [] }],
        sharedSoul: [],
        sharedMemories: [],
        chatPreferences: {},
        scene: {
            id: 'scene-1',
            location: 'hotel living room',
            realityLayer: 'physical',
            presentMemberIds: ['aster'],
            summary: 'Aster is sitting calmly on the sofa.',
            unresolved: [],
            wardrobe: {
                user: 'grey T-shirt',
                characters: { aster: 'white shirt and jeans' },
            },
        },
    } as any;

    const recent = [
        { role: 'user' as const, content: 'We should pack before leaving.' },
        { role: 'assistant' as const, content: 'Aster kneels beside the open suitcase, folding the last shirt and placing her boots beside it.' },
    ];
    assert.match(buildPhotoContinuityEvidence(recent), /kneels beside the open suitcase/);

    await generateCharacterPhotoProposalDraft({
        id: 21,
        personaKey: 'aster',
        conversationKey: 'room-photo',
        persona,
        room,
        photoSenderMemberId: 'aster',
        photoSubjectMemberIds: ['aster'],
        signal: new AbortController().signal,
    }, {
        latestUserMessage: 'Take a photo now.',
        baseChatSystemPrompt: 'BASE CHARACTER SYSTEM PROMPT',
        latestUserContent: 'Take a photo now.',
        chatModelSettings: {
            primary: 'model-primary',
            qualityFallback: 'model-quality',
            emergencyFallback: 'model-emergency',
            ccPrimary: 'model-cc',
        },
        getRecentMessages: () => recent.map(message => ({ ...message })),
        setRuntimeState: () => undefined,
        runModel: async request => {
            calls.push(request as typeof calls[number]);
            return JSON.stringify({
                reply: '好，我就照而家執行李呢一刻影。',
                prompt: 'Aster Vale kneeling beside an open suitcase while folding the last shirt, her boots placed beside the luggage, white shirt and jeans, candid medium shot, warm hotel room lighting.',
                favorite_prompt: '',
                caption: '拍好了，給你。',
                ratio: '3:4',
            });
        },
        cleanChatReply: value => value.trim(),
        isAbortError: () => false,
    });

    const system = String(calls[0]?.messages[0]?.content || '');
    assert.match(system, /ROOM\/SCENE BASELINE — SECONDARY EVIDENCE ONLY/);
    assert.match(system, /Aster is sitting calmly on the sofa/);
    assert.match(system, /PHOTO CONTINUITY EVIDENCE — PRIMARY EVIDENCE/);
    assert.match(system, /Aster kneels beside the open suitcase/);
    assert.match(system, /newest completed turns above outrank a stale room summary/);
    assert.match(system, /recent completed dialogue\/narration wins/);
});

test('photo proposal refuses stale local scene fallback when every analysis model fails', async () => {
    let calls = 0;
    const room = {
        id: 'room-photo-fail',
        title: 'Room',
        leadMemberId: 'aster',
        favoritePhotoPrompt: '',
        members: [{ id: 'aster', persona, soul: [], memories: [] }],
        sharedSoul: [],
        sharedMemories: [],
        chatPreferences: {},
        scene: {
            id: 'scene-1',
            location: 'old living room',
            realityLayer: 'physical',
            presentMemberIds: ['aster'],
            summary: 'Old stale scene summary.',
            unresolved: [],
            wardrobe: { user: '', characters: {} },
        },
    } as any;

    await assert.rejects(
        () => generateCharacterPhotoProposalDraft({
            id: 22,
            personaKey: 'aster',
            conversationKey: 'room-photo-fail',
            persona,
            room,
            photoSenderMemberId: 'aster',
            photoSubjectMemberIds: ['aster'],
            signal: new AbortController().signal,
        }, {
            latestUserMessage: 'Take a photo now.',
            baseChatSystemPrompt: 'BASE CHARACTER SYSTEM PROMPT',
            latestUserContent: 'Take a photo now.',
            chatModelSettings: {
                primary: 'model-primary',
                qualityFallback: 'model-quality',
                emergencyFallback: 'model-emergency',
                ccPrimary: 'model-cc',
            },
            getRecentMessages: () => [
                { role: 'user', content: 'We are packing.' },
                { role: 'assistant', content: 'Aster is crouched beside the suitcase.' },
            ],
            setRuntimeState: () => undefined,
            runModel: async () => {
                calls += 1;
                throw new Error('proposal unavailable');
            },
            cleanChatReply: value => value.trim(),
            isAbortError: () => false,
        }),
        /未能可靠分析角色剛才正在做甚麼/u,
    );
    assert.equal(calls, 3);
});


test('photo proposal path has no outer stale-room emergency fallback and persists content mode', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/characterPhotoProposalGeneration.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(indexSource, /buildEmergencyCharacterPhotoProposal/);
    assert.doesNotMatch(indexSource, /showing an editable local proposal/);
    assert.match(indexSource, /contentMode,/);
    assert.match(featureSource, /inferCharacterPhotoContentMode/);
});
