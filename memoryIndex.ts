export type MemoryIndexKind =
    | 'core'
    | 'relationship'
    | 'vulnerability'
    | 'promise'
    | 'preference'
    | 'event'
    | 'boundary';

const GENERIC_TAGS = new Set([
    'memory', 'remember', 'thing', 'things', 'event', 'events', 'user', 'character',
    '記憶', '事情', '事件', '角色', '使用者', '用戶', '對話', '聊天', '這次', '今次',
]);

const KIND_ALIASES: Record<MemoryIndexKind, string[]> = {
    core: ['core', 'identity', '身份', '核心'],
    relationship: ['relationship', 'relationship change', '關係', '感情'],
    vulnerability: ['vulnerability', 'support need', '脆弱', '擔心', '需要支持'],
    promise: ['promise', 'commitment', '承諾', '約定'],
    preference: ['preference', 'likes dislikes', '偏好', '喜好'],
    event: ['event', 'shared experience', '經歷', '事件'],
    boundary: ['boundary', 'limit', '界線', '底線'],
};

export const normalizeMemorySearchTag = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u0000-\u001F]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
    .trim()
    .slice(0, 60);

const pushTag = (target: string[], value: string) => {
    const normalized = normalizeMemorySearchTag(value);
    if (
        !normalized
        || normalized.length < 2
        || GENERIC_TAGS.has(normalized)
        || target.includes(normalized)
    ) return;
    target.push(normalized);
};

export const buildMemoryQueryTerms = (query: string, limit = 64) => {
    const normalized = query.normalize('NFKC').toLocaleLowerCase();
    const terms: string[] = [];
    normalized.match(/[a-z0-9][a-z0-9'_-]{1,31}/giu)?.forEach(term => pushTag(terms, term));
    const hanRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
    hanRuns.forEach(run => {
        if (run.length <= 8) pushTag(terms, run);
        for (let index = 0; index < run.length - 1; index += 1) {
            pushTag(terms, run.slice(index, index + 2));
            if (terms.length >= limit) break;
        }
    });
    return terms.slice(0, limit);
};

export const buildMemorySearchTags = (
    title: string,
    summary: string,
    kind: MemoryIndexKind,
    provided: readonly string[] = [],
    limit = 12,
) => {
    const tags: string[] = [];
    provided.forEach(tag => pushTag(tags, tag));
    KIND_ALIASES[kind].forEach(tag => pushTag(tags, tag));

    // Title terms are usually the most discriminative local fallback.
    buildMemoryQueryTerms(title, 12).forEach(tag => pushTag(tags, tag));

    // Summary terms fill missing names/places/objects for legacy or manual memories.
    buildMemoryQueryTerms(summary, 20).forEach(tag => {
        if (tags.length < limit) pushTag(tags, tag);
    });
    return tags.slice(0, limit);
};

export const mergeMemorySearchTags = (
    ...groups: Array<readonly string[] | null | undefined>
) => {
    const tags: string[] = [];
    groups.flatMap(group => group || []).forEach(tag => pushTag(tags, tag));
    return tags.slice(0, 14);
};
