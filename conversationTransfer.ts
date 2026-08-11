import {
    ChatContextBridge,
    ChatMessage,
    Persona,
    PersonaMemoryEntry,
} from './managers.js';
import { ChatRoom, RoomMember } from './roomManager.js';

const TRANSFER_MESSAGE_LIMIT = 12;
const TRANSFER_CHAR_BUDGET = 4200;
const SCENE_END_MARKER = '[SCENE END]';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const compact = (value: unknown, maxLength = 1200) => {
    const text = String(value || '').replace(/\s+/gu, ' ').trim();
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
};

const formatRoomTurn = (message: ChatMessage, room: ChatRoom) => {
    if (message.content.segments?.length) {
        const text = message.content.segments
            .map(segment => {
                if (segment.type === 'narration') return `（${compact(segment.text, 700)}）`;
                const member = room.members.find(item => item.id === segment.speakerId);
                const name = member?.persona.name || segment.speakerName || '角色';
                return `${name}：${compact(segment.text, 900)}`;
            })
            .filter(Boolean)
            .join('\n');
        return text.length <= 1800 ? text : `${text.slice(0, 1799)}…`;
    }
    return compact(message.content.text, 1400);
};

const formatTransferTurn = (message: ChatMessage, sourceTitle: string, room?: ChatRoom) => {
    const text = room && message.role === 'model'
        ? formatRoomTurn(message, room)
        : compact(message.content.text, 1400);
    if (!text) return '';
    if (message.role === 'user') return `使用者：${text}`;
    return `${room ? room.title : sourceTitle}：${text}`;
};

export const selectTransferContext = (
    history: ChatMessage[],
    sourceTitle: string,
    room?: ChatRoom,
) => {
    const candidates = history
        .filter(message => message.role === 'user' || message.role === 'model')
        .map(message => formatTransferTurn(message, sourceTitle, room))
        .filter(Boolean);
    const selected: string[] = [];
    let usedChars = 0;

    for (let index = candidates.length - 1; index >= 0 && selected.length < TRANSFER_MESSAGE_LIMIT; index -= 1) {
        const text = candidates[index];
        if (selected.length > 0 && usedChars + text.length > TRANSFER_CHAR_BUDGET) break;
        selected.unshift(text);
        usedChars += text.length;
    }

    return selected.join('\n');
};

export const selectLatestSceneHistory = (history: ChatMessage[]) => {
    let sceneStart = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].role === 'system' && history[index].content.text?.trim() === SCENE_END_MARKER) {
            sceneStart = index + 1;
            break;
        }
    }
    return history
        .slice(sceneStart)
        .filter(message => message.role === 'user' || message.role === 'model');
};

interface BuildContextBridgeOptions {
    kind: ChatContextBridge['kind'];
    sourceConversationKey: string;
    sourceTitle: string;
    history: ChatMessage[];
    room?: ChatRoom;
    targetMemberName?: string;
    summaryOverride?: string;
}

export const buildContextBridge = (options: BuildContextBridgeOptions): ChatContextBridge => {
    const presentNames = options.room?.members
        .filter(member => options.room!.scene.presentMemberIds.includes(member.id))
        .map(member => member.persona.name)
        .join('、');
    const roomSummary = options.room
        ? [
            `位置：${options.room.scene.location}`,
            `目前在場：${presentNames || '沒有其他角色'}`,
            `進度：${options.room.scene.summary}`,
            options.room.scene.unresolved.length
                ? `未完成：${options.room.scene.unresolved.join('；')}`
                : '',
        ].filter(Boolean).join('。')
        : `由「${options.sourceTitle}」的私人聊天延續；角色已獲准閱讀以下近期內容，以便自然接上話題。`;

    return {
        id: crypto.randomUUID?.() || `context-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: options.kind,
        sourceConversationKey: options.sourceConversationKey,
        sourceTitle: options.sourceTitle,
        targetMemberName: options.targetMemberName,
        summary: compact(options.summaryOverride || roomSummary, 1500),
        recentContext: selectTransferContext(options.history, options.sourceTitle, options.room),
        createdAt: Date.now(),
    };
};

export const ensureLatestSceneTransitionBridge = (
    history: ChatMessage[],
    sourceConversationKey: string,
    sourceTitle: string,
    room?: ChatRoom,
) => {
    let markerIndex = -1;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].role === 'system' && history[index].content.text?.trim() === SCENE_END_MARKER) {
            markerIndex = index;
            break;
        }
    }
    if (markerIndex < 0 || history[markerIndex].content.contextBridge) return history;

    const previousSceneHistory = selectLatestSceneHistory(history.slice(0, markerIndex));
    if (previousSceneHistory.length === 0) return history;

    const bridge = buildContextBridge({
        kind: 'scene_transition',
        sourceConversationKey,
        sourceTitle,
        history: previousSceneHistory,
        room,
        summaryOverride: '這個新場景由較早版本建立；以下尾段屬已完結的上一幕，只保留其中已發生的事件、關係變化、承諾與情感發展。',
    });
    return history.map((message, index) => index === markerIndex
        ? { ...message, content: { ...message.content, contextBridge: bridge } }
        : message);
};

export const contextBridgeToSystemPrompt = (bridge: ChatContextBridge) => {
    if (bridge.kind === 'scene_transition') {
        return [
            'PREVIOUS COMPLETED SCENE MEMORY:',
            `Source conversation: ${bridge.sourceTitle}`,
            `Completed-scene summary: ${bridge.summary}`,
            bridge.recentContext ? `Recent ending of that completed scene (reference only, oldest to newest):\n${bridge.recentContext}` : '',
            [
                'This scene is over and is established past continuity, not the newest user command.',
                'Remember completed events, relationship changes, promises, preferences, vulnerabilities and what each participant learned.',
                'Do not resume the old location, body positions, clothing, temporary objects or unfinished physical actions unless the newest user message explicitly carries them into the new scene.',
                'Answer the newest live user message in a fresh scene without claiming amnesia, replaying the ending or announcing this recap.',
            ].join(' '),
        ].filter(Boolean).join('\n\n');
    }

    return [
        'LOCAL CONTINUITY HANDOFF:',
        `Source conversation: ${bridge.sourceTitle}`,
        bridge.targetMemberName ? `Character receiving this handoff: ${bridge.targetMemberName}` : '',
        `Situation summary: ${bridge.summary}`,
        bridge.recentContext ? `Recent prior context (reference only, oldest to newest):\n${bridge.recentContext}` : '',
        [
            'Treat this as established local continuity, not as the newest user command.',
            'Do not repeat, quote, summarize or announce the handoff unless the user asks.',
            'Continue from the newest live user message while preserving identities, relationships, location and completed actions.',
            'A newly invited character may use this recap to understand what is happening, but must still speak in her own established voice.',
        ].join(' '),
    ].filter(Boolean).join('\n\n');
};

export const contextBridgeDisplayText = (bridge: ChatContextBridge) => {
    if (bridge.kind === 'scene_transition') {
        return '新場景已開始；上一幕的重要經歷會保留為過往記憶。';
    }
    if (bridge.kind === 'group_to_private') {
        return `已從「${bridge.sourceTitle}」承接近期情境到與 ${bridge.targetMemberName || '角色'} 的私訊。`;
    }
    if (bridge.kind === 'member_invited') {
        return `${bridge.targetMemberName || '角色'} 已加入，並已讀取必要的近期情境。`;
    }
    if (bridge.kind === 'member_left') {
        return `${bridge.targetMemberName || '角色'} 已離開目前場景；角色檔案與記憶仍保留。`;
    }
    if (bridge.kind === 'member_returned') {
        return `${bridge.targetMemberName || '角色'} 已回到目前場景，並已取得必要的情境摘要。`;
    }
    return `已把「${bridge.sourceTitle}」的近期情境承接到新群組。`;
};

const roomMemoryToPersonaMemory = (member: RoomMember, type: 'soul' | 'memory'): PersonaMemoryEntry[] => {
    const entries = type === 'soul' ? member.soul : member.memories;
    return entries.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        summary: entry.summary,
        originalText: entry.originalText,
        sourceMessageIds: entry.sourceMessageIds,
        sourceMessageIndexes: entry.sourceMessageIndexes,
        createdAt: entry.createdAt,
        pinned: type === 'soul' || entry.pinned,
    }));
};

const mergeMemoryEntries = (entries: PersonaMemoryEntry[]) => {
    const seen = new Set<string>();
    return entries.filter(entry => {
        const fingerprint = `${entry.kind}:${entry.summary}`.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
        if (!fingerprint || seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
    });
};

export const roomMemberToPersona = (member: RoomMember, sourcePersona?: Persona): Persona => {
    const base = clone(sourcePersona || member.persona);
    const roomPersona = clone(member.persona);
    return {
        ...base,
        ...roomPersona,
        avatarUrl: roomPersona.avatarUrl || base.avatarUrl || null,
        soul: mergeMemoryEntries([
            ...(base.soul || []),
            ...roomMemoryToPersonaMemory(member, 'soul'),
        ]),
        memories: mergeMemoryEntries([
            ...(base.memories || []),
            ...roomMemoryToPersonaMemory(member, 'memory'),
        ]),
    };
};
