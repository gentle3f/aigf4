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

/** First login has no trustworthy deletion baseline: preserve IDs and order, never infer deletions. */
export const mergeBootstrapHistoryMaps = (local: ChatHistoryMap, remote: ChatHistoryMap): ChatHistoryMap => {
    const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))) : x);
    const signature = (m: ChatMessage) => { const content = clone(m.content || {}); if(content.imageUrl?.startsWith('blob:') || content.imageUrl?.startsWith('data:')) delete content.imageUrl; return canonical({role:m.role,speakerId:m.speakerId||'',createdAt:Number(m.createdAt||0),content}); };
    const out: ChatHistoryMap = Object.create(null);
    for(const key of new Set([...Object.keys(remote),...Object.keys(local)])) {
        const a=local[key]||[], b=remote[key]||[];
        for(const rows of [a,b]) if(rows.some(m=>!m.id)||new Set(rows.map(m=>m.id)).size!==rows.length) throw Error('ATOMIC_BOOTSTRAP_INVALID_HISTORY');
        const n=Math.min(a.length,b.length);
        for(let i=0;i<n;i++) if(a[i].id!==b[i].id || signature(a[i])!==signature(b[i])) {
            const safeKey=key.replace(/[^a-zA-Z0-9_-]/gu,'_').slice(0,180);
            throw Error(`ATOMIC_BOOTSTRAP_HISTORY_CONFLICT [${safeKey}; local=${a.length}; cloud=${b.length}; position=${i+1}; reason=${a[i].id!==b[i].id?'ID':'CONTENT'}]：本機與雲端對話有分歧，兩邊均保留。`);
        }
        out[key]=clone(a.length>=b.length?a:b);
    }
    return out;
};
