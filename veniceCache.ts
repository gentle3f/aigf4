export interface VenicePromptCacheUsage {
    promptTokens?: number;
    cachedTokens?: number;
    cacheCreationInputTokens?: number;
    uncachedPromptTokens?: number;
    cacheHitPercent?: number;
}

type VeniceUsageLike = {
    prompt_tokens?: unknown;
    prompt_tokens_details?: {
        cached_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
    };
};

const nonNegativeNumber = (value: unknown) => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
);

/**
 * Venice accepts an opaque affinity key. Hashing keeps local conversation IDs
 * out of the request while ensuring the same conversation reaches the same cache shard.
 */
export const opaqueCacheHash = (value: string) => {
    let left = 0x811c9dc5;
    let right = 0x01000193;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        left = Math.imul(left ^ code, 0x01000193);
        right = Math.imul(right ^ (code + index), 0x27d4eb2d);
    }
    return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
};

export const createConversationPromptCacheKey = (
    conversationId: string,
    scope: 'chat' | 'review',
) => `wetapp-${scope}-v1-${opaqueCacheHash(`${scope}:${conversationId}`)}`;

/** Returns null only when Venice omitted all prompt-cache fields. */
export const parseVenicePromptCacheUsage = (
    usage?: VeniceUsageLike,
): VenicePromptCacheUsage | null => {
    const promptTokens = nonNegativeNumber(usage?.prompt_tokens);
    const cachedTokens = nonNegativeNumber(usage?.prompt_tokens_details?.cached_tokens);
    const cacheCreationInputTokens = nonNegativeNumber(
        usage?.prompt_tokens_details?.cache_creation_input_tokens,
    );
    if (cachedTokens === undefined && cacheCreationInputTokens === undefined) return null;

    return {
        ...(promptTokens === undefined ? {} : { promptTokens }),
        ...(cachedTokens === undefined ? {} : { cachedTokens }),
        ...(cacheCreationInputTokens === undefined ? {} : { cacheCreationInputTokens }),
        ...(promptTokens === undefined || cachedTokens === undefined
            ? {}
            : {
                uncachedPromptTokens: Math.max(0, promptTokens - cachedTokens),
                cacheHitPercent: Math.round((cachedTokens / Math.max(promptTokens, 1)) * 100),
            }),
    };
};
