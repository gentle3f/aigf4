import type {
    ChatContextBridge,
    MemoryManager,
    Persona,
    PersonaMemoryEntry,
} from '../managers.js';
import {
    IU_GROUP_ROOM_ID,
    ROOM_MEMBER_LIMIT,
    ROOM_PRESENT_MEMBER_LIMIT,
    cloneRoomSnapshot,
} from '../roomManager.js';
import type {
    ChatRoom,
    RoomManager,
    RoomMember,
    RoomMemoryEntry,
} from '../roomManager.js';
import { VENICE_ASSISTANT_PERSONA_KEY } from '../personas.tsx';
import {
    buildContextBridge,
    contextBridgeDisplayText,
} from '../conversationTransfer.js';
import { roomMemberToPersona } from '../conversationTransferPersona.js';

export type ParticipantActionMode = 'dm' | 'invite' | 'leave';

export type ParticipantActionDependencies = {
    memoryManager: MemoryManager;
    roomManager: RoomManager;
    getCurrentRoom: () => ChatRoom | null;
    getCurrentPersona: () => Persona | null;
    getCurrentPersonaKey: () => string | null;
    getCurrentConversationKey: () => string | null;
    hasActiveChatRequest: () => boolean;
    maybeSummarizePersonaMemory: (
        personaKey: string,
        mode: 'recent' | 'full',
    ) => Promise<{ status: string }>;
    renderPersonaList: () => void;
    startChat: (
        key: string,
        restoredHistory?: any[] | null,
        historyMode?: 'push' | 'replace' | 'skip',
    ) => void;
    resolveRoomMemberAvatarPersona: (member: RoomMember) => Persona;
    hideRoomInfo: () => void;
    hideMoreOptionsMenu: () => void;
};

export type ParticipantActionHandle = {
    open: (mode: ParticipantActionMode) => void;
    close: () => void;
    openPrivateChat: (roomId: string, memberId: string) => Promise<void>;
    setMemberPresence: (roomId: string, memberId: string, present: boolean) => Promise<boolean>;
};

const participantActionModal = document.getElementById('participant-action-modal')!;
const closeParticipantActionBtn = document.getElementById('close-participant-action') as HTMLButtonElement;
const participantActionTitle = document.getElementById('participant-action-title')!;
const participantActionSummary = document.getElementById('participant-action-summary')!;
const participantActionList = document.getElementById('participant-action-list')!;

let dependencies: ParticipantActionDependencies | null = null;
let memoryManager: MemoryManager;
let roomManager: RoomManager;
let currentRoom: ChatRoom | null = null;
let currentPersona: Persona | null = null;
let currentPersonaKey: string | null = null;
let currentConversationKey: string | null = null;
let activeChatRequest = false;
let listenersReady = false;

let maybeSummarizePersonaMemory: ParticipantActionDependencies['maybeSummarizePersonaMemory'];
let renderPersonaList: ParticipantActionDependencies['renderPersonaList'];
let startChat: ParticipantActionDependencies['startChat'];
let resolveRoomMemberAvatarPersona: ParticipantActionDependencies['resolveRoomMemberAvatarPersona'];

const getDependencies = () => {
    if (!dependencies) throw new Error('Participant Action dependencies are not initialized.');
    return dependencies;
};

const syncContext = () => {
    const deps = getDependencies();
    memoryManager = deps.memoryManager;
    roomManager = deps.roomManager;
    currentRoom = deps.getCurrentRoom();
    currentPersona = deps.getCurrentPersona();
    currentPersonaKey = deps.getCurrentPersonaKey();
    currentConversationKey = deps.getCurrentConversationKey();
    activeChatRequest = deps.hasActiveChatRequest();
    maybeSummarizePersonaMemory = deps.maybeSummarizePersonaMemory;
    renderPersonaList = deps.renderPersonaList;
    startChat = deps.startChat;
    resolveRoomMemberAvatarPersona = deps.resolveRoomMemberAvatarPersona;
};

const hideRoomInfo = () => getDependencies().hideRoomInfo();
const hideMoreOptionsMenu = () => getDependencies().hideMoreOptionsMenu();

interface ParticipantTransferCandidate {
    id: string;
    persona: Persona;
    sourcePersonaKey?: string;
    sourceLabel: string;
    originRoomId?: string;
    originMemberId?: string;
    targetRoomId?: string;
    replaceMemberId?: string;
    privateUserTurnCount?: number;
}

const participantIdentityFingerprint = (persona: Persona) => (
    persona.publicIdentity?.canonicalName || persona.name
).replace(/\s+/gu, ' ').trim().toLocaleLowerCase();

const participantContinuityFingerprint = (persona: Persona) => JSON.stringify({
    name: persona.name,
    description: persona.description,
    prompt: persona.prompt,
    soul: (persona.soul || []).map(entry => `${entry.kind}:${entry.summary}`),
    memories: (persona.memories || []).map(entry => `${entry.kind}:${entry.summary}`),
});

const roomMemberMatchesCandidate = (member: RoomMember, candidate: ParticipantTransferCandidate) => {
    if (candidate.sourcePersonaKey && (
        member.sourcePersonaKey === candidate.sourcePersonaKey
        || member.privatePersonaKey === candidate.sourcePersonaKey
    )) return true;
    return participantIdentityFingerprint(member.persona) === participantIdentityFingerprint(candidate.persona);
};

const collectParticipantTransferCandidates = () => {
    syncContext();
    const candidates = new Map<string, ParticipantTransferCandidate>();
    const excludedKeys = new Set<string>();
    const excludedIdentities = new Set<string>();

    if (currentRoom) {
        currentRoom.members.forEach(member => {
            if (member.sourcePersonaKey) excludedKeys.add(member.sourcePersonaKey);
            if (member.privatePersonaKey) excludedKeys.add(member.privatePersonaKey);
            excludedIdentities.add(participantIdentityFingerprint(member.persona));
        });
    } else if (currentPersona && currentPersonaKey) {
        excludedKeys.add(currentPersonaKey);
        excludedIdentities.add(participantIdentityFingerprint(currentPersona));
        roomManager.getRooms().filter(room => !room.timelineBranch).forEach(room => {
            const linkedMember = room.members.find(member => member.privatePersonaKey === currentPersonaKey);
            if (!linkedMember) return;
            const privateUserTurnCount = memoryManager.peekChatHistory(currentPersonaKey!)
                .filter(message => message.role === 'user').length;
            if (privateUserTurnCount <= Number(linkedMember.privateContinuityImportedUserMessageCount || 0)) return;
            const candidateId = `return:${room.id}:${linkedMember.id}:${currentPersonaKey}`;
            candidates.set(candidateId, {
                id: candidateId,
                persona: cloneRoomSnapshot(currentPersona!),
                sourcePersonaKey: currentPersonaKey!,
                sourceLabel: `帶著目前私訊記憶回到「${room.title}」並取代舊版本`,
                targetRoomId: room.id,
                replaceMemberId: linkedMember.id,
                privateUserTurnCount,
            });
        });
    }

    Object.entries(memoryManager.getAllPersonas()).forEach(([key, persona]) => {
        const identity = participantIdentityFingerprint(persona);
        const replaceableMember = currentRoom?.members.find(member => (
            member.privatePersonaKey === key
            && participantIdentityFingerprint(member.persona) === identity
        ));
        const privateUserTurnCount = replaceableMember
            ? memoryManager.peekChatHistory(key).filter(message => message.role === 'user').length
            : 0;
        const importedUserTurnCount = Number(
            replaceableMember?.privateContinuityImportedUserMessageCount || 0,
        );
        if (
            replaceableMember
            && privateUserTurnCount > importedUserTurnCount
            && key !== VENICE_ASSISTANT_PERSONA_KEY
            && persona.gender === 'female'
            && !persona.timelineBranch
        ) {
            const candidateId = `replace:${currentRoom!.id}:${replaceableMember.id}:${key}`;
            candidates.set(candidateId, {
                id: candidateId,
                persona: cloneRoomSnapshot(persona),
                sourcePersonaKey: key,
                sourceLabel: `私訊版本 · ${privateUserTurnCount} 個對話回合 · 將取代群組舊版本`,
                replaceMemberId: replaceableMember.id,
                privateUserTurnCount,
            });
            return;
        }
        if (
            key === VENICE_ASSISTANT_PERSONA_KEY
            || persona.gender !== 'female'
            || Boolean(persona.timelineBranch)
            || excludedKeys.has(key)
            || excludedIdentities.has(identity)
        ) return;
        const candidateId = `persona:${key}`;
        candidates.set(candidateId, {
            id: candidateId,
            persona: cloneRoomSnapshot(persona),
            sourcePersonaKey: key,
            sourceLabel: memoryManager.peekChatHistory(key).length > 0 ? '來自私人聊天' : '現有角色',
            privateUserTurnCount: memoryManager.peekChatHistory(key)
                .filter(message => message.role === 'user').length,
        });
    });

    roomManager.getRooms().filter(room => !room.timelineBranch).forEach(room => {
        room.members.forEach(member => {
            const sourcePersonaKey = member.privatePersonaKey || member.sourcePersonaKey;
            const sourcePersona = sourcePersonaKey ? memoryManager.getPersona(sourcePersonaKey) : undefined;
            const persona = roomMemberToPersona(member, sourcePersona);
            const identity = participantIdentityFingerprint(persona);
            const candidateId = `room:${room.id}:${member.id}`;
            const matchesUnchangedSource = sourcePersonaKey
                && candidates.has(`persona:${sourcePersonaKey}`)
                && sourcePersona
                && participantContinuityFingerprint(persona) === participantContinuityFingerprint(sourcePersona);
            if (
                persona.gender !== 'female'
                || excludedIdentities.has(identity)
                || (sourcePersonaKey && excludedKeys.has(sourcePersonaKey))
                || matchesUnchangedSource
            ) return;
            candidates.set(candidateId, {
                id: candidateId,
                persona,
                sourcePersonaKey,
                sourceLabel: `來自群組「${room.title}」`,
                originRoomId: room.id,
                originMemberId: member.id,
            });
        });
    });

    return [...candidates.values()].sort((left, right) => (
        left.persona.name.localeCompare(right.persona.name, 'zh-Hant')
        || left.sourceLabel.localeCompare(right.sourceLabel, 'zh-Hant')
    ));
};

const createTransferredRoomMember = (
    candidate: ParticipantTransferCandidate,
    fixedMemberId?: string,
): RoomMember => {
    const joinedAt = Date.now();
    const memberId = fixedMemberId || `member_${joinedAt}_${Math.random().toString(36).slice(2, 8)}`;
    const persona = cloneRoomSnapshot(candidate.persona);
    const toRoomMemory = (entry: PersonaMemoryEntry, pinned: boolean): RoomMemoryEntry => ({
        ...cloneRoomSnapshot(entry),
        participants: [memberId],
        pinned,
        roleplayOnly: true,
    });
    return {
        id: memberId,
        sourcePersonaKey: candidate.sourcePersonaKey,
        privatePersonaKey: candidate.sourcePersonaKey,
        privateContinuityImportedUserMessageCount: candidate.privateUserTurnCount,
        persona,
        joinedAt,
        soul: (persona.soul || []).map(entry => toRoomMemory(entry, true)),
        memories: (persona.memories || []).map(entry => toRoomMemory(entry, false)),
    };
};

const appendContextBridge = (conversationKey: string, bridge: ChatContextBridge) => {
    memoryManager.addMessage(conversationKey, 'system', {
        text: contextBridgeDisplayText(bridge),
        contextBridge: bridge,
    });
};

const saveBridgeAsPersonaMemory = (personaKey: string, bridge: ChatContextBridge) => {
    memoryManager.addPersonaMemory(personaKey, 'memory', {
        kind: 'event',
        title: `從 ${bridge.sourceTitle} 承接的情境`,
        summary: bridge.summary,
    });
};

const resolveRoomMemberPrivatePersonaKey = async (room: ChatRoom, member: RoomMember) => {
    const protectedIuArchive = room.id === IU_GROUP_ROOM_ID
        && member.id === 'iu'
        && member.sourcePersonaKey === room.legacySourcePersonaKey;
    const existingKey = member.privatePersonaKey
        || (!protectedIuArchive ? member.sourcePersonaKey : undefined);
    if (existingKey && memoryManager.getPersona(existingKey)) {
        if (member.privatePersonaKey !== existingKey) {
            const existingUserTurns = memoryManager.peekChatHistory(existingKey)
                .filter(message => message.role === 'user').length;
            roomManager.updateMember(room.id, member.id, {
                privatePersonaKey: existingKey,
                privateContinuityImportedUserMessageCount: existingUserTurns,
            });
        }
        return existingKey;
    }

    const sourcePersona = member.sourcePersonaKey
        ? memoryManager.getPersona(member.sourcePersonaKey)
        : undefined;
    const personaKey = await memoryManager.saveCustomPersonaCopy(roomMemberToPersona(member, sourcePersona));
    roomManager.updateMember(room.id, member.id, {
        privatePersonaKey: personaKey,
        privateContinuityImportedUserMessageCount: 0,
    });
    return personaKey;
};

const openPrivateChatForRoomMember = async (roomId: string, memberId: string) => {
    syncContext();
    if (activeChatRequest) {
        alert('請先等待目前回覆完成，再切換到私訊。');
        return;
    }
    const room = roomManager.getRoom(roomId);
    const member = room?.members.find(item => item.id === memberId);
    if (!room || !member) throw new Error('找不到這位群組成員。');

    const personaKey = await resolveRoomMemberPrivatePersonaKey(room, member);
    const bridge = buildContextBridge({
        kind: 'group_to_private',
        sourceConversationKey: room.id,
        sourceTitle: room.title,
        history: memoryManager.getChatHistory(room.id),
        room,
        targetMemberName: member.persona.name,
    });
    const transferredPersona = roomMemberToPersona(member, memoryManager.getPersona(personaKey));
    (transferredPersona.soul || []).forEach(entry => {
        memoryManager.addPersonaMemory(personaKey, 'soul', {
            kind: entry.kind,
            title: entry.title,
            summary: entry.summary,
            originalText: entry.originalText,
            sourceMessageIds: entry.sourceMessageIds,
            sourceMessageIndexes: entry.sourceMessageIndexes,
        });
    });
    (transferredPersona.memories || []).forEach(entry => {
        memoryManager.addPersonaMemory(personaKey, 'memory', {
            kind: entry.kind,
            title: entry.title,
            summary: entry.summary,
            originalText: entry.originalText,
            sourceMessageIds: entry.sourceMessageIds,
            sourceMessageIndexes: entry.sourceMessageIndexes,
        });
    });
    saveBridgeAsPersonaMemory(personaKey, bridge);
    if (!memoryManager.hasChatHistory(personaKey)) memoryManager.setChatHistory(personaKey, []);
    appendContextBridge(personaKey, bridge);

    participantActionModal.classList.add('hidden');
    hideRoomInfo();
    renderPersonaList();
    startChat(personaKey);
};

const replaceRoomMemberWithPrivateCandidate = async (
    room: ChatRoom,
    candidate: ParticipantTransferCandidate,
) => {
    syncContext();
    if (!candidate.replaceMemberId || !candidate.sourcePersonaKey) return;
    const oldMember = room.members.find(member => member.id === candidate.replaceMemberId);
    if (!oldMember) throw new Error('群組中的舊角色版本已不存在。');
    const wasPresent = room.scene.presentMemberIds.includes(oldMember.id);
    if (!wasPresent && room.scene.presentMemberIds.length >= ROOM_PRESENT_MEMBER_LIMIT) {
        alert(`目前已有 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場，請先請一位角色離場。`);
        return;
    }
    if (!confirm(
        `以私訊中的 ${candidate.persona.name} 取代群組內的舊版本？\n\n`
        + '私訊聊天會完整保留；群組舊訊息也不會刪除，但往後會使用私訊版的人格、soul.md 與 memory.md。',
    )) return;

    const privatePersonaKey = candidate.sourcePersonaKey;
    const memoryUpdate = await maybeSummarizePersonaMemory(privatePersonaKey, 'recent');
    const privatePersona = memoryManager.getPersona(privatePersonaKey);
    if (!privatePersona) throw new Error('找不到要帶回群組的私訊角色。');
    const privateHistory = memoryManager.peekChatHistory(privatePersonaKey);
    const replacement = createTransferredRoomMember({
        ...candidate,
        persona: cloneRoomSnapshot(privatePersona),
    }, oldMember.id);
    const bridge = buildContextBridge({
        kind: 'member_returned',
        sourceConversationKey: privatePersonaKey,
        sourceTitle: `${privatePersona.name} 的私訊`,
        history: privateHistory,
        targetMemberName: privatePersona.name,
        summaryOverride: [
            `${privatePersona.name} 的獨立私訊版本已取代群組中的舊版本並回到聊天室。`,
            '她保留私訊中建立的關係、承諾、經歷與情感發展；群組其他成員只會從現在開始接觸這個版本。',
            memoryUpdate.status === 'error'
                ? '自動記憶整理暫時失敗，因此先以現有 memory.md 與近期私訊內容承接。'
                : '',
        ].filter(Boolean).join(' '),
    });
    replacement.privateContinuityHandoff = cloneRoomSnapshot(bridge);

    roomManager.replaceMember(room.id, oldMember.id, replacement);
    if (!wasPresent) {
        roomManager.setPresentMembers(room.id, [...room.scene.presentMemberIds, oldMember.id]);
    }
    roomManager.addSoulMemory(room.id, [oldMember.id], {
        kind: 'core',
        title: '私訊分支回歸界線',
        summary: [
            `${privatePersona.name} 是從獨立私訊回歸的版本。`,
            '她保留建立私訊時承接的群組背景，以及其後在私訊中親自經歷的事情。',
            '她不會自動繼承舊群組版本在兩條對話分開後新增的個人經歷；其他成員可在回歸後把需要知道的事情告訴她。',
        ].join(''),
        participants: [oldMember.id],
        roleplayOnly: true,
    });
    roomManager.updateRoom(room.id, editableRoom => {
        editableRoom.scene.summary = (
            `${editableRoom.scene.summary} 群組中的舊 ${oldMember.persona.name} 已離開，`
            + `承接獨立私訊經歷的 ${privatePersona.name} 現已回到聊天室。`
        ).slice(-1500);
    });
    roomManager.addEpisodicMemories(room.id, [{
        kind: 'event',
        title: `${privatePersona.name} 帶著私訊經歷回到群組`,
        summary: bridge.summary,
        participants: [oldMember.id],
    }]);
    appendContextBridge(room.id, bridge);

    participantActionModal.classList.add('hidden');
    hideRoomInfo();
    renderPersonaList();
    startChat(room.id, null, currentConversationKey === room.id ? 'skip' : 'push');
};

const inviteParticipantCandidate = async (candidate: ParticipantTransferCandidate) => {
    syncContext();
    if (!currentConversationKey || !currentPersona || activeChatRequest) return;
    const sourceConversationKey = currentConversationKey;
    const sourceRoom = currentRoom ? roomManager.getRoom(currentRoom.id) || currentRoom : null;
    const sourceTitle = sourceRoom?.title || currentPersona.name;
    const sourceHistory = memoryManager.getChatHistory(sourceConversationKey);

    if (candidate.targetRoomId && candidate.replaceMemberId) {
        const targetRoom = roomManager.getRoom(candidate.targetRoomId);
        if (!targetRoom) throw new Error('原本的群組已不存在。');
        await replaceRoomMemberWithPrivateCandidate(targetRoom, candidate);
        return;
    }

    if (sourceRoom) {
        if (candidate.replaceMemberId) {
            await replaceRoomMemberWithPrivateCandidate(sourceRoom, candidate);
            return;
        }
        if (sourceRoom.members.length >= ROOM_MEMBER_LIMIT) {
            alert(`每個群組最多 ${ROOM_MEMBER_LIMIT} 位角色。`);
            return;
        }
        if (sourceRoom.scene.presentMemberIds.length >= ROOM_PRESENT_MEMBER_LIMIT) {
            alert(`目前已有 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場，請先請一位角色離場。`);
            return;
        }
        if (sourceRoom.members.some(member => roomMemberMatchesCandidate(member, candidate))) {
            alert(`${candidate.persona.name} 已經是這個聊天室的成員。`);
            return;
        }

        const member = createTransferredRoomMember(candidate);
        roomManager.addMember(sourceRoom.id, member);
        roomManager.updateRoom(sourceRoom.id, room => {
            room.scene.summary = `${room.scene.summary} ${member.persona.name} 剛獲邀加入，已閱讀必要的近期情境。`.slice(-1500);
        });
        const updatedRoom = roomManager.getRoom(sourceRoom.id)!;
        const bridge = buildContextBridge({
            kind: 'member_invited',
            sourceConversationKey,
            sourceTitle,
            history: sourceHistory,
            room: updatedRoom,
            targetMemberName: member.persona.name,
        });
        roomManager.addEpisodicMemories(sourceRoom.id, [{
            kind: 'event',
            title: `${member.persona.name} 加入聊天室`,
            summary: bridge.summary,
            participants: [member.id],
        }]);
        appendContextBridge(sourceRoom.id, bridge);
        participantActionModal.classList.add('hidden');
        renderPersonaList();
        startChat(sourceRoom.id, null, 'skip');
        return;
    }

    if (!currentPersonaKey || roomManager.getRooms().some(room => room.id === sourceConversationKey)) return;
    if (participantIdentityFingerprint(currentPersona) === participantIdentityFingerprint(candidate.persona)) {
        alert('不能邀請目前正在私訊的同一位角色。');
        return;
    }

    const room = roomManager.createRoom(
        `${currentPersona.name}、${candidate.persona.name}`,
        [
            { sourcePersonaKey: currentPersonaKey, persona: cloneRoomSnapshot(currentPersona) },
            { sourcePersonaKey: candidate.sourcePersonaKey, persona: cloneRoomSnapshot(candidate.persona) },
        ],
    );
    const bridge = buildContextBridge({
        kind: 'private_to_group',
        sourceConversationKey,
        sourceTitle,
        history: sourceHistory,
        targetMemberName: candidate.persona.name,
    });
    roomManager.updateRoom(room.id, editableRoom => {
        editableRoom.legacySourcePersonaKey = sourceConversationKey;
        editableRoom.description = `${currentPersona.name} 與 ${candidate.persona.name} 的群組`;
        editableRoom.scene.location = '由私人聊天延續的群組聊天室';
        editableRoom.scene.realityLayer = 'texting';
        editableRoom.scene.summary = `${bridge.summary} ${candidate.persona.name} 已加入並讀取必要的近期情境。`.slice(-1500);
        editableRoom.scene.unresolved = ['讓新加入的角色自然接上目前話題'];
    });
    const createdRoom = roomManager.getRoom(room.id)!;
    roomManager.addEpisodicMemories(createdRoom.id, [{
        kind: 'event',
        title: `${candidate.persona.name} 加入對話`,
        summary: bridge.summary,
        participants: createdRoom.members.map(member => member.id),
    }]);
    appendContextBridge(createdRoom.id, bridge);
    participantActionModal.classList.add('hidden');
    renderPersonaList();
    startChat(createdRoom.id, null, 'replace');
};

const setRoomMemberPresence = (roomId: string, memberId: string, present: boolean) => {
    syncContext();
    if (activeChatRequest) {
        alert('請先等待目前回覆完成，再變更在場角色。');
        return false;
    }
    const room = roomManager.getRoom(roomId);
    const member = room?.members.find(item => item.id === memberId);
    if (!room || !member) return false;
    const currentIds = [...room.scene.presentMemberIds];
    if (!present && currentIds.length <= 1) {
        alert('場景中至少需要 1 位角色在場。');
        return false;
    }
    if (present && currentIds.length >= ROOM_PRESENT_MEMBER_LIMIT) {
        alert(`同一場景最多 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場。`);
        return false;
    }
    const nextIds = present
        ? Array.from(new Set([...currentIds, member.id]))
        : currentIds.filter(id => id !== member.id);
    roomManager.setPresentMembers(room.id, nextIds);
    roomManager.updateRoom(room.id, editableRoom => {
        const event = present
            ? `${member.persona.name} 已回到目前場景。`
            : `${member.persona.name} 已離開目前場景，但仍保留為固定成員。`;
        editableRoom.scene.summary = `${editableRoom.scene.summary} ${event}`.slice(-1500);
    });
    const updatedRoom = roomManager.getRoom(room.id)!;
    const bridge = buildContextBridge({
        kind: present ? 'member_returned' : 'member_left',
        sourceConversationKey: room.id,
        sourceTitle: room.title,
        history: memoryManager.getChatHistory(room.id),
        room: updatedRoom,
        targetMemberName: member.persona.name,
    });
    appendContextBridge(room.id, bridge);
    participantActionModal.classList.add('hidden');
    return true;
};

const closeParticipantAction = () => {
    participantActionModal.classList.add('hidden');
    participantActionList.innerHTML = '';
};

const appendParticipantActionRow = (
    persona: Persona,
    detail: string,
    actionLabel: string,
    action: () => void | Promise<void>,
) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'participant-action-row';
    const avatar = document.createElement('span');
    avatar.className = 'room-member-avatar';
    if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
        const image = document.createElement('img');
        image.src = persona.avatarUrl;
        image.alt = persona.name;
        avatar.appendChild(image);
    } else avatar.textContent = persona.emoji || '●';
    const copy = document.createElement('span');
    copy.className = 'participant-action-copy';
    const name = document.createElement('strong');
    name.textContent = persona.name;
    const description = document.createElement('small');
    description.textContent = `${detail} · ${persona.description}`;
    copy.append(name, description);
    const actionText = document.createElement('span');
    actionText.className = 'participant-action-label';
    actionText.textContent = actionLabel;
    button.append(avatar, copy, actionText);
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await action();
        } catch (error) {
            alert(error instanceof Error ? error.message : '未能完成角色操作。');
        } finally {
            if (!participantActionModal.classList.contains('hidden')) button.disabled = false;
        }
    });
    participantActionList.appendChild(button);
};

const openParticipantAction = (mode: ParticipantActionMode) => {
    syncContext();
    if (activeChatRequest) {
        alert('請先等待目前回覆完成。');
        return;
    }
    participantActionList.innerHTML = '';
    hideMoreOptionsMenu();

    if (mode === 'invite') {
        participantActionTitle.textContent = '邀請角色加入';
        participantActionSummary.textContent = currentRoom
            ? '可邀請其他角色；若群組成員已有獨立私訊版本，也可用私訊版安全取代舊版本。'
            : '可邀請另一位角色建立新群組；若這是由群組分出的私訊，也可帶著新記憶回到原群組。';
        collectParticipantTransferCandidates().forEach(candidate => {
            appendParticipantActionRow(
                candidate.persona,
                candidate.sourceLabel,
                candidate.targetRoomId
                    ? '回到群組'
                    : candidate.replaceMemberId ? '取代舊版本' : '邀請',
                () => inviteParticipantCandidate(candidate),
            );
        });
    } else {
        const room = currentRoom ? roomManager.getRoom(currentRoom.id) || currentRoom : null;
        if (!room) return;
        participantActionTitle.textContent = mode === 'dm' ? '私訊群組成員' : '請角色離場';
        participantActionSummary.textContent = mode === 'dm'
            ? '私訊會成為獨立聊天，並只承接必要的近期群組情境；原群組保持不變。'
            : '角色只會離開目前場景，不會刪除人格、soul.md、memory.md 或群組身份。';
        room.members
            .filter(member => mode === 'dm' || room.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                appendParticipantActionRow(
                    resolveRoomMemberAvatarPersona(member),
                    mode === 'dm'
                        ? room.scene.presentMemberIds.includes(member.id) ? '目前在場' : '目前不在場'
                        : '目前在場',
                    mode === 'dm' ? '私訊' : '離場',
                    mode === 'dm'
                        ? () => openPrivateChatForRoomMember(room.id, member.id)
                        : () => {
                            if (confirm(`請 ${member.persona.name} 離開目前場景？`)) {
                                setRoomMemberPresence(room.id, member.id, false);
                            }
                        },
                );
            });
    }

    if (!participantActionList.children.length) {
        const empty = document.createElement('p');
        empty.className = 'participant-action-empty';
        empty.textContent = mode === 'invite'
            ? '暫時沒有其他可邀請的角色。'
            : mode === 'leave' ? '目前沒有可請離場的角色。' : '這個群組沒有可私訊的角色。';
        participantActionList.appendChild(empty);
    }
    participantActionModal.classList.remove('hidden');
};



const setupParticipantActionListeners = () => {
    if (listenersReady) return;
    listenersReady = true;
    closeParticipantActionBtn.addEventListener('click', closeParticipantAction);
    participantActionModal.addEventListener('click', event => {
        if (event.target === participantActionModal) closeParticipantAction();
    });
};

export const createParticipantActionUi = (
    nextDependencies: ParticipantActionDependencies,
): ParticipantActionHandle => {
    dependencies = nextDependencies;
    syncContext();
    setupParticipantActionListeners();
    return {
        open: openParticipantAction,
        close: closeParticipantAction,
        openPrivateChat: async (roomId, memberId) => {
            syncContext();
            await openPrivateChatForRoomMember(roomId, memberId);
        },
        setMemberPresence: async (roomId, memberId, present) => {
            syncContext();
            return setRoomMemberPresence(roomId, memberId, present);
        },
    };
};
