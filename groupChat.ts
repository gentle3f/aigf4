import { ChatMessage, ChatSegment, Content, Persona } from './managers.js';
import { ChatRoom, ROOM_PRESENT_MEMBER_LIMIT, RoomMember, RoomSceneMemberState, RoomSceneState } from './roomManager.js';
import { VeniceJsonSchemaResponseFormat } from './venice.js';
import { mergeWardrobeUpdate } from './wardrobe.js';

export interface GroupNpcCandidate {
    name: string;
    gender: 'male' | 'female';
    description: string;
    publicFigureQuery?: string;
}

interface GroupSceneMemberStatePayload {
    member_id?: string;
    posture?: string;
    action?: string;
    attention?: string;
    inner_thought?: string;
    chemistry?: string;
}

export interface GroupGenerationResult {
    text: string;
    segments: ChatSegment[];
    scene: RoomSceneState;
    npcCandidate?: GroupNpcCandidate;
}

const compact = (value: unknown, maxLength = 1600) => {
    const normalized = (value == null ? '' : String(value)).replace(/\s+/gu, ' ').trim();
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
};

export const LEGACY_GROUP_HISTORY_MESSAGE_LIMIT = 24;
export const LEGACY_GROUP_HISTORY_CHAR_BUDGET = 18_000;

export const selectLegacyGroupHistory = (
    history: ChatMessage[],
    messageLimit = LEGACY_GROUP_HISTORY_MESSAGE_LIMIT,
    charBudget = LEGACY_GROUP_HISTORY_CHAR_BUDGET,
) => {
    const conversational = history.filter(message => (
        (message.role === 'user' || message.role === 'model')
        && Boolean(message.content?.text?.trim())
    ));
    let lastCompletedIndex = -1;
    for (let index = conversational.length - 1; index >= 0; index -= 1) {
        if (conversational[index].role === 'model') {
            lastCompletedIndex = index;
            break;
        }
    }
    if (lastCompletedIndex < 0) return [];

    const selected: ChatMessage[] = [];
    let usedChars = 0;
    for (let index = lastCompletedIndex; index >= 0 && selected.length < messageLimit; index -= 1) {
        const message = conversational[index];
        const weight = (message.content.text || '').length + 24;
        if (selected.length >= 2 && usedChars + weight > charBudget) break;
        selected.push(message);
        usedChars += weight;
    }

    selected.reverse();
    while (selected[0]?.role !== 'user') selected.shift();
    while (selected.at(-1)?.role !== 'model') selected.pop();
    return selected;
};

export const trimTrailingUnansweredUserMessages = (history: ChatMessage[]) => {
    const completed = [...history];
    while (completed.at(-1)?.role === 'user') completed.pop();
    return completed;
};

/**
 * A room snapshot is stored when each user turn is sent. Assistant messages
 * inherit their preceding user turn's reality epoch. In texting, retain only
 * the contiguous known-epoch suffix; an incompatible or legacy user turn is a
 * hard boundary, never a reason to fall back to older raw dialogue.
 */
export const selectGroupHistorySinceCurrentRealityLayer = (
    history: ChatMessage[],
    realityLayer: RoomSceneState['realityLayer'],
    currentRealityEpochId?: string,
) => {
    if (realityLayer !== 'texting') return history;

    const latestUserSnapshot = [...history].reverse().find(message => message.role === 'user')
        ?.content.roomSceneBeforeTurn;
    const currentEpoch = latestUserSnapshot?.realityEpochId?.trim();
    if (!currentEpoch || (currentRealityEpochId && currentEpoch !== currentRealityEpochId)) return [];

    let currentLayerStart = history.length;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const message = history[index];
        if (message.role !== 'user') continue;
        const snapshot = message.content.roomSceneBeforeTurn;
        if (!snapshot || snapshot.realityEpochId !== currentEpoch) break;
        currentLayerStart = index;
    }
    return history.slice(currentLayerStart);
};

export const groupNarrationUsesFirstPerson = (result: GroupGenerationResult) => result.segments.some(segment => (
    segment.type === 'narration'
    && (segment.text.includes('我') || /(?:^|[^\p{L}\p{N}])(?:I|me|my|mine)(?:[^\p{L}\p{N}]|$)/iu.test(segment.text))
));

export const GROUP_RESPONSE_FORMAT: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'group_chat_turn',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['segments', 'scene', 'npc_candidate'],
            properties: {
                segments: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 14,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['type', 'speaker_id', 'text'],
                        properties: {
                            type: { type: 'string', enum: ['narration', 'dialogue'] },
                            speaker_id: { type: ['string', 'null'] },
                            text: { type: 'string', minLength: 1 },
                        },
                    },
                },
                scene: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['location', 'reality_layer', 'present_member_ids', 'summary', 'unresolved', 'wardrobe_updates', 'member_states'],
                    properties: {
                        location: { type: 'string' },
                        reality_layer: { type: 'string', enum: ['physical', 'texting', 'imagined'] },
                        present_member_ids: {
                            type: 'array',
                            maxItems: ROOM_PRESENT_MEMBER_LIMIT,
                            items: { type: 'string' },
                        },
                        summary: { type: 'string' },
                        unresolved: { type: 'array', maxItems: 6, items: { type: 'string' } },
                        wardrobe_updates: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['user', 'members'],
                            properties: {
                                user: { type: 'string' },
                                members: {
                                    type: 'array',
                                    maxItems: ROOM_PRESENT_MEMBER_LIMIT,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        required: ['member_id', 'outfit'],
                                        properties: {
                                            member_id: { type: 'string' },
                                            outfit: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                        member_states: {
                            type: 'array',
                            maxItems: ROOM_PRESENT_MEMBER_LIMIT,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['member_id', 'posture', 'action', 'attention', 'inner_thought', 'chemistry'],
                                properties: {
                                    member_id: { type: 'string' },
                                    posture: { type: 'string' },
                                    action: { type: 'string' },
                                    attention: { type: 'string' },
                                    inner_thought: { type: 'string' },
                                    chemistry: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                npc_candidate: {
                    anyOf: [
                        { type: 'null' },
                        {
                            type: 'object',
                            additionalProperties: false,
                            required: ['name', 'gender', 'description', 'public_figure_query'],
                            properties: {
                                name: { type: 'string' },
                                gender: { type: 'string', enum: ['female', 'male'] },
                                description: { type: 'string' },
                                public_figure_query: { type: ['string', 'null'] },
                            },
                        },
                    ],
                },
            },
        },
    },
};

const stripJsonFence = (value: string) => value
    .replace(/^\s*```(?:json)?\s*/iu, '')
    .replace(/\s*```\s*$/u, '')
    .trim();

const extractTaggedBlock = (value: string, tag: string) => {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return value.match(new RegExp(`<${escaped}>\\s*([\\s\\S]*?)\\s*</${escaped}>`, 'iu'))?.[1]?.trim() || '';
};

const memberName = (room: ChatRoom, memberId: string | undefined) => (
    room.members.find(member => member.id === memberId)?.persona.name || memberId || ''
);

const resolveMemberId = (room: ChatRoom, rawSpeaker: unknown) => {
    if (typeof rawSpeaker !== 'string') return '';
    const normalized = rawSpeaker
        .trim()
        .replace(/^[@#\[]|\]$/gu, '')
        .toLocaleLowerCase();
    if (!normalized) return '';

    const member = room.members.find(item => {
        const identityName = item.persona.publicIdentity?.canonicalName?.trim().toLocaleLowerCase();
        return item.id.toLocaleLowerCase() === normalized
            || item.persona.name.trim().toLocaleLowerCase() === normalized
            || identityName === normalized;
    });
    return member?.id || '';
};

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const stripGroupTransportResidue = (value: string) => {
    const transportBoundary = value.search(
        /<\/chat\b|<\/?scene\b|<\/?npc_candidate\b/iu,
    );
    const visible = transportBoundary >= 0 ? value.slice(0, transportBoundary) : value;
    return visible
        .replace(/<chat\b[^>]*>/giu, ' ')
        .replace(/\s{2,}/gu, ' ')
        .trim();
};

const cleanGroupSegmentText = (value: unknown) => stripGroupTransportResidue(compact(value, 2200))
    .replace(/^[：:\s]+/u, '')
    .trim();

const cleanNarrationText = (value: unknown) => {
    const text = cleanGroupSegmentText(value);
    return /^[（(][\s\S]*[）)]$/u.test(text)
        ? text.slice(1, -1).trim()
        : text;
};

const splitKnownSpeakerLabels = (
    rawText: string,
    room: ChatRoom,
    fallbackMemberId?: string,
    fallbackType: ChatSegment['type'] = 'dialogue',
    enforcePresence = false,
): ChatSegment[] | null => {
    const labels = Array.from(new Set(room.members.flatMap(member => [
        member.id,
        member.persona.name,
        member.persona.publicIdentity?.canonicalName,
    ]).filter((value): value is string => Boolean(value?.trim()))))
        .sort((left, right) => right.length - left.length)
        .map(escapePattern);
    if (!labels.length) return null;

    const alternatives = labels.join('|');
    const labelPattern = new RegExp(
        `(^|[\\s。！？!?；;）)」』])(?:\\[\\s*(${alternatives}|旁白|narration)\\s*\\]\\s*[：:]?|(${alternatives}|旁白|narration)\\s*[：:])\\s*`,
        'giu',
    );
    const matches = Array.from(rawText.matchAll(labelPattern)).map(match => ({
        start: (match.index || 0) + (match[1]?.length || 0),
        end: (match.index || 0) + match[0].length,
        label: (match[2] || match[3] || '').trim(),
    }));
    if (!matches.length) return null;

    const allowedMemberIds = enforcePresence
        ? new Set(room.scene.presentMemberIds)
        : new Set(room.members.map(member => member.id));
    const result: ChatSegment[] = [];
    const append = (label: string | null, value: string, type: ChatSegment['type']) => {
        const isNarration = type === 'narration' || /^(?:旁白|narration)$/iu.test(label || '');
        const text = isNarration ? cleanNarrationText(value) : cleanGroupSegmentText(value);
        if (!text) return;
        if (isNarration) {
            result.push({ type: 'narration', text });
            return;
        }

        const speakerId = resolveMemberId(room, label || fallbackMemberId);
        if (!speakerId || !allowedMemberIds.has(speakerId)) return;
        result.push({
            type: 'dialogue',
            speakerId,
            speakerName: memberName(room, speakerId),
            text,
        });
    };

    const prefix = rawText.slice(0, matches[0].start);
    if (prefix.trim()) {
        const prefixIsNarration = fallbackType === 'narration' || /^[（(][\s\S]*[）)]\s*$/u.test(prefix.trim());
        append(null, prefix, prefixIsNarration ? 'narration' : 'dialogue');
    }

    matches.forEach((match, index) => {
        const end = matches[index + 1]?.start ?? rawText.length;
        const type = /^(?:旁白|narration)$/iu.test(match.label) ? 'narration' : 'dialogue';
        append(match.label, rawText.slice(match.end, end), type);
    });
    return result;
};

export const normalizeGroupSegments = (
    segments: ChatSegment[],
    room: ChatRoom,
    enforcePresence = false,
): ChatSegment[] => {
    const allowedMemberIds = enforcePresence
        ? new Set(room.scene.presentMemberIds)
        : new Set(room.members.map(member => member.id));

    return segments.flatMap(segment => {
        const fallbackMemberId = segment.type === 'dialogue'
            ? resolveMemberId(room, segment.speakerId || segment.speakerName)
            : undefined;
        const split = splitKnownSpeakerLabels(
            segment.text,
            room,
            fallbackMemberId,
            segment.type,
            enforcePresence,
        );
        if (split) return split;

        if (segment.type === 'narration') {
            const text = cleanNarrationText(segment.text);
            return text ? [{ type: 'narration' as const, text }] : [];
        }
        if (!fallbackMemberId || !allowedMemberIds.has(fallbackMemberId)) return [];
        const text = cleanGroupSegmentText(segment.text);
        return text ? [{
            type: 'dialogue' as const,
            speakerId: fallbackMemberId,
            speakerName: memberName(room, fallbackMemberId),
            text,
        }] : [];
    });
};

const parseJsonObject = (rawText: string): Record<string, unknown> | null => {
    const stripped = stripJsonFence(rawText);
    try {
        const value = JSON.parse(stripped) as unknown;
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : null;
    } catch {
        const start = stripped.indexOf('{');
        const end = stripped.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            const value = JSON.parse(stripped.slice(start, end + 1)) as unknown;
            return value && typeof value === 'object' && !Array.isArray(value)
                ? value as Record<string, unknown>
                : null;
        } catch {
            return null;
        }
    }
};

const parsePlainGroupSegments = (
    rawText: string,
    room: ChatRoom,
    fallbackMemberId?: string,
): ChatSegment[] => {
    const presentIds = new Set(room.scene.presentMemberIds);
    const segments: ChatSegment[] = [];
    const labelPattern = /^\s*(?:\[([^\]]+)\]|([^：:\n]{1,48}))\s*[：:]\s*(.+)$/u;

    rawText.split(/\n+/u).forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) return;
        const label = line.match(labelPattern);
        if (label) {
            const speakerId = resolveMemberId(room, label[1] || label[2]);
            const text = compact(label[3], 2200);
            if (speakerId && presentIds.has(speakerId) && text) {
                segments.push({
                    type: 'dialogue',
                    speakerId,
                    speakerName: memberName(room, speakerId),
                    text,
                });
                return;
            }
        }

        if (/^[（(].+[）)]$/u.test(line)) {
            segments.push({ type: 'narration', text: compact(line.replace(/^[（(]|[）)]$/gu, ''), 2200) });
        }
    });

    if (segments.some(segment => segment.type === 'dialogue')) {
        return normalizeGroupSegments(segments, room, true);
    }

    const labelledSegments = splitKnownSpeakerLabels(
        rawText,
        room,
        fallbackMemberId,
        'dialogue',
        true,
    );
    if (labelledSegments?.some(segment => segment.type === 'dialogue')) {
        return labelledSegments;
    }

    const resolvedFallback = resolveMemberId(room, fallbackMemberId)
        || room.scene.presentMemberIds.find(id => id === room.leadMemberId)
        || room.scene.presentMemberIds[0];
    const text = compact(cleanFallbackText(rawText), 2200);
    if (!resolvedFallback || !presentIds.has(resolvedFallback) || !text) return [];
    return [{
        type: 'dialogue',
        speakerId: resolvedFallback,
        speakerName: memberName(room, resolvedFallback),
        text,
    }];
};

const stripGroupTransportEnvelope = (value: string) => value
    .replace(/<chat>[\s\S]*?<\/chat>/giu, ' ')
    .replace(/<scene>[\s\S]*?<\/scene>/giu, ' ')
    .replace(/<npc_candidate>[\s\S]*?<\/npc_candidate>/giu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();

const cleanFallbackText = (value: string) => {
    const text = stripJsonFence(value)
        .replace(/^\s*(?:assistant|response|reply)\s*[：:]\s*/iu, '')
        .trim();
    return /^(?:\{|\[)/u.test(text) ? '' : text;
};

export const getGroupDisplaySegments = (
    content: Content,
    room: ChatRoom,
    fallbackMemberId?: string,
): ChatSegment[] => {
    if (content.segments?.length) {
        return normalizeGroupSegments(content.segments, room);
    }

    const rawText = content.text?.trim() || '';
    if (!rawText) return [];
    // Repair legacy failed turns containing the whole transport envelope before rendering.
    if (/<chat>[\s\S]*<\/chat>/iu.test(rawText)) {
        try {
            return parseGroupGeneration(rawText, room, fallbackMemberId).segments;
        } catch {
            const chatOnly = extractTaggedBlock(rawText, 'chat');
            if (chatOnly) return parsePlainGroupSegments(chatOnly, room, fallbackMemberId);
        }
    }
    const labelledSegments = splitKnownSpeakerLabels(rawText, room, fallbackMemberId);
    if (labelledSegments?.length) return labelledSegments;

    const speakerId = resolveMemberId(room, fallbackMemberId)
        || room.members.find(member => member.id === room.leadMemberId)?.id
        || room.members[0]?.id;
    const text = cleanGroupSegmentText(cleanFallbackText(rawText));
    return speakerId && text ? [{
        type: 'dialogue',
        speakerId,
        speakerName: memberName(room, speakerId),
        text,
    }] : [];
};

const composeText = (segments: ChatSegment[]) => segments.map(segment => {
    if (segment.type === 'narration') {
        return /^[（(][\s\S]*[）)]$/u.test(segment.text)
            ? segment.text
            : `（${segment.text}）`;
    }
    const speaker = segment.speakerName || segment.speakerId;
    return /^[「『“"]/u.test(segment.text)
        ? `${speaker}：${segment.text}`
        : `${speaker}：「${segment.text}」`;
}).join('\n\n');

const mergeSceneMemberStates = (
    room: ChatRoom,
    rawStates: GroupSceneMemberStatePayload[] | undefined,
    activeMemberIds: string[] = room.scene.presentMemberIds,
): Record<string, RoomSceneMemberState> => {
    const next: Record<string, RoomSceneMemberState> = { ...(room.scene.memberStates || {}) };
    if (!Array.isArray(rawStates)) return next;
    const activeIds = new Set(activeMemberIds);

    rawStates.forEach(raw => {
        const memberId = resolveMemberId(room, raw.member_id);
        if (!memberId || !activeIds.has(memberId)) return;
        const previous = next[memberId];
        next[memberId] = {
            posture: compact(raw.posture, 160) || previous?.posture || '',
            action: compact(raw.action, 220) || previous?.action || '',
            attention: compact(raw.attention, 160) || previous?.attention || '',
            innerThought: compact(raw.inner_thought, 260) || previous?.innerThought || '',
            chemistry: compact(raw.chemistry, 220) || previous?.chemistry || '',
        };
    });

    return next;
};

export const parseGroupGeneration = (
    rawText: string,
    room: ChatRoom,
    fallbackMemberId?: string,
): GroupGenerationResult => {
    const parsedCandidate = parseJsonObject(rawText) as ({
        segments?: Array<{
            type?: string;
            speaker_id?: string | null;
            sender_id?: string | null;
            speaker?: string | null;
            name?: string | null;
            text?: string;
            content?: string;
            message?: string;
        }>;
        messages?: Array<{
            type?: string;
            speaker_id?: string | null;
            sender_id?: string | null;
            speaker?: string | null;
            name?: string | null;
            text?: string;
            content?: string;
            message?: string;
        }>;
        scene?: {
            location?: string;
            reality_layer?: string;
            present_member_ids?: string[];
            summary?: string;
            unresolved?: string[];
            wardrobe_updates?: {
                user?: string;
                members?: Array<{ member_id?: string; outfit?: string }>;
            };
            member_states?: GroupSceneMemberStatePayload[];
        };
        npc_candidate?: {
            name?: string;
            gender?: 'female' | 'male';
            description?: string;
            public_figure_query?: string | null;
        } | null;
    } | null);
    const parsed = parsedCandidate && (
        Array.isArray(parsedCandidate.segments)
        || Array.isArray(parsedCandidate.messages)
        || Boolean(parsedCandidate.scene)
        || Object.prototype.hasOwnProperty.call(parsedCandidate, 'npc_candidate')
    ) ? parsedCandidate : null;
    const taggedChat = extractTaggedBlock(rawText, 'chat');
    const taggedScene = parseJsonObject(extractTaggedBlock(rawText, 'scene')) as ({
        location?: string;
        reality_layer?: string;
        present_member_ids?: string[];
        summary?: string;
        unresolved?: string[];
        wardrobe_updates?: {
            user?: string;
            members?: Array<{ member_id?: string; outfit?: string }>;
        };
        member_states?: GroupSceneMemberStatePayload[];
    } | null);
    const taggedNpcText = extractTaggedBlock(rawText, 'npc_candidate');
    const taggedNpc = /^(?:null|none)$/iu.test(taggedNpcText)
        ? null
        : parseJsonObject(taggedNpcText) as ({
            name?: string;
            gender?: 'female' | 'male';
            description?: string;
            public_figure_query?: string | null;
        } | null);
    const knownIds = new Set(room.members.map(member => member.id));
    const presentIds = new Set(room.scene.presentMemberIds);
    const rawSegments = Array.isArray(parsed?.segments)
        ? parsed.segments
        : Array.isArray(parsed?.messages) ? parsed.messages : [];
    const segments = normalizeGroupSegments(rawSegments.reduce<ChatSegment[]>((result, segment) => {
        if (!segment || typeof segment !== 'object') return result;
        const text = compact(segment.text || segment.content || segment.message, 2200);
        if (!text) return result;
        const rawSpeaker = segment.speaker_id ?? segment.sender_id ?? segment.speaker ?? segment.name;
        if (segment.type === 'narration' || rawSpeaker === null) {
            result.push({ type: 'narration', text });
            return result;
        }
        const speakerId = resolveMemberId(room, rawSpeaker);
        if (!knownIds.has(speakerId) || !presentIds.has(speakerId)) return result;
        result.push({
            type: 'dialogue',
            speakerId,
            speakerName: memberName(room, speakerId),
            text,
        });
        return result;
    }, []), room, true);
    if (!segments.some(segment => segment.type === 'dialogue')) {
        segments.splice(
            0,
            segments.length,
            ...parsePlainGroupSegments(
                taggedChat || stripGroupTransportEnvelope(rawText),
                room,
                fallbackMemberId,
            ),
        );
    }
    if (!segments.some(segment => segment.type === 'dialogue')) {
        throw new Error('Group reply did not contain valid member dialogue.');
    }

    const sceneData = parsed?.scene || taggedScene;
    const requestedMemberIds = Array.isArray(sceneData?.present_member_ids)
        ? sceneData.present_member_ids
        : room.scene.presentMemberIds;
    const requestedIds = requestedMemberIds
        .filter(id => knownIds.has(id))
        .slice(0, ROOM_PRESENT_MEMBER_LIMIT);
    const unresolved = Array.isArray(sceneData?.unresolved)
        ? sceneData.unresolved
        : Array.isArray(room.scene.unresolved) ? room.scene.unresolved : [];
    const wardrobe = mergeWardrobeUpdate(
        room.scene.wardrobe,
        sceneData?.wardrobe_updates,
        room.members.map(member => ({ key: member.id, label: member.persona.name })),
    );
    const memberStates = mergeSceneMemberStates(
        room,
        sceneData?.member_states,
        requestedIds.length > 0 ? requestedIds : room.scene.presentMemberIds,
    );
    const scene: RoomSceneState = {
        ...room.scene,
        location: compact(sceneData?.location, 240) || room.scene.location,
        realityLayer: ['physical', 'texting', 'imagined'].includes(sceneData?.reality_layer || '')
            ? sceneData!.reality_layer as RoomSceneState['realityLayer']
            : room.scene.realityLayer,
        presentMemberIds: requestedIds.length > 0 ? requestedIds : room.scene.presentMemberIds,
        summary: compact(sceneData?.summary, 1200) || room.scene.summary,
        unresolved: unresolved.map(item => compact(item, 240)).filter(Boolean).slice(0, 6),
        wardrobe,
        memberStates,
    };
    const npc = parsed?.npc_candidate || taggedNpc;

    return {
        text: composeText(segments),
        segments,
        scene,
        npcCandidate: npc?.name && npc.description ? {
            name: compact(npc.name, 80),
            gender: npc.gender === 'male' ? 'male' : 'female',
            description: compact(npc.description, 700),
            publicFigureQuery: compact(npc.public_figure_query || undefined, 160) || undefined,
        } : undefined,
    };
};

export const contentToGroupHistoryText = (content: Content, room: ChatRoom) => {
    const segments = content.segments?.length
        ? normalizeGroupSegments(content.segments, room)
        : getGroupDisplaySegments(content, room);
    if (segments.length === 0) return '';
    return segments.map(segment => {
        if (segment.type === 'narration') return `[旁白] ${segment.text}`;
        return `[${segment.speakerName || memberName(room, segment.speakerId)}] ${segment.text}`;
    }).join('\n');
};

export const resolveRoomMemberPersona = (room: ChatRoom, memberId?: string): Persona | null => {
    const member = room.members.find(item => item.id === memberId)
        || room.members.find(item => item.id === room.leadMemberId)
        || room.members[0];
    return member?.persona || null;
};
