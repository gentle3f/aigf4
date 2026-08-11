import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCharacterModelRoute,
    buildStrictReviewModelRoute,
    normalizeChatModelSettings,
    parseChatModelSettings,
} from '../chatModelSettings.js';

const defaults = {
    primary: 'main',
    qualityFallback: 'quality',
    emergencyFallback: 'emergency',
    ccPrimary: 'cc-special',
};

test('keeps Cc on an independent primary route', () => {
    assert.deepEqual(buildCharacterModelRoute(defaults, false), ['main', 'quality', 'emergency']);
    assert.deepEqual(buildCharacterModelRoute(defaults, true), ['cc-special', 'quality', 'main', 'emergency']);
    assert.deepEqual(buildStrictReviewModelRoute(defaults, true), ['cc-special', 'quality', 'main', 'emergency']);
});

test('deduplicates routes when the user selects the same fallback', () => {
    const settings = { ...defaults, qualityFallback: 'main', ccPrimary: 'main' };
    assert.deepEqual(buildCharacterModelRoute(settings, false), ['main', 'emergency']);
    assert.deepEqual(buildCharacterModelRoute(settings, true), ['main', 'emergency']);
    assert.deepEqual(buildStrictReviewModelRoute(settings, false), ['main', 'emergency']);
});

test('repairs missing or corrupt persisted model settings with defaults', () => {
    assert.deepEqual(parseChatModelSettings('{broken', defaults), defaults);
    assert.deepEqual(normalizeChatModelSettings({ primary: ' new-main ', ccPrimary: '' }, defaults), {
        ...defaults,
        primary: 'new-main',
    });
});
