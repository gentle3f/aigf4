import type { PersonaMemoryKind } from './managers.js';

export type ExplicitMemoryKind = PersonaMemoryKind;
export type ExplicitMemoryScope = 'permanent' | 'session' | 'unspecified';

export interface ExplicitMemoryIntent {
    scope: ExplicitMemoryScope;
    kind: ExplicitMemoryKind;
}

const STORE_MEMORY_REQUEST = /(?:請|麻煩|記得要|要你|希望你|你要|你哋要|你們要)?\s*(?:記住|牢記|唔好忘記|不要忘記|別忘記)|(?:please\s+)?remember\b|(?:don['’]?t|do\s+not|never)\s+forget\b/iu;
const RECALL_MEMORY_QUERY = /(?:記唔記得|仲記得|還記得|還記不記得|記得嗎|記得嘛|記得不記得)|\b(?:do|did|can)\s+you\s+remember\b|\bremember\s+when\b/iu;
const PERMANENT_MEMORY_REQUEST = /(?:永遠|一世|一直|以後都|長期|永久).{0,14}(?:記住|牢記|唔好忘記|不要忘記|別忘記)|(?:記住|牢記|唔好忘記|不要忘記|別忘記).{0,14}(?:永遠|一世|長期|永久|forever|permanent(?:ly)?)|remember\s+(?:this|that|it).{0,12}(?:forever|permanent(?:ly)?)|never\s+forget\s+(?:this|that|it)/iu;
const SESSION_MEMORY_REQUEST = /(?:今次|呢次|這次|本次|暫時|暫且|只限今次|只限本次|今次對話|這次對話|目前對話).{0,14}(?:記住|牢記)|(?:記住|牢記).{0,14}(?:今次|呢次|這次|本次|暫時|暫且|只限今次|只限本次|今次對話|這次對話|目前對話)|(?:remember|keep\s+in\s+mind).{0,16}(?:for\s+now|this\s+(?:chat|session|conversation)|temporar(?:y|ily))/iu;

export const isExplicitMemoryStoreRequest = (text: string) => (
    STORE_MEMORY_REQUEST.test(text)
    && !RECALL_MEMORY_QUERY.test(text)
);

export const isPermanentMemoryRequest = (text: string) => (
    isExplicitMemoryStoreRequest(text)
    && PERMANENT_MEMORY_REQUEST.test(text)
);

export const inferExplicitMemoryKind = (text: string): ExplicitMemoryKind => {
    if (/(?:底線|界線|禁忌|禁止|唔可以|不可以|不能|唔好再|不要再|別再|避免|boundary|limit|never\s+do|don['’]?t\s+ever)/iu.test(text)) {
        return 'boundary';
    }
    if (/(?:答應|承諾|約定|講好|說好|promise|promised|agreement)/iu.test(text)) {
        return 'promise';
    }
    if (/(?:鍾意|鐘意|喜歡|最愛|偏好|唔鍾意|唔鐘意|不喜歡|討厭|唔食|不吃|唔飲|不喝|prefer|favorite|favourite|like|dislike)/iu.test(text)) {
        return 'preference';
    }
    if (/(?:我哋係|我們是|關係|拍拖|男朋友|女朋友|老公|老婆|伴侶|relationship|partner|boyfriend|girlfriend|husband|wife)/iu.test(text)) {
        return 'relationship';
    }
    if (/(?:害怕|驚|怕|不安|焦慮|難過|傷心|脆弱|受傷|陰影|trauma|afraid|scared|anxious|vulnerab|hurt)/iu.test(text)) {
        return 'vulnerability';
    }
    return 'core';
};

export const detectExplicitMemoryIntent = (text: string): ExplicitMemoryIntent | null => {
    if (!isExplicitMemoryStoreRequest(text)) return null;
    const scope: ExplicitMemoryScope = PERMANENT_MEMORY_REQUEST.test(text)
        ? 'permanent'
        : SESSION_MEMORY_REQUEST.test(text)
            ? 'session'
            : 'unspecified';
    return {
        scope,
        kind: inferExplicitMemoryKind(text),
    };
};

export const stripExplicitMemoryDirective = (text: string) => text
    .replace(/(?:請|麻煩|我要|我想|希望)?(?:你|你們|你哋|大家)?\s*(?:永遠|一世|一直|以後都|長期|永久|今次|呢次|這次|本次|暫時|暫且|只限今次|只限本次|今次對話|這次對話|目前對話)?\s*(?:記住|牢記|唔好忘記|不要忘記|別忘記)(?:這件事|呢件事|這個|呢個)?/giu, '')
    .replace(/(?:please\s+)?remember\s+(?:this|it)(?:\s+(?:forever|permanently|for\s+now|this\s+(?:chat|session|conversation)))?/giu, '')
    .replace(/(?:please\s+)?remember\b/giu, '')
    .replace(/(?:don['’]?t|do\s+not|never)\s+forget(?:\s+(?:this|that|it))?(?:\s+forever)?/giu, '')
    .replace(/[：:，,。.!！?？\s]+$/gu, '')
    .trim();

interface ManualMemoryProposalLike {
    sourceMessageId?: string;
    summary?: string;
    status?: string;
}

interface MemoryPolicyMessageLike {
    role: string;
    id?: string;
    content?: {
        memoryProposal?: ManualMemoryProposalLike;
    };
}

export const getManualMemoryControlledSourceIds = (
    history: MemoryPolicyMessageLike[],
) => new Set(history.flatMap(message => {
    const sourceId = message.content?.memoryProposal?.sourceMessageId?.trim();
    return sourceId ? [sourceId] : [];
}));

export const getManualMemoryLongTermExclusionSummaries = (
    history: MemoryPolicyMessageLike[],
) => Array.from(new Set(history.flatMap(message => {
    const proposal = message.content?.memoryProposal;
    const summary = proposal?.summary?.trim();
    return summary ? [summary] : [];
})));

export const filterManualMemoryControlledTurns = <T extends MemoryPolicyMessageLike>(
    history: T[],
): T[] => {
    const controlled = getManualMemoryControlledSourceIds(history);
    if (controlled.size === 0) return history;

    let suppressTurn = false;
    return history.filter(message => {
        if (message.role === 'user') {
            suppressTurn = Boolean(message.id && controlled.has(message.id));
            return !suppressTurn;
        }
        if (message.role === 'model' && suppressTurn) return false;
        return true;
    });
};

const normalizeComparableMemory = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/(?:使用者|用戶|user)/giu, '')
    .replace(/(?:我哋|我們|我)/gu, '')
    .replace(/(?:唔|冇)/gu, match => match === '唔' ? '不' : '沒有')
    .replace(/食/gu, '吃')
    .replace(/飲/gu, '喝')
    .replace(/(?:鍾意|鐘意|中意)/gu, '喜歡')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .trim();

const bigrams = (value: string) => new Set(
    value.length < 2
        ? [value]
        : Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)),
);

export const autoMemoryMatchesManualDecision = (
    candidateSummary: string,
    manualSummaries: string[],
) => {
    const candidate = normalizeComparableMemory(candidateSummary);
    if (candidate.length < 4) return false;

    return manualSummaries.some(raw => {
        const manual = normalizeComparableMemory(raw);
        if (manual.length < 3) return false;
        if (
            (candidate.includes(manual) || manual.includes(candidate))
            && Math.min(candidate.length, manual.length) >= 3
        ) return true;
        if (manual.length < 4) return false;
        const left = bigrams(candidate);
        const right = bigrams(manual);
        const overlap = [...left].filter(pair => right.has(pair)).length;
        return overlap / Math.max(1, Math.min(left.size, right.size)) >= 0.58;
    });
};
