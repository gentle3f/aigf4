import type { ChatMessage, WardrobeState } from './managers.js';

const MAX_OUTFIT_LENGTH = 360;
const KEEP_VALUES = new Set(['keep', 'unchanged', 'same', 'unknown', 'null']);

const compact = (value: unknown) => String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_OUTFIT_LENGTH);

export const emptyWardrobeState = (): WardrobeState => ({
    user: '',
    characters: {},
});

export const normalizeWardrobeState = (
    value: unknown,
    allowedCharacterKeys?: Iterable<string>,
): WardrobeState => {
    const candidate = value && typeof value === 'object'
        ? value as Partial<WardrobeState>
        : {};
    const allowed = allowedCharacterKeys ? new Set(allowedCharacterKeys) : null;
    const characters = Object.fromEntries(
        Object.entries(candidate.characters || {})
            .filter(([key, outfit]) => (!allowed || allowed.has(key)) && typeof outfit === 'string')
            .map(([key, outfit]) => [key, compact(outfit)])
            .filter(([, outfit]) => Boolean(outfit)),
    );
    return {
        user: compact(candidate.user),
        characters,
    };
};

const isKeepValue = (value: unknown) => {
    if (value == null) return true;
    const normalized = compact(value).toLocaleLowerCase();
    return !normalized || KEEP_VALUES.has(normalized);
};

export type WardrobeParticipant = {
    key: string;
    label: string;
};

export type WardrobeUpdate = {
    user?: unknown;
    characters?: Record<string, unknown>;
    members?: Array<{ member_id?: unknown; outfit?: unknown }>;
};

export const mergeWardrobeUpdate = (
    current: WardrobeState | undefined,
    update: WardrobeUpdate | null | undefined,
    participants: WardrobeParticipant[],
) => {
    const allowedKeys = participants.map(participant => participant.key);
    const next = normalizeWardrobeState(current, allowedKeys);
    if (!update || typeof update !== 'object') return next;

    if (!isKeepValue(update.user)) next.user = compact(update.user);

    const aliases = new Map<string, string>();
    participants.forEach(participant => {
        aliases.set(participant.key.toLocaleLowerCase(), participant.key);
        aliases.set(participant.label.toLocaleLowerCase(), participant.key);
    });
    const updates = [
        ...Object.entries(update.characters || {}).map(([key, outfit]) => ({ key, outfit })),
        ...(Array.isArray(update.members) ? update.members.map(item => ({
            key: compact(item?.member_id),
            outfit: item?.outfit,
        })) : []),
    ];
    updates.forEach(({ key, outfit }) => {
        const canonicalKey = aliases.get(compact(key).toLocaleLowerCase());
        if (!canonicalKey || isKeepValue(outfit)) return;
        next.characters[canonicalKey] = compact(outfit);
    });
    return next;
};

export const formatWardrobeLedger = (
    state: WardrobeState | undefined,
    participants: WardrobeParticipant[],
) => {
    const normalized = normalizeWardrobeState(state, participants.map(item => item.key));
    const lines = [
        `- User: ${normalized.user || 'not yet established'}`,
        ...participants.map(participant => (
            `- ${participant.label} (${participant.key}): ${normalized.characters[participant.key] || 'not yet established'}`
        )),
    ];
    return [
        'AUTHORITATIVE CURRENT WARDROBE LEDGER:',
        ...lines,
        'Wardrobe continuity rules:',
        '- A known outfit remains physically unchanged across every turn, even when it is not mentioned. Never replace a skirt with trousers, change colours, add layers, restore removed clothes, or invent accessories merely because time passed or wording varied.',
        '- The user has the same continuity as every character. Remember and naturally respect the user outfit whenever it matters.',
        '- Change an entry only when the newest turn visibly establishes a clothing action or an explicit new outfit. Movement, sitting, mood, intimacy, silence, a camera angle, or several chat turns are not clothing changes.',
        '- If an entry is not yet established, recover it only from a clear current-scene statement in recent history; otherwise leave it unknown rather than inventing clothes.',
    ].join('\n');
};

const parseJsonObject = (value: string) => {
    try {
        const unfenced = value.replace(/^\s*```(?:json)?\s*/iu, '').replace(/\s*```\s*$/iu, '').trim();
        const parsed = JSON.parse(unfenced) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as WardrobeUpdate
            : null;
    } catch {
        return null;
    }
};

export const extractWardrobeEnvelope = (
    rawText: string,
    current: WardrobeState | undefined,
    participants: WardrobeParticipant[],
) => {
    const matches = Array.from(rawText.matchAll(/<wardrobe>\s*([\s\S]*?)\s*<\/wardrobe>/giu));
    const update = matches.length ? parseJsonObject(matches.at(-1)![1]) : null;
    return {
        visibleText: rawText.replace(/<wardrobe>[\s\S]*?<\/wardrobe>/giu, '').trim(),
        wardrobe: mergeWardrobeUpdate(current, update, participants),
        hadValidUpdate: Boolean(update),
    };
};

export const getLatestWardrobeState = (
    history: ChatMessage[],
    allowedCharacterKeys: Iterable<string>,
) => {
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const message = history[index];
        if (message.role === 'system' && message.content.text?.trim() === '[SCENE END]') {
            return emptyWardrobeState();
        }
        if (message.content.wardrobeState) {
            return normalizeWardrobeState(message.content.wardrobeState, allowedCharacterKeys);
        }
    }
    return emptyWardrobeState();
};
