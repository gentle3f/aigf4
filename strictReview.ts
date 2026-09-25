import type { VeniceJsonSchemaResponseFormat } from './venice.js';

export const STRICT_REVIEW_ISSUE_CODES = [
    'request_mismatch',
    'identity',
    'speaker_ownership',
    'continuity',
    'reality_layer',
    'wardrobe',
    'state',
    'replayed_beat',
    'persona_voice',
    'third_party_speech',
    'user_agency',
    'incomplete_ending',
    'group_narration',
    'other',
] as const;

export type StrictReviewIssueCode = typeof STRICT_REVIEW_ISSUE_CODES[number];

const strictReviewIssueCodeSet = new Set<string>(STRICT_REVIEW_ISSUE_CODES);

export const sanitizeStrictReviewIssueCodes = (value: unknown): StrictReviewIssueCode[] => (
    Array.isArray(value)
        ? [...new Set(value.filter((issue): issue is StrictReviewIssueCode => (
            typeof issue === 'string' && strictReviewIssueCodeSet.has(issue)
        )))].slice(0, 8)
        : []
);

export interface StrictReviewDecision {
    decision: 'keep' | 'revise';
    issues: StrictReviewIssueCode[];
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
                    items: { type: 'string', enum: [...STRICT_REVIEW_ISSUE_CODES] },
                },
                revised_response: { type: 'string' },
            },
        },
    },
};
