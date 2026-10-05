import { notifyLocalCloudChange } from './cloudSyncEvents.js';

export const RESEARCH_CAPTURE_SETTING_KEY = 'aigf4ResearchCaptureEnabledV1';

export const PERSISTED_APP_SETTING_KEYS = [
    'veniceAssistantModel',
    'aigf4ChatModelSettingsV1',
    'veniceImageGenerateModel',
    'veniceImageEditModel',
    'veniceImageSeed',
    'veniceImageSeedLocked',
    'veniceVideoImageModel',
    'veniceVideoTextModel',
    'aigf4RandomPersonaVariationsV2',
    RESEARCH_CAPTURE_SETTING_KEY,
] as const;

export type PersistedAppSettingKey = typeof PERSISTED_APP_SETTING_KEYS[number];

export const isPersistedAppSettingKey = (
    key: string,
): key is PersistedAppSettingKey => (
    (PERSISTED_APP_SETTING_KEYS as readonly string[]).includes(key)
);

export const setPersistedAppSetting = (
    key: PersistedAppSettingKey,
    value: string,
) => {
    const previous = localStorage.getItem(key);
    if (previous === value) return false;
    localStorage.setItem(key, value);
    notifyLocalCloudChange('state');
    return true;
};

export const restorePersistedAppSettings = (
    value: unknown,
) => {
    if (!value || typeof value !== 'object') return false;
    const settings = value as Record<string, unknown>;
    let changed = false;
    PERSISTED_APP_SETTING_KEYS.forEach(key => {
        if (typeof settings[key] !== 'string') return;
        const next = settings[key] as string;
        if (localStorage.getItem(key) === next) return;
        localStorage.setItem(key, next);
        changed = true;
    });
    if (changed) notifyLocalCloudChange('state');
    return changed;
};
