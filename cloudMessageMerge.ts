import type { ChatMessage } from './managers.js';

export type ChatHistoryMap = Record<string, ChatMessage[]>;

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

export const mergeChatHistoryMaps = (
    localHistories: ChatHistoryMap,
    cloudHistories: ChatHistoryMap,
): ChatHistoryMap => {
    const merged: ChatHistoryMap = {};
    const conversationKeys = new Set([
        ...Object.keys(cloudHistories),
        ...Object.keys(localHistories),
    ]);

    conversationKeys.forEach(conversationKey => {
        const candidates = [
            ...(localHistories[conversationKey] || []),
            ...(cloudHistories[conversationKey] || []),
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
