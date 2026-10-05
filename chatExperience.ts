export interface ChatPreferences {
    length: 'natural' | 'detailed' | 'concise';
    style: 'balanced' | 'dialogue' | 'descriptive';
    pace: 'natural' | 'slow' | 'active';
}

export const defaultChatPreferences: ChatPreferences = {
    length: 'natural',
    style: 'balanced',
    pace: 'natural',
};

export function preferencePrompt(value?: ChatPreferences): string {
    if (!value) return '';
    return [
        'USER CHAT PREFERENCES: preserve continuity and character individuality while applying these preferences.',
        value.length === 'detailed'
            ? 'Give a developed, satisfying response with meaningful fresh detail, without padding or repeating.'
            : value.length === 'concise'
                ? 'Keep the response focused and concise.'
                : 'Use the length the current moment needs.',
        value.style === 'dialogue'
            ? 'Emphasize natural spoken exchanges.'
            : value.style === 'descriptive'
                ? 'Include concrete environment, expressions and actions relevant to the current moment.'
                : 'Balance dialogue with relevant action and environment.',
        value.pace === 'slow'
            ? 'Let the current beat breathe; do not rush time or resolve the scene immediately.'
            : value.pace === 'active'
                ? 'Let characters take one plausible initiative without deciding the user actions.'
                : 'Move forward at a natural pace.',
    ].join('\n');
}
