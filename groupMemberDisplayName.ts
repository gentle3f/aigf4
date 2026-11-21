import type { Persona } from './managers.js';

export const GROUP_MEMBER_DISPLAY_NAME_LIMIT = 32;

/**
 * This is the short name used for a room's visible roster and dialogue labels,
 * not the canonical public identity, global persona, or stable member ID.
 * Refuse protocol delimiters so the group dialogue parser keeps working.
 */
export const normalizeGroupMemberDisplayName = (value: string): string | null => {
    const normalized = value.normalize('NFKC');
    if (/[<>\[\]{}：「」\u0000-\u001f\u007f]/u.test(normalized)) return null;
    const name = normalized.replace(/\s+/gu, ' ').trim();
    if (!name || Array.from(name).length > GROUP_MEMBER_DISPLAY_NAME_LIMIT) return null;
    return name;
};

export const isGroupMemberDisplayNameAvailable = (
    candidate: string,
    names: readonly string[],
) => !names.some(existing => existing.normalize('NFKC').toLocaleLowerCase()
    === candidate.normalize('NFKC').toLocaleLowerCase());

export const withGroupMemberDisplayName = (persona: Persona, name: string): Persona => ({
    ...persona,
    name,
    // Wikipedia information, including canonicalName, stays unchanged.
});
