import assert from 'node:assert/strict';
import test from 'node:test';
import {
    advanceRelationshipState,
    parseSurpriseEventProposal,
    relationshipStageFor,
    surpriseEventMatchesCategory,
    surpriseEventMatchesContentMode,
    surpriseEventsAreTooSimilar,
} from '../experienceEngine.js';

test('parses an event while filtering invented room member IDs', () => {
    const parsed = parseSurpriseEventProposal(JSON.stringify({
        title: '後台的暗號',
        category: 'backstage',
        intensity: 'playful',
        hook: '演出後，她在人群裡留下只給你看的暗號。',
        setup: '工作人員仍在附近，她只能悄悄把你帶到休息室門外。',
        opening_instruction: '從她主動示意開始，不替使用者行動。',
        involved_member_ids: ['iu', 'invented'],
        relationship_effect: { closeness: 3, trust: 1, romantic_tension: 4, initiative: 2 },
    }), ['iu', 'jennie'], 'iu');

    assert.deepEqual(parsed?.involvedMemberIds, ['iu']);
    assert.equal(parsed?.category, 'backstage');
    assert.equal(parsed?.relationshipEffect.romanticTension, 4);
});

test('preserves all five selected surprise-event participants', () => {
    const memberIds = ['iu', 'jennie', 'irene', 'rose', 'lisa'];
    const parsed = parseSurpriseEventProposal(JSON.stringify({
        title: '五人的邀請',
        category: 'celebration',
        intensity: 'playful',
        hook: '五人準備了一份驚喜禮物。',
        setup: '她們用一個私下慶祝安排邀請你加入。',
        opening_instruction: '讓五人各自參與，但不要替使用者答應。',
        involved_member_ids: memberIds,
        relationship_effect: { closeness: 2, trust: 1, romantic_tension: 2, initiative: 2 },
    }), memberIds, 'iu');

    assert.deepEqual(parsed?.involvedMemberIds, memberIds);
});

test('distinguishes explicit 18+ cards from non-sexual cards', () => {
    const nsfwCard = {
        title: '成人限定挑戰',
        hook: '她拿出一件成人情趣用品。',
        setup: '一場明確的 18+ 性挑戰正等待你的決定。',
        openingInstruction: '保持 NSFW 成人情境，但不要替使用者答應。',
    };
    const ordinaryCard = {
        title: '後台密室',
        hook: '演出後收到一封匿名邀請。',
        setup: '她們決定一起找出寄件人。',
        openingInstruction: '從第一條線索開始。',
    };

    assert.equal(surpriseEventMatchesContentMode(nsfwCard, 'nsfw'), true);
    assert.equal(surpriseEventMatchesContentMode(nsfwCard, 'non-sexual'), false);
    assert.equal(surpriseEventMatchesContentMode(ordinaryCard, 'non-sexual'), true);
    assert.equal(surpriseEventMatchesContentMode(ordinaryCard, 'nsfw'), false);
});

test('detects renamed versions of the same event', () => {
    const first = { title: '後台的秘密', hook: '演出後她在後台找你', setup: '工作人員離開後，她把你拉進休息室。' };
    const renamed = { title: '休息室秘密', hook: '表演結束後她在後台找你', setup: '工作人員走了，她把你拉到休息室裡。' };
    assert.equal(surpriseEventsAreTooSimilar(first, renamed), true);
});

test('detects the same phone deadline event despite different wording and category labels', () => {
    const first = { title: '突然的通知', hook: '手機來電打破清晨', setup: 'Jennie 在大家熟睡時收到三小時後的緊急行程。' };
    const renamed = { title: '意外的訪客', hook: '一封郵件令她醒來', setup: 'Jennie 的手機收到通知，她要在三小時內處理突發工作。' };
    assert.equal(surpriseEventsAreTooSimilar(first, renamed), true);
});

test('requires real semantic evidence for the selected event category', () => {
    assert.equal(surpriseEventMatchesCategory({
        title: '意外的訪客',
        category: 'unexpected_guest',
        hook: '手機收到一封緊急郵件。',
        setup: '她要在三小時內處理新的工作安排。',
    }), false);
    assert.equal(surpriseEventMatchesCategory({
        title: '門外的人',
        category: 'unexpected_guest',
        hook: '門外忽然響起三下敲門聲。',
        setup: '一位不該在這裡出現的舊朋友站在門口。',
    }), true);
});

test('relationship pulse progresses without exposing or exploding scores', () => {
    assert.equal(relationshipStageFor(72, 70), 'romantic');
    const next = advanceRelationshipState({
        name: 'Test', emoji: 'T', gender: 'female', description: '', prompt: '', greeting: '', avatarPrompt: '', avatarUrl: null,
        relationshipState: { closeness: 60, trust: 60, romanticTension: 45, initiative: 40, stage: 'close', updatedAt: 1 },
    }, '我相信你，也很想念你。', '讓我來安排今晚，我會好好陪你。', {
        closeness: 6, trust: 6, romanticTension: 7, initiative: 6,
    });
    assert.ok(next.closeness > 60 && next.closeness <= 100);
    assert.ok(next.trust > 60 && next.trust <= 100);
    assert.ok(next.initiative > 40 && next.initiative <= 100);
});
