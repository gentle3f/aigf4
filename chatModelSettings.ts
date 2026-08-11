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
