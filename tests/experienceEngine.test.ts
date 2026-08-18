import assert from 'node:assert/strict';
import test from 'node:test';
import {
    advanceRelationshipState,
    buildFallbackSurpriseEventMemberRoles,
    parseSurpriseEventProposal,
    relationshipStageFor,
    surpriseEventHasPlayableStructure,
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
        member_roles: memberIds.map((memberId, index) => ({
            member_id: memberId,
            objective: `完成屬於第 ${index + 1} 位的不同任務`,
            first_move: `${memberId} 立即拿出自己準備好的第 ${index + 1} 份線索。`,
        })),
        user_choice: '你要先查看誰帶來的線索？',
        relationship_effect: { closeness: 2, trust: 1, romantic_tension: 2, initiative: 2 },
    }), memberIds, 'iu');

    assert.deepEqual(parsed?.involvedMemberIds, memberIds);
    assert.deepEqual(parsed?.memberRoles?.map(role => role.memberId), memberIds);
    assert.equal(parsed ? surpriseEventHasPlayableStructure(parsed, memberIds) : false, true);
});

test('rejects a surprise event whose role plan omits a selected participant', () => {
    const memberIds = ['iu', 'jennie', 'irene'];
    assert.equal(surpriseEventHasPlayableStructure({
        memberRoles: [
            { memberId: 'iu', objective: '揭開事件的第一條線索', firstMove: 'IU 把密封信放到桌面中央。' },
            { memberId: 'jennie', objective: '核對線索出現的時間', firstMove: 'Jennie 立即翻出手機內的時間紀錄。' },
        ],
        userChoice: '你要先打開信，還是先看時間紀錄？',
    }, memberIds), false);
});

test('builds distinct playable fallback roles for all five participants', () => {
    const participants = ['iu', 'jennie', 'irene', 'rose', 'lisa']
        .map(id => ({ id, name: id.toUpperCase() }));
    const roles = buildFallbackSurpriseEventMemberRoles(participants, 'backstage');
    const event = {
        memberRoles: roles,
        userChoice: '你要先處理後台意外，還是先改變原本安排？',
    };

    assert.equal(roles.length, 5);
    assert.equal(new Set(roles.map(role => role.firstMove)).size, 5);
    assert.equal(surpriseEventHasPlayableStructure(event, participants.map(item => item.id)), true);
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
