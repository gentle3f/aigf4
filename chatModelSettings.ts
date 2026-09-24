export interface ChatModelSettings {
    primary: string;
    qualityFallback: string;
    emergencyFallback: string;
    ccPrimary: string;
}

export const CHAT_MODEL_SETTINGS_STORAGE_KEY = 'aigf4ChatModelSettingsV1';

const cleanModelId = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const normalizeChatModelSettings = (
    value: unknown,
    defaults: ChatModelSettings,
): ChatModelSettings => {
    const candidate = value && typeof value === 'object'
        ? value as Partial<ChatModelSettings>
        : {};
    return {
        primary: cleanModelId(candidate.primary) || defaults.primary,
        qualityFallback: cleanModelId(candidate.qualityFallback) || defaults.qualityFallback,
        emergencyFallback: cleanModelId(candidate.emergencyFallback) || defaults.emergencyFallback,
        ccPrimary: cleanModelId(candidate.ccPrimary) || defaults.ccPrimary,
    };
};

export const parseChatModelSettings = (
    raw: string | null,
    defaults: ChatModelSettings,
) => {
    if (!raw) return { ...defaults };
    try {
        return normalizeChatModelSettings(JSON.parse(raw), defaults);
    } catch {
        return { ...defaults };
    }
};

const uniqueRoute = (models: string[]) => Array.from(new Set(models.map(cleanModelId).filter(Boolean)));

// The current generators repair the first route model once, then try each
// configured fallback once. Keeping this rule here makes it characterizable
// without changing either generator's retry behavior.
export const getGenerationAttemptCount = (routeIndex: number) => routeIndex === 0 ? 2 : 1;

export interface GenerationPlanAttempt {
    model: string;
    routeIndex: number;
    attemptIndex: number;
    phase: 'primary' | 'repair' | 'fallback';
}

export interface GenerationPlan {
    models: string[];
    attempts: GenerationPlanAttempt[];
}

export const buildCharacterModelRoute = (
    settings: ChatModelSettings,
    isCc: boolean,
) => uniqueRoute(isCc
    ? [settings.ccPrimary, settings.qualityFallback, settings.primary, settings.emergencyFallback]
    : [settings.primary, settings.qualityFallback, settings.emergencyFallback]);

export const buildStrictReviewModelRoute = (
    settings: ChatModelSettings,
    isCc: boolean,
) => uniqueRoute(isCc
    ? [settings.ccPrimary, settings.qualityFallback, settings.primary, settings.emergencyFallback]
    : [settings.qualityFallback, settings.primary, settings.emergencyFallback]);

// This is a test-facing description of the route and retry loop already used
// by both legacy generators. It adds no routing rule of its own.
export const buildGenerationPlan = (
    settings: ChatModelSettings,
    isCc: boolean,
): GenerationPlan => {
    const models = buildCharacterModelRoute(settings, isCc);
    return {
        models,
        attempts: models.flatMap((model, routeIndex) => (
            Array.from({ length: getGenerationAttemptCount(routeIndex) }, (_, attemptOffset) => ({
                model,
                routeIndex,
                attemptIndex: attemptOffset + 1,
                phase: routeIndex === 0
                    ? attemptOffset === 0 ? 'primary' : 'repair'
                    : 'fallback',
            }))
        )),
    };
};

// Surprise cards use a prompt-level JSON contract on the primary model, then
// the schema-capable emergency model. The slow quality model remains last.
export const buildSurpriseEventModelRoute = (
    settings: ChatModelSettings,
) => uniqueRoute([
    settings.primary,
    settings.emergencyFallback,
    settings.qualityFallback,
]);
