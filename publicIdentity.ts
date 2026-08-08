import { VENICE_AUTH_REQUIRED_ERROR } from './venice.js';

export interface PublicIdentityCandidate {
    id: string;
    language: 'en' | 'zh';
    title: string;
    description: string;
    extract: string;
    pageUrl: string;
    thumbnailUrl?: string;
    originalImageUrl?: string;
}

export interface PublicIdentityMedia {
    title: string;
    thumbnailUrl: string;
    originalUrl: string;
    sourceUrl: string;
    license: string;
}

interface PublicIdentitySearchResponse {
    results?: PublicIdentityCandidate[];
    media?: PublicIdentityMedia[];
    error?: string;
}

const PUBLIC_IDENTITY_API_BASE = '/api/public-identity';

const fetchPublicIdentityJson = async (
    params: URLSearchParams,
    signal?: AbortSignal,
): Promise<PublicIdentitySearchResponse> => {
    const response = await fetch(`${PUBLIC_IDENTITY_API_BASE}?${params.toString()}`, {
        credentials: 'same-origin',
        signal,
    });
    const payload = await response.json().catch(() => ({})) as PublicIdentitySearchResponse;
    if (!response.ok) {
        if (response.status === 401) throw new Error(VENICE_AUTH_REQUIRED_ERROR);
        throw new Error(payload.error || `Public identity lookup failed (${response.status}).`);
    }
    return payload;
};

export const searchPublicIdentities = async (query: string, signal?: AbortSignal) => {
    const payload = await fetchPublicIdentityJson(new URLSearchParams({ q: query }), signal);
    return payload.results || [];
};

export const loadPublicIdentityMedia = async (
    candidate: PublicIdentityCandidate,
    signal?: AbortSignal,
) => {
    const payload = await fetchPublicIdentityJson(new URLSearchParams({
        title: candidate.title,
        lang: candidate.language,
    }), signal);
    return payload.media || [];
};
