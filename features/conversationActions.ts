import type { ChatMessage, MemoryManager, Persona } from '../managers.js';
import type { ChatRoom, RoomManager } from '../roomManager.js';
import { cloneRoomSnapshot } from '../roomManager.js';
import { deleteCharacterPhotoAsset } from '../photoStore.js';
import { deleteChatAttachment } from '../chatMediaStore.js';

export type ConversationActionsDependencies = {
    memoryManager: MemoryManager;
    roomManager: RoomManager;
    getCurrentConversationKey: () => string | null;
    getCurrentPersona: () => Persona | null;
    getCurrentPersonaKey: () => string | null;
    getCurrentRoom: () => ChatRoom | null;
    hasActiveChatRequest: () => boolean;
    cancelRequestForConversation: (conversationKey: string) => void;
    abortCharacterPhotoRequest: () => void;
    clearSessionMemories: (conversationKey: string) => void;
    removeSessionMemoriesBySourceMessageIds: (
        conversationKey: string,
        sourceMessageIds: string[],
    ) => number;
    closeMessageActions: () => void;
    releaseCharacterPhotoObjectUrl: (assetId: string) => void;
    releaseChatAttachmentObjectUrl: (assetId: string) => void;
    renderPersonaList: () => void;
    startChat: (
        key: string,
        restoredHistory?: ChatMessage[] | null,
        historyMode?: 'push' | 'replace' | 'skip',
    ) => void;
    showSelectionView: (historyMode?: 'replace' | 'skip') => void;
    restoreDraft: (text: string, mode: 'branch' | 'recall') => void;
};

export type ConversationActionsHandle = {
    deleteCustomPersona: (key: string) => Promise<void>;
    deleteConversation: (key: string, title: string, room?: ChatRoom) => Promise<void>;
    clearCurrentChat: () => Promise<void>;
    createTimelineBranch: (messageId: string) => Promise<void>;
    recallUserMessage: (messageId: string) => Promise<void>;
};

let dependencies: ConversationActionsDependencies | null = null;
let deletingPersona = false;

const getDeps = () => {
    if (!dependencies) throw new Error('Conversation Actions dependencies are not initialized.');
    return dependencies;
};

const collectReferencedPhotoAssetIds = (excludingConversationKey?: string) => {
    const { memoryManager } = getDeps();
    return new Set(
        Object.entries(memoryManager.getAllChatHistories())
            .filter(([key]) => key !== excludingConversationKey)
            .flatMap(([, messages]) => messages
                .map(message => message.content.imageAssetId)
                .filter((assetId): assetId is string => Boolean(assetId))),
    );
};

const collectReferencedAttachmentAssetIds = (excludingConversationKey?: string) => {
    const { memoryManager } = getDeps();
    return new Set(
        Object.entries(memoryManager.getAllChatHistories())
            .filter(([key]) => key !== excludingConversationKey)
            .flatMap(([, messages]) => messages.flatMap(message => (
                message.content.attachments?.map(attachment => attachment.assetId) || []
            ))),
    );
};

const deleteCharacterPhotoAssetsForHistory = async (
    history: ChatMessage[],
    excludingConversationKey?: string,
) => {
    const deps = getDeps();
    const stillReferenced = collectReferencedPhotoAssetIds(excludingConversationKey);
    const assetIds = Array.from(new Set(history
        .map(message => message.content.imageAssetId)
        .filter((assetId): assetId is string => Boolean(assetId))));
    await Promise.all(assetIds.map(async assetId => {
        if (stillReferenced.has(assetId)) return;
        deps.releaseCharacterPhotoObjectUrl(assetId);
        await deleteCharacterPhotoAsset(assetId);
    }));
};

const deleteChatAttachmentAssetsForHistory = async (
    history: ChatMessage[],
    excludingConversationKey?: string,
) => {
    const deps = getDeps();
    const stillReferenced = collectReferencedAttachmentAssetIds(excludingConversationKey);
    const assetIds = Array.from(new Set(history.flatMap(message => (
        message.content.attachments?.map(attachment => attachment.assetId) || []
    ))));
    await Promise.all(assetIds.map(async assetId => {
        if (stillReferenced.has(assetId)) return;
        deps.releaseChatAttachmentObjectUrl(assetId);
        await deleteChatAttachment(assetId);
    }));
};


const deleteCustomPersona = async (key: string) => {
    if (deletingPersona || !key.startsWith('custom_')) return;
    const deps = getDeps();
    deletingPersona = true;
    try {
        deps.cancelRequestForConversation(key);
        const history = deps.memoryManager.getChatHistory(key);
        if (deps.getCurrentPersonaKey() === key) deps.abortCharacterPhotoRequest();
        await Promise.all([
            deleteCharacterPhotoAssetsForHistory(history, key),
            deleteChatAttachmentAssetsForHistory(history, key),
        ]);
        if (deps.memoryManager.deleteCustomPersona(key)) {
            deps.clearSessionMemories(key);
            deps.renderPersonaList();
        }
    } finally {
        deletingPersona = false;
    }
};

const deleteConversation = async (key: string, title: string, room?: ChatRoom) => {
    const deps = getDeps();
    const persona = room ? null : deps.memoryManager.getPersona(key);
    const isTimelineBranch = Boolean(room?.timelineBranch || persona?.timelineBranch);
    const prompt = isTimelineBranch
        ? `確定要刪除時間線「${title}」嗎？原本的對話不會受影響。此動作無法復原。`
        : room
            ? `確定要刪除群組「${title}」及其全部聊天記錄嗎？群組成員原本的一對一聊天不會受影響。此動作無法復原。`
            : `確定要刪除與「${title}」的聊天記錄嗎？角色人格、頭像、soul.md 與 memory.md 會保留。`;
    if (!confirm(prompt)) return;

    deps.cancelRequestForConversation(key);
    if (deps.getCurrentConversationKey() === key) deps.abortCharacterPhotoRequest();

    const history = deps.memoryManager.peekChatHistory(key);
    await Promise.all([
        deleteCharacterPhotoAssetsForHistory(history, key),
        deleteChatAttachmentAssetsForHistory(history, key),
    ]);
    deps.clearSessionMemories(key);

    if (room) {
        deps.memoryManager.deleteChatHistory(key);
        deps.roomManager.deleteRoom(key);
        if (deps.getCurrentConversationKey() === key) deps.showSelectionView('replace');
    } else if (isTimelineBranch && key.startsWith('custom_')) {
        deps.memoryManager.deleteCustomPersona(key);
        if (deps.getCurrentConversationKey() === key) deps.showSelectionView('replace');
    } else {
        deps.memoryManager.clearChatHistory(key);
        if (deps.getCurrentConversationKey() === key) deps.startChat(key, null, 'replace');
    }
    deps.renderPersonaList();
};

const clearCurrentChat = async () => {
    const deps = getDeps();
    const conversationKey = deps.getCurrentConversationKey();
    const currentPersona = deps.getCurrentPersona();
    if (!conversationKey || !currentPersona) return;

    const room = deps.getCurrentRoom();
    if (!confirm(`確定要清除 ${room?.title || currentPersona.name} 的對話記錄嗎？`)) return;

    deps.cancelRequestForConversation(conversationKey);
    deps.abortCharacterPhotoRequest();
    const history = deps.memoryManager.getChatHistory(conversationKey);
    await Promise.all([
        deleteCharacterPhotoAssetsForHistory(history, conversationKey),
        deleteChatAttachmentAssetsForHistory(history, conversationKey),
    ]);
    deps.memoryManager.clearChatHistory(conversationKey);
    deps.clearSessionMemories(conversationKey);
    deps.startChat(conversationKey);
};

const branchMemoryEntriesAt = <T extends { sourceMessageIds?: string[] }>(
    entries: T[] | undefined,
    includedMessageIds: Set<string>,
) => (entries || [])
    .filter(entry => !entry.sourceMessageIds?.length
        || entry.sourceMessageIds.every(messageId => includedMessageIds.has(messageId)))
    .map(entry => cloneRoomSnapshot(entry));

const formatTimelineBranchTitle = (sourceTitle: string, createdAt: number) => {
    const stamp = new Intl.DateTimeFormat('zh-HK', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(createdAt));
    return `${sourceTitle} · 分支 ${stamp}`;
};

const TIMELINE_BRANCH_HISTORY_LIMIT = 160;

const createTimelineBranch = async (messageId: string) => {
    const deps = getDeps();
    deps.closeMessageActions();

    const currentConversationKey = deps.getCurrentConversationKey();
    const currentPersona = deps.getCurrentPersona();
    if (!currentConversationKey || !currentPersona) return;

    if (deps.hasActiveChatRequest()) {
        alert('請先等待目前回覆完成，再建立時間線分支。');
        return;
    }

    const sourceConversationKey = currentConversationKey;
    const sourceRoom = deps.roomManager.getRoom(sourceConversationKey) || null;
    const sourcePersona = sourceRoom
        ? null
        : deps.memoryManager.getPersona(sourceConversationKey) || currentPersona;
    const history = deps.memoryManager.getChatHistory(sourceConversationKey);
    const branchPointIndex = history.findIndex(message => (
        message.id === messageId && message.role === 'user'
    ));
    if (branchPointIndex < 0) {
        alert('找不到這則訊息，可能已經被移除。');
        return;
    }

    const branchPoint = history[branchPointIndex];
    const branchPointText = branchPoint.content.text || '';
    const fullPrefix = history.slice(0, branchPointIndex);
    const prefix = cloneRoomSnapshot(fullPrefix.slice(-TIMELINE_BRANCH_HISTORY_LIMIT));
    const omittedMessageCount = Math.max(0, fullPrefix.length - prefix.length);
    const includedMessageIds = new Set(fullPrefix
        .map(message => message.id)
        .filter((id): id is string => Boolean(id)));
    const now = Date.now();
    const sourceTitle = sourceRoom?.title
        || sourcePersona?.conversationLabel
        || sourcePersona?.name
        || currentPersona.name;
    const branchTitle = formatTimelineBranchTitle(sourceTitle, now);
    const branchInfo = {
        sourceConversationKey,
        sourceMessageId: messageId,
        sourceTitle,
        createdAt: now,
        omittedMessageCount: omittedMessageCount || undefined,
    };
    const marker: ChatMessage = {
        id: crypto.randomUUID?.() || `branch-${now}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        role: 'system',
        content: {
            text: [
                `[時間線分支] 已從「${branchPointText.replace(/\s+/gu, ' ').trim().slice(0, 80) || '這則訊息'}」之前建立獨立分支；原對話保持不變。`,
                omittedMessageCount > 0
                    ? `為避免長對話重複佔用儲存空間，這裡顯示分支點前最近 ${prefix.length} 則訊息；更早內容仍在原對話，已整理的 soul.md 與 memory.md 亦已承接。`
                    : '',
            ].filter(Boolean).join('\n'),
        },
    };

    let branchConversationKey: string | null = null;
    let createdRoom = false;
    try {
        if (sourceRoom) {
            const roomCopy = cloneRoomSnapshot(sourceRoom);
            branchConversationKey = `room_branch_${now}_${Math.random().toString(36).slice(2, 9)}`;
            roomCopy.id = branchConversationKey;
            roomCopy.title = branchTitle;
            roomCopy.description = `由「${sourceTitle}」建立的獨立時間線`;
            roomCopy.timelineBranch = branchInfo;
            roomCopy.createdAt = now;
            roomCopy.updatedAt = now;
            roomCopy.lastSummarizedUserMessageCount = prefix.filter(message => message.role === 'user').length;
            roomCopy.scene = cloneRoomSnapshot(branchPoint.content.roomSceneBeforeTurn || sourceRoom.scene);
            const validMemberIds = new Set(roomCopy.members.map(member => member.id));
            roomCopy.scene.presentMemberIds = roomCopy.scene.presentMemberIds.filter(id => validMemberIds.has(id));
            if (!roomCopy.scene.presentMemberIds.length) roomCopy.scene.presentMemberIds = [roomCopy.leadMemberId];
            roomCopy.members.forEach(member => {
                member.soul = branchMemoryEntriesAt(member.soul, includedMessageIds);
                member.memories = branchMemoryEntriesAt(member.memories, includedMessageIds);
                member.persona.soul = branchMemoryEntriesAt(member.persona.soul, includedMessageIds);
                member.persona.memories = branchMemoryEntriesAt(member.persona.memories, includedMessageIds);
            });
            roomCopy.sharedSoul = branchMemoryEntriesAt(roomCopy.sharedSoul, includedMessageIds);
            roomCopy.sharedMemories = branchMemoryEntriesAt(roomCopy.sharedMemories, includedMessageIds);
            deps.roomManager.saveRoom(roomCopy);
            createdRoom = true;
        } else if (sourcePersona) {
            const personaCopy = cloneRoomSnapshot(sourcePersona);
            personaCopy.conversationLabel = branchTitle;
            personaCopy.timelineBranch = branchInfo;
            personaCopy.soul = branchMemoryEntriesAt(personaCopy.soul, includedMessageIds);
            personaCopy.memories = branchMemoryEntriesAt(personaCopy.memories, includedMessageIds);
            personaCopy.lastMemorySummaryUserMessageCount = prefix.filter(message => message.role === 'user').length;
            branchConversationKey = await deps.memoryManager.saveCustomPersonaCopy(personaCopy);
        }

        if (!branchConversationKey) throw new Error('無法建立分支對話。');
        deps.memoryManager.setChatHistory(branchConversationKey, [...prefix, marker], true);
        deps.renderPersonaList();
        deps.startChat(branchConversationKey, null, 'push');
        const draft = branchPoint.content.attachments?.length
            && branchPointText.trim() === '請查看附件。'
            ? ''
            : branchPointText;
        deps.restoreDraft(draft, 'branch');
    } catch (error) {
        if (branchConversationKey) {
            deps.memoryManager.deleteChatHistory(branchConversationKey);
            if (createdRoom) deps.roomManager.deleteRoom(branchConversationKey);
            else deps.memoryManager.deleteCustomPersona(branchConversationKey);
        }
        console.error('Unable to create timeline branch:', error);
        alert(error instanceof Error ? `建立時間線分支失敗：${error.message}` : '建立時間線分支失敗。');
    }
};

const recallUserMessage = async (messageId: string) => {
    const deps = getDeps();
    deps.closeMessageActions();

    const conversationKey = deps.getCurrentConversationKey();
    if (!conversationKey) return;

    const history = deps.memoryManager.getChatHistory(conversationKey);
    const startIndex = history.findIndex(message => (
        message.id === messageId && message.role === 'user'
    ));
    if (startIndex < 0) {
        alert('找不到這則訊息，可能已經被移除。');
        return;
    }

    let endIndex = startIndex + 1;
    while (endIndex < history.length && history[endIndex].role !== 'user') endIndex += 1;
    const turn = history.slice(startIndex, endIndex);
    const replyCount = turn.filter(message => message.role === 'model').length;
    const confirmed = confirm(replyCount > 0
        ? '收回這則訊息，並刪除這一回合的回覆及由此產生的記憶／場景變化？'
        : '收回這則訊息，並撤銷由此產生的記憶／場景變化？');
    if (!confirmed) return;

    deps.cancelRequestForConversation(conversationKey);
    deps.abortCharacterPhotoRequest();
    const result = deps.memoryManager.removeUserTurn(conversationKey, messageId);
    if (!result) {
        alert('收回失敗：找不到這則訊息，可能已經被移除。');
        return;
    }

    const removedSourceMessageIds = result.removed
        .map(message => message.id)
        .filter((id): id is string => Boolean(id));
    const remainingUserMessageCount = result.remaining.filter(message => message.role === 'user').length;
    deps.removeSessionMemoriesBySourceMessageIds(conversationKey, removedSourceMessageIds);

    const recalledMessage = result.removed[0];
    const sceneBeforeTurn = recalledMessage.content.roomSceneBeforeTurn;
    if (deps.roomManager.getRoom(conversationKey)) {
        deps.roomManager.removeMemoriesBySourceMessageIds(
            conversationKey,
            removedSourceMessageIds,
            remainingUserMessageCount,
            sceneBeforeTurn,
        );
    } else {
        deps.memoryManager.removePersonaMemoriesBySourceMessageIds(
            conversationKey,
            removedSourceMessageIds,
            remainingUserMessageCount,
        );
    }

    await Promise.all([
        deleteCharacterPhotoAssetsForHistory(result.removed).catch(error => {
            console.warn('Unable to remove recalled photo assets:', error);
        }),
        deleteChatAttachmentAssetsForHistory(result.removed).catch(error => {
            console.warn('Unable to remove recalled attachment assets:', error);
        }),
    ]);

    const recalledText = recalledMessage.content.attachments?.length
        && recalledMessage.content.text?.trim() === '請查看附件。'
        ? ''
        : recalledMessage.content.text || '';
    deps.startChat(conversationKey, null, 'skip');
    deps.restoreDraft(recalledText, 'recall');
    deps.renderPersonaList();
};

export const createConversationActions = (
    nextDependencies: ConversationActionsDependencies,
): ConversationActionsHandle => {
    dependencies = nextDependencies;
    return {
        deleteCustomPersona,
        deleteConversation,
        clearCurrentChat,
        createTimelineBranch,
        recallUserMessage,
    };
};
