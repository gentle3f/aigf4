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
    signals?: {
        requestMismatch: number;
        identityConflict: number;
        speakerOwnershipViolation: number;
        continuityViolation: number;
        realityLayerViolation: number;
        wardrobeConflict: number;
        stateConflict: number;
        replayedBeat: number;
        personaVoiceViolation: number;
        thirdPartySpeechViolation: number;
        userAgencyViolation: number;
        incompleteEnding: number;
        groupNarrationViolation: number;
        otherDefect: number;
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

const JEV_SIGNAL_KEYS = [
    'requestMismatch', 'identityConflict', 'speakerOwnershipViolation', 'continuityViolation',
    'realityLayerViolation', 'wardrobeConflict', 'stateConflict', 'replayedBeat',
    'personaVoiceViolation', 'thirdPartySpeechViolation', 'userAgencyViolation', 'incompleteEnding',
    'groupNarrationViolation', 'otherDefect',
] as const;

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
    const signals = response.signals as Record<string, unknown> | undefined;
    if (!signals
        || Object.keys(signals).length !== JEV_SIGNAL_KEYS.length
        || !JEV_SIGNAL_KEYS.every(key => Object.prototype.hasOwnProperty.call(signals, key))
        || !isProbability(signals.requestMismatch)
        || !isProbability(signals.identityConflict)
        || !isProbability(signals.speakerOwnershipViolation)
        || !isProbability(signals.continuityViolation)
        || !isProbability(signals.realityLayerViolation)
        || !isProbability(signals.wardrobeConflict)
        || !isProbability(signals.stateConflict)
        || !isProbability(signals.replayedBeat)
        || !isProbability(signals.personaVoiceViolation)
        || !isProbability(signals.thirdPartySpeechViolation)
        || !isProbability(signals.userAgencyViolation)
        || !isProbability(signals.incompleteEnding)
        || !isProbability(signals.groupNarrationViolation)
        || !isProbability(signals.otherDefect)
        || (response.usage !== undefined && !isUsage(response.usage))) return null;
    return {
        status: 'ok',
        model: response.model,
        signals: {
            requestMismatch: signals.requestMismatch,
            identityConflict: signals.identityConflict,
            speakerOwnershipViolation: signals.speakerOwnershipViolation,
            continuityViolation: signals.continuityViolation,
            realityLayerViolation: signals.realityLayerViolation,
            wardrobeConflict: signals.wardrobeConflict,
            stateConflict: signals.stateConflict,
            replayedBeat: signals.replayedBeat,
            personaVoiceViolation: signals.personaVoiceViolation,
            thirdPartySpeechViolation: signals.thirdPartySpeechViolation,
            userAgencyViolation: signals.userAgencyViolation,
            incompleteEnding: signals.incompleteEnding,
            groupNarrationViolation: signals.groupNarrationViolation,
            otherDefect: signals.otherDefect,
        },
        usage: response.usage as JevShadowResult['usage'],
    };
};

const unavailable = (reasonCode: JevUnavailableReason): JevShadowResult => ({ status: 'unavailable', reasonCode });

const evaluateJevEndpoint = async (
    state: Readonly<ReviewState>,
    signal?: AbortSignal,
    fetchImpl: JevFetch = fetch,
    profile?: 'wardrobe-v4',
): Promise<JevShadowResult> => {
    try {
        const response = await fetchImpl('/api/openrouter-decisions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile ? { state, profile } : { state }),
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

export const evaluateJevShadow = async (
    state: Readonly<ReviewState>,
    signal?: AbortSignal,
    fetchImpl: JevFetch = fetch,
): Promise<JevShadowResult> => evaluateJevEndpoint(state, signal, fetchImpl);

export const evaluateJevWardrobeShadowTrial = async (
    state: Readonly<ReviewState>,
    signal?: AbortSignal,
    fetchImpl: JevFetch = fetch,
): Promise<JevShadowResult> => evaluateJevEndpoint(state, signal, fetchImpl, 'wardrobe-v4');

export const jevDecisionProvider: DecisionProvider = {
    async evaluate(state, signal): Promise<DecisionAssessment> {
        const result = await evaluateJevShadow(state, signal);
        // Jev V3 provides calibration signals only. It cannot make a routing decision.
        return result.status === 'ok'
            ? { outcome: 'unavailable', reasons: [], provider: result.model }
            : { outcome: 'unavailable', reasons: [] };
    },
};
