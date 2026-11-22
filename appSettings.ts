import { notifyLocalCloudChange } from './cloudSyncEvents.js';
import { mergeGroupModeRegisters } from './groupModeSync.js';
import { WORLDLINE_SETTING_KEY, mergeWorldlineRegistries } from './worldline.js';

export const RESEARCH_CAPTURE_SETTING_KEY = 'aigf4ResearchCaptureEnabledV1';
export const GROUP_V2_SYNCED_MODES_KEY = 'aigf4GroupV2SyncedModesV1';

export const PERSISTED_APP_SETTING_KEYS = [
    'veniceAssistantModel',
    'veniceAssistantWebSearchV1',
    'veniceAssistantTopicsV1',
    'aigf4ChatModelSettingsV1',
    'veniceImageGenerateModel',
    'veniceImageEditModel',
    'veniceImageSeed',
    'veniceImageSeedLocked',
    'veniceVideoImageModel',
    'veniceVideoTextModel',
    'aigf4RandomPersonaVariationsV2',
    RESEARCH_CAPTURE_SETTING_KEY,
    GROUP_V2_SYNCED_MODES_KEY,
    WORLDLINE_SETTING_KEY,
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
        const remoteValue = settings[key] as string;
        const next = key === GROUP_V2_SYNCED_MODES_KEY
            ? JSON.stringify(mergeGroupModeRegisters(localStorage.getItem(key), remoteValue))
            : key === WORLDLINE_SETTING_KEY
                ? JSON.stringify(mergeWorldlineRegistries(localStorage.getItem(key), remoteValue))
                : remoteValue;
        if (localStorage.getItem(key) === next) return;
        localStorage.setItem(key, next);
        changed = true;
    });
    if (changed) notifyLocalCloudChange('state');
    return changed;
};
