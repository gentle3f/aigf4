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
