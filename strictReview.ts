import type { VeniceJsonSchemaResponseFormat } from './venice.js';

export interface StrictReviewDecision {
    decision: 'keep' | 'revise';
    issues: string[];
    revisedResponse: string;
}

export const STRICT_REVIEW_RESPONSE_FORMAT: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'strict_chat_review',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['decision', 'issues', 'revised_response'],
            properties: {
                decision: { type: 'string', enum: ['keep', 'revise'] },
                issues: {
                    type: 'array',
                    maxItems: 8,
                    items: { type: 'string' },
                },
                revised_response: { type: 'string' },
            },
        },
    },
};

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
        return { decision: 'revise', issues: ['strict-review'], revisedResponse: taggedRevision };
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
