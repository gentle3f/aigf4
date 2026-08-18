import assert from 'node:assert/strict';
import test from 'node:test';
import {
    advanceRelationshipState,
    buildFallbackSurpriseEventMemberRoles,
    buildFallbackSurpriseShowMemberRoles,
    parseSurpriseEventProposal,
    relationshipStageFor,
    surpriseEventHasSpecificActivities,
    surpriseEventHasPlayableStructure,
    surpriseEventMatchesCategory,
    surpriseEventMatchesContentMode,
    surpriseEventReadsLikeInteractiveShow,
    surpriseEventsAreTooSimilar,
    SURPRISE_EVENT_RESPONSE_FORMAT,
} from '../experienceEngine.js';

test('keeps local room identity data out of the model response schema', () => {
    const schema = SURPRISE_EVENT_RESPONSE_FORMAT.json_schema.schema as {
        required: string[];
        properties: Record<string, unknown>;
    };
    assert.equal(schema.required.includes('involved_member_ids'), false);
    assert.equal(schema.required.includes('member_roles'), false);
    assert.equal('involved_member_ids' in schema.properties, false);
    assert.equal('member_roles' in schema.properties, false);
    assert.equal(schema.required.includes('activities'), true);
});

test('parses prompt-level JSON even when a model wraps it in commentary', () => {
    const parsed = parseSurpriseEventProposal(`Here is the requested JSON:\n\`\`\`json\n${JSON.stringify({
        title: '即場互動節目',
        category: 'backstage',
        intensity: 'playful',
        hook: '表演結束後，後台的第一回合立即開始。',
        setup: '五位參與者已站到舞台中央，按抽籤順序完成挑戰。',
        opening_instruction: '直接抽出第一張卡，不要替使用者作決定。',
        activities: [
            '所有參與者輪流抽取題目卡，依次朗讀並立即回答。',
            '每人進行六十秒限時表演，其餘參與者即場評分。',
            '得分最低者使用加碼卡，由使用者決定保留或交換。',
        ],
        user_choice: '你要指定誰先抽卡，還是交給現場抽籤？',
        relationship_effect: { closeness: 2, trust: 1, romantic_tension: 3, initiative: 2 },
    })}\n\`\`\`\nReady.` , ['iu'], 'iu');

    assert.equal(parsed?.title, '即場互動節目');
    assert.equal(parsed ? surpriseEventHasSpecificActivities(parsed) : false, true);
});

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
        activities: [
            '五人抽取不同題目的卡牌並按抽籤次序朗讀。',
            '每人完成卡牌上的限時表演，再由其他參與者評分。',
            '最低分者抽取加碼條件，由使用者選擇保留或更換。',
        ],
        user_choice: '你要先查看誰帶來的線索？',
        relationship_effect: { closeness: 2, trust: 1, romantic_tension: 2, initiative: 2 },
    }), memberIds, 'iu');

    assert.deepEqual(parsed?.involvedMemberIds, memberIds);
    assert.deepEqual(parsed?.memberRoles?.map(role => role.memberId), memberIds);
    assert.equal(parsed ? surpriseEventHasSpecificActivities(parsed) : false, true);
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

test('builds a live show cast instead of assigning planning jobs', () => {
    const participants = ['irene', 'seulgi', 'yeri', 'wendy', 'joy']
        .map(id => ({ id, name: id.toUpperCase() }));
    const memberRoles = buildFallbackSurpriseShowMemberRoles(participants);
    const event = {
        title: '18+ 節目：午夜挑戰',
        hook: '所有參與者進入同一個成人互動節目。',
        setup: '第一回合的挑戰卡已經放在舞台中央，節目現在開始。',
        memberRoles,
        activities: [
            '所有參與者抽取題目卡並依次朗讀自己的題目。',
            '抽中者完成六十秒即興表演，其餘參與者即場評分。',
            '最低分者抽取加碼卡，再由使用者選擇保留或交換。',
        ],
    };

    assert.equal(memberRoles.length, 5);
    assert.equal(new Set(memberRoles.map(role => role.firstMove)).size, 5);
    assert.equal(surpriseEventReadsLikeInteractiveShow(event), true);
    assert.equal(surpriseEventHasSpecificActivities(event), true);
    assert.equal(memberRoles.some(role => /確認時間|路線|處理.*風險|重新協調/u.test(role.firstMove)), false);
});

test('rejects vague activity labels without an executable action', () => {
    assert.equal(surpriseEventHasSpecificActivities({
        activities: ['成人挑戰', '進行親密互動', '完成一項不同的活動'],
    }), false);
});

test('rejects an event card that is only a planning outline', () => {
    assert.equal(surpriseEventReadsLikeInteractiveShow({
        title: '今晚的安排',
        hook: '大家正在討論稍後要做甚麼。',
        setup: '先確認時間與地點，再決定是否開始。',
        memberRoles: [{
            memberId: 'irene',
            objective: '確認時間、地點與現實限制',
            firstMove: 'Irene 先確認行程並處理可能中斷的風險。',
        }],
    }), false);
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
