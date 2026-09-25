import type { DecisionAssessment, DecisionProvider, ReviewState } from '../contracts.js';

export type JevUnavailableReason =
    | 'INVALID_REQUEST'
    | 'INVALID_STATE'
    | 'MISSING_CREDENTIALS'
    | 'MODEL_NOT_ALLOWED'
    | 'OVERSIZE'
    | 'UPSTREAM_FAILURE'
    | 'UPSTREAM_BAD_REQUEST'
    | 'UPSTREAM_UNAUTHORIZED'
    | 'UPSTREAM_PAYMENT_REQUIRED'
    | 'UPSTREAM_FORBIDDEN'
    | 'UPSTREAM_NOT_FOUND'
    | 'UPSTREAM_REQUEST_TIMEOUT'
    | 'UPSTREAM_TOO_LARGE'
    | 'UPSTREAM_UNPROCESSABLE'
    | 'UPSTREAM_RATE_LIMITED'
    | 'UPSTREAM_SERVER_ERROR'
    | 'UPSTREAM_HTTP_ERROR'
    | 'UPSTREAM_NETWORK_ERROR'
    | 'MALFORMED_RESPONSE'
    | 'TIMEOUT'
    | 'UNAUTHENTICATED'
    | 'NETWORK_FAILURE';

export type JevNetworkCode =
    | 'UND_ERR_CONNECT_TIMEOUT'
    | 'UND_ERR_HEADERS_TIMEOUT'
    | 'UND_ERR_BODY_TIMEOUT'
    | 'UND_ERR_SOCKET'
    | 'UND_ERR_ABORTED'
    | 'ECONNRESET'
    | 'ECONNREFUSED'
    | 'ETIMEDOUT'
    | 'ENETUNREACH'
    | 'EHOSTUNREACH'
    | 'ENOTFOUND'
    | 'EAI_AGAIN'
    | 'CERT_HAS_EXPIRED'
    | 'DEPTH_ZERO_SELF_SIGNED_CERT'
    | 'SELF_SIGNED_CERT_IN_CHAIN'
    | 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    | 'ERR_TLS_CERT_ALTNAME_INVALID'
    | 'ERR_SSL_WRONG_VERSION_NUMBER'
    | 'NETWORK_UNKNOWN';

export interface JevShadowResult {
    status: 'ok' | 'unavailable' | 'aborted';
    reasonCode?: JevUnavailableReason;
    networkCode?: JevNetworkCode;
    model?: string;
    route?: {
        choice: 'clean' | 'full_review';
        probabilities: { clean: number; full_review: number };
        confidence: number;
    };
    signals?: {
        identityConflict: number;
        speakerOwnershipViolation: number;
        realityLayerViolation: number;
        memoryConflict: number;
        stateConflict: number;
        userAgencyViolation: number;
        continuityViolation: number;
    };
    usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
}

export type JevFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const unavailableReasons = new Set<JevUnavailableReason>([
    'INVALID_REQUEST', 'INVALID_STATE', 'MISSING_CREDENTIALS', 'MODEL_NOT_ALLOWED', 'OVERSIZE',
    'UPSTREAM_FAILURE', 'UPSTREAM_BAD_REQUEST', 'UPSTREAM_UNAUTHORIZED', 'UPSTREAM_PAYMENT_REQUIRED',
    'UPSTREAM_FORBIDDEN', 'UPSTREAM_NOT_FOUND', 'UPSTREAM_REQUEST_TIMEOUT', 'UPSTREAM_TOO_LARGE',
    'UPSTREAM_UNPROCESSABLE', 'UPSTREAM_RATE_LIMITED', 'UPSTREAM_SERVER_ERROR', 'UPSTREAM_HTTP_ERROR',
    'UPSTREAM_NETWORK_ERROR', 'MALFORMED_RESPONSE', 'TIMEOUT', 'UNAUTHENTICATED', 'NETWORK_FAILURE',
]);

const networkCodes = new Set<JevNetworkCode>([
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED',
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN',
    'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER', 'NETWORK_UNKNOWN',
]);

const isProbability = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
);

const isUsage = (value: unknown): value is NonNullable<JevShadowResult['usage']> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0);
};

export const normalizeJevShadowResult = (value: unknown): JevShadowResult | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const response = value as Record<string, unknown>;
    if (response.status === 'unavailable' && typeof response.reasonCode === 'string' && unavailableReasons.has(response.reasonCode as JevUnavailableReason)) {
        const reasonCode = response.reasonCode as JevUnavailableReason;
        if (response.networkCode === undefined) return { status: 'unavailable', reasonCode };
        if (reasonCode !== 'UPSTREAM_NETWORK_ERROR' || typeof response.networkCode !== 'string' || !networkCodes.has(response.networkCode as JevNetworkCode)) return null;
        return { status: 'unavailable', reasonCode, networkCode: response.networkCode as JevNetworkCode };
    }
    if (response.status !== 'ok' || typeof response.model !== 'string') return null;
    const route = response.route as Record<string, unknown> | undefined;
    const probabilities = route?.probabilities as Record<string, unknown> | undefined;
    const signals = response.signals as Record<string, unknown> | undefined;
    if (!route || !probabilities || !signals
        || (route.choice !== 'clean' && route.choice !== 'full_review')
        || !isProbability(probabilities.clean)
        || !isProbability(probabilities.full_review)
        || !isProbability(route.confidence)
        || !isProbability(signals.identityConflict)
        || !isProbability(signals.speakerOwnershipViolation)
        || !isProbability(signals.realityLayerViolation)
        || !isProbability(signals.memoryConflict)
        || !isProbability(signals.stateConflict)
        || !isProbability(signals.userAgencyViolation)
        || !isProbability(signals.continuityViolation)
        || (response.usage !== undefined && !isUsage(response.usage))) return null;
    return {
        status: 'ok',
        model: response.model,
        route: {
            choice: route.choice,
            probabilities: { clean: probabilities.clean, full_review: probabilities.full_review },
            confidence: route.confidence,
        },
        signals: {
            identityConflict: signals.identityConflict,
            speakerOwnershipViolation: signals.speakerOwnershipViolation,
            realityLayerViolation: signals.realityLayerViolation,
            memoryConflict: signals.memoryConflict,
            stateConflict: signals.stateConflict,
            userAgencyViolation: signals.userAgencyViolation,
            continuityViolation: signals.continuityViolation,
        },
        usage: response.usage as JevShadowResult['usage'],
    };
};

const unavailable = (reasonCode: JevUnavailableReason): JevShadowResult => ({ status: 'unavailable', reasonCode });

export const evaluateJevShadow = async (
    state: Readonly<ReviewState>,
    signal?: AbortSignal,
    fetchImpl: JevFetch = fetch,
): Promise<JevShadowResult> => {
    try {
        const response = await fetchImpl('/api/openrouter-decisions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
            signal,
        });
        if (!response.ok) return unavailable(response.status === 401 ? 'UNAUTHENTICATED' : 'UPSTREAM_FAILURE');
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            return unavailable('MALFORMED_RESPONSE');
        }
        const normalized = normalizeJevShadowResult(body);
        return normalized || unavailable('MALFORMED_RESPONSE');
    } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) return { status: 'aborted' };
        return unavailable('NETWORK_FAILURE');
    }
};

export const jevDecisionProvider: DecisionProvider = {
    async evaluate(state, signal): Promise<DecisionAssessment> {
        const result = await evaluateJevShadow(state, signal);
        if (result.status !== 'ok' || !result.route) return { outcome: 'unavailable', reasons: [] };
        return {
            outcome: result.route.choice === 'clean' ? 'accept' : 'strict-review',
            reasons: [],
            provider: result.model,
            confidence: result.route.confidence,
            wouldRoute: result.route.choice === 'clean' ? 'accept' : 'strict-review',
        };
    },
};
