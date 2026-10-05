import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PERSISTED_APP_SETTING_KEYS,
    restorePersistedAppSettings,
    setPersistedAppSetting,
} from '../appSettings.js';
import { LOCAL_CLOUD_CHANGE_EVENT } from '../cloudSyncEvents.js';

const installStorageAndWindow = () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        },
    });
    const target = new EventTarget();
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: target,
    });
    return { values, target };
};

test('persisted app setting emits one state change only when the value changes', () => {
    const { values, target } = installStorageAndWindow();
    const scopes: string[] = [];
    target.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    assert.equal(setPersistedAppSetting('veniceAssistantModel', 'model-a'), true);
    assert.equal(values.get('veniceAssistantModel'), 'model-a');
    assert.deepEqual(scopes, ['state']);

    assert.equal(setPersistedAppSetting('veniceAssistantModel', 'model-a'), false);
    assert.deepEqual(scopes, ['state']);

    assert.equal(setPersistedAppSetting('veniceAssistantModel', 'model-b'), true);
    assert.deepEqual(scopes, ['state', 'state']);
});

test('restoring multiple app settings emits one state change and ignores unknown/session-only keys', () => {
    const { values, target } = installStorageAndWindow();
    const scopes: string[] = [];
    target.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    assert.equal(restorePersistedAppSettings({
        veniceAssistantModel: 'assistant-x',
        veniceImageSeed: '123',
        veniceImageAdultConfirmed: 'true',
        veniceVideoAdultConfirmed: 'true',
        unknownSetting: 'ignored',
    }), true);

    assert.equal(values.get('veniceAssistantModel'), 'assistant-x');
    assert.equal(values.get('veniceImageSeed'), '123');
    assert.equal(values.has('veniceImageAdultConfirmed'), false);
    assert.equal(values.has('veniceVideoAdultConfirmed'), false);
    assert.equal(values.has('unknownSetting'), false);
    assert.deepEqual(scopes, ['state']);
});

test('adult confirmation remains session-only and is never part of permanent backup/cloud keys', () => {
    assert.equal(PERSISTED_APP_SETTING_KEYS.includes('veniceImageAdultConfirmed' as never), false);
    assert.equal(PERSISTED_APP_SETTING_KEYS.includes('veniceVideoAdultConfirmed' as never), false);
    assert.ok(PERSISTED_APP_SETTING_KEYS.includes('veniceImageSeed'));
    assert.ok(PERSISTED_APP_SETTING_KEYS.includes('aigf4ChatModelSettingsV1'));
});
