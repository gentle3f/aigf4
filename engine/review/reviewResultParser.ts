import { normalizeArtificialProseEscapes } from '../../chatProseEscapes.js';
import type { StrictReviewDecision } from '../../strictReview.js';

const stripFence = (value: string) => value
    .replace(/^\s*```(?:json|text)?\s*/iu, '')
    .replace(/\s*```\s*$/u, '')
    .trim();

export const parseStrictReviewDecision = (raw: string): StrictReviewDecision | null => {
    const text = stripFence(raw);
    if (!text) return null;
    if (/^<keep\s*\/?\s*>$/iu.test(text)) {
        return { decision: 'keep', issues: [], revisedResponse: '' };
    }
    const taggedRevision = text.match(/<revision>\s*([\s\S]*?)\s*<\/revision>/iu)?.[1]?.trim();
    if (taggedRevision) {
        return { decision: 'revise', issues: ['strict-review'], revisedResponse: normalizeArtificialProseEscapes(taggedRevision) };
    }

    try {
        const parsed = JSON.parse(text) as {
            decision?: unknown;
            issues?: unknown;
            revised_response?: unknown;
            revisedResponse?: unknown;
        };
        const decision = parsed.decision === 'revise' ? 'revise' : parsed.decision === 'keep' ? 'keep' : null;
        if (!decision) return null;
        const revisedResponse = typeof parsed.revised_response === 'string'
            ? parsed.revised_response.trim()
            : typeof parsed.revisedResponse === 'string' ? parsed.revisedResponse.trim() : '';
        if (decision === 'revise' && !revisedResponse) return null;
        return {
            decision,
            issues: Array.isArray(parsed.issues)
                ? parsed.issues.filter((issue): issue is string => typeof issue === 'string').slice(0, 8)
                : [],
            revisedResponse,
        };
    } catch {
        return null;
    }
};
