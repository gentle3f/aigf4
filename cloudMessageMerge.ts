import type { ChatMessage } from './managers.js';

export type ChatHistoryMap = Record<string, ChatMessage[]>;

export interface CloudHistoryMergeHints {
    previousMessageIndex?: Record<string, string>;
    previousConversationIndex?: Record<string, string>;
}

const clone = <T>(value: T): T => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

const messageSignature = (message: ChatMessage) => JSON.stringify({
    role: message.role,
    speakerId: message.speakerId || '',
    createdAt: Number(message.createdAt || 0),
    content: message.content || {},
});

const messageIndexKey = (conversationKey: string, messageId: string) => (
    `${conversationKey}\u0000${messageId}`
);

export const findLocallyDeletedIndexedKeys = (
    previousIndex: Record<string, string>,
    currentKeys: Iterable<string>,
) => {
    const current = new Set(currentKeys);
    return new Set(Object.keys(previousIndex).filter(key => !current.has(key)));
};

export const mergeChatHistoryMaps = (
    localHistories: ChatHistoryMap,
    cloudHistories: ChatHistoryMap,
    hints: CloudHistoryMergeHints = {},
): ChatHistoryMap => {
    const currentConversationKeys = new Set(Object.keys(localHistories));
    const deletedConversations = findLocallyDeletedIndexedKeys(
        hints.previousConversationIndex || {},
        currentConversationKeys,
    );
    const currentMessageKeys = Object.entries(localHistories).flatMap(([conversationKey, history]) => (
        history.flatMap(message => {
            const id = message.id?.trim();
            return id ? [messageIndexKey(conversationKey, id)] : [];
        })
    ));
    const deletedMessages = findLocallyDeletedIndexedKeys(
        hints.previousMessageIndex || {},
        currentMessageKeys,
    );

    const merged: ChatHistoryMap = {};
    const conversationKeys = new Set([
        ...Object.keys(cloudHistories),
        ...Object.keys(localHistories),
    ]);

    conversationKeys.forEach(conversationKey => {
        if (deletedConversations.has(conversationKey) && !localHistories[conversationKey]) return;

        const cloudCandidates = (cloudHistories[conversationKey] || []).filter(message => {
            const id = message.id?.trim();
            return !id || !deletedMessages.has(messageIndexKey(conversationKey, id));
        });
        const candidates = [
            ...(localHistories[conversationKey] || []),
            ...cloudCandidates,
        ];
        const messageIds = new Set<string>();
        const signatures = new Set<string>();
        const unique = candidates.flatMap((message, sourceIndex) => {
            const id = message.id?.trim() || '';
            const signature = messageSignature(message);
            if ((id && messageIds.has(id)) || signatures.has(signature)) return [];
            if (id) messageIds.add(id);
            signatures.add(signature);
            return [{ message: clone(message), sourceIndex }];
        });
        unique.sort((left, right) => {
            const timeDifference = Number(left.message.createdAt || 0) - Number(right.message.createdAt || 0);
            return timeDifference || left.sourceIndex - right.sourceIndex;
        });
        merged[conversationKey] = unique.map(item => item.message);
    });

    return merged;
};


export const filterRemoteStateEntities = <
    TPersona,
    TRoom extends { id: string },
>(
    remoteCustomPersonas: Record<string, TPersona>,
    remoteRooms: TRoom[],
    options: {
        locallyDeletedStateEntities?: Set<string>;
        locallyDeletedConversations?: Set<string>;
        localPersonas?: Record<string, unknown>;
        deletedRoomIds?: Set<string>;
    } = {},
) => {
    const locallyDeletedStateEntities = options.locallyDeletedStateEntities || new Set<string>();
    const locallyDeletedConversations = options.locallyDeletedConversations || new Set<string>();
    const localPersonas = options.localPersonas || {};
    const deletedRoomIds = options.deletedRoomIds || new Set<string>();

    const customPersonas = Object.fromEntries(
        Object.entries(remoteCustomPersonas).filter(([key]) => {
            if (locallyDeletedStateEntities.has(`persona:${key}`)) return false;
            const deletedByConversationIndex = locallyDeletedConversations.has(key)
                && key.startsWith('custom_')
                && !localPersonas[key];
            return !deletedByConversationIndex;
        }),
    ) as Record<string, TPersona>;

    const rooms = remoteRooms.filter(room => (
        !deletedRoomIds.has(room.id)
        && !locallyDeletedStateEntities.has(`room:${room.id}`)
    ));

    return { customPersonas, rooms };
};
