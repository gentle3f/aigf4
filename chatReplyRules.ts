import {normalizeHongKongTraditional} from './traditionalChinese.js';
const normalizeTraditionalChineseLeaks=normalizeHongKongTraditional;

export const normalizeReplyForComparison = (text: string) => {
    return text
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[\p{P}\p{S}\s]+/gu, '')
        .trim();
};

export const normalizeReplySurfaceForComparison = (text: string) => {
    return text
        .toLowerCase()
        .replace(/[\p{P}\p{S}\s]+/gu, '')
        .trim();
};

export const commonPrefixLength = (left: string, right: string) => {
    const maxLength = Math.min(left.length, right.length);
    let index = 0;

    while (index < maxLength && left[index] === right[index]) {
        index += 1;
    }

    return index;
};

export const repliesAreTooSimilar = (left: string, right: string) => {
    const normalizedLeft = normalizeReplyForComparison(left);
    const normalizedRight = normalizeReplyForComparison(right);
    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    if (normalizedLeft === normalizedRight) {
        return true;
    }

    const shorter = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight;
    const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft;

    if (shorter.length >= 24 && longer.includes(shorter) && shorter.length / longer.length >= 0.72) {
        return true;
    }

    return shorter.length >= 24 && commonPrefixLength(normalizedLeft, normalizedRight) / shorter.length >= 0.78;
};

export const replyReusesOpeningOrNarrativeBeat = (left: string, right: string) => {
    const leftOpening = normalizeReplySurfaceForComparison(left.slice(0, 140)).slice(0, 84);
    const rightOpening = normalizeReplySurfaceForComparison(right.slice(0, 140)).slice(0, 84);
    const shorterOpeningLength = Math.min(leftOpening.length, rightOpening.length);
    if (
        shorterOpeningLength >= 24 &&
        commonPrefixLength(leftOpening, rightOpening) / shorterOpeningLength >= 0.76
    ) {
        return true;
    }

    const extractNarrativeBeats = (text: string) => {
        return Array.from(text.matchAll(/[（(]([^）)]{10,})[）)]/gu))
            .map(match => normalizeReplySurfaceForComparison(match[1]))
            .filter(beat => beat.length >= 20);
    };

    const leftBeats = extractNarrativeBeats(left);
    const rightBeats = extractNarrativeBeats(right);
    return leftBeats.some(leftBeat => {
        return rightBeats.some(rightBeat => {
            const shorter = leftBeat.length <= rightBeat.length ? leftBeat : rightBeat;
            const longer = shorter === leftBeat ? rightBeat : leftBeat;
            if (shorter.length >= 20 && longer.includes(shorter) && shorter.length / longer.length >= 0.78) {
                return true;
            }
            return commonPrefixLength(leftBeat, rightBeat) / Math.min(leftBeat.length, rightBeat.length) >= 0.82;
        });
    });
};

export const replyReusesCompletedClause = (left: string, right: string) => {
    const extractClauses = (text: string) => {
        return text
            .split(/[。！？!?\n]+/u)
            .map(clause => normalizeReplySurfaceForComparison(clause))
            .filter(clause => clause.length >= 18);
    };

    const leftClauses = extractClauses(left);
    const rightClauses = extractClauses(right);
    return leftClauses.some(leftClause => {
        return rightClauses.some(rightClause => {
            const shorter = leftClause.length <= rightClause.length ? leftClause : rightClause;
            const longer = shorter === leftClause ? rightClause : leftClause;
            if (longer.includes(shorter) && shorter.length / longer.length >= 0.82) {
                return true;
            }
            return commonPrefixLength(leftClause, rightClause) / Math.min(leftClause.length, rightClause.length) >= 0.86;
        });
    });
};

export const userExplicitlyRequestsContinuation = (text: string) => {
    return /繼續|接著|再說一次|重複|repeat|continue|same again|接下去|剛剛那段/u.test(text);
};

export const replyBreaksSpeakerOwnership = (reply: string) => {
    const assignsDialogueToUser = /(?:^|[\n）)])\s*你[^。！？!?\n]{0,18}[:：]\s*[「『“"]/u.test(reply);
    const malformedFirstPersonLabel = /(?:^|[\n）)])\s*我(?:將|把|手|的|嘅)[^。！？!?\n]{0,14}[:：]\s*[「『“"]/u.test(reply);
    const lastOpeningParenthesis = Math.max(reply.lastIndexOf('('), reply.lastIndexOf('（'));
    const lastClosingParenthesis = Math.max(reply.lastIndexOf(')'), reply.lastIndexOf('）'));
    return assignsDialogueToUser
        || malformedFirstPersonLabel
        || lastOpeningParenthesis > lastClosingParenthesis;
};

export const normalizeCcCantoneseLeaks = (text: string) => {
    const phraseReplacements: Array<[RegExp, string]> = [
        [/頭發/gu, '頭髮'],
        [/不放心/gu, '唔放心'],
        [/不需要/gu, '唔需要'],
        [/不用/gu, '唔使'],
        [/不要/gu, '唔好'],
        [/(?:不准|不準)/gu, '唔准'],
        [/不會/gu, '唔會'],
        [/不能/gu, '唔可以'],
        [/現在/gu, '而家'],
        [/立刻/gu, '即刻'],
        [/這段時間/gu, '呢段時間'],
        [/這個/gu, '呢個'],
        [/那個/gu, '嗰個'],
        [/(?:裡面|裏面)/gu, '入面'],
        [/(?:走|行)出來/gu, '行出嚟'],
        [/出來/gu, '出嚟'],
        [/回家/gu, '返屋企'],
        [/告訴我/gu, '話俾我知'],
        [/告訴你/gu, '話俾你知'],
        [/看到/gu, '見到'],
        [/跟其他人/gu, '同其他人'],
    ];
    let normalized = normalizeTraditionalChineseLeaks(text);
    phraseReplacements.forEach(([pattern, replacement]) => {
        normalized = normalized.replace(pattern, replacement);
    });
    return normalized;
};

export const mergeReplySegments = (baseText: string, continuationText: string) => {
    const base = baseText.trimEnd();
    let continuation = continuationText.trimStart();

    if (!continuation) {
        return base;
    }

    const maxOverlap = Math.min(80, base.length, continuation.length);
    for (let overlap = maxOverlap; overlap >= 12; overlap -= 1) {
        if (base.slice(-overlap) === continuation.slice(0, overlap)) {
            continuation = continuation.slice(overlap).trimStart();
            break;
        }
    }

    if (!continuation) {
        return base;
    }

    return `${base}${continuation}`.trim();
};
