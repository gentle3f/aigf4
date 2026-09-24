import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCharacterModelRoute,
    buildSurpriseEventModelRoute,
    buildStrictReviewModelRoute,
    normalizeChatModelSettings,
    parseChatModelSettings,
} from '../chatModelSettings.js';
import {
    DEFAULT_PRIMARY_CHAT_MODEL,
    VENICE_CC_MODEL,
    VENICE_CHAT_FALLBACK_MODEL,
    VENICE_CHAT_MODEL,
    VENICE_CHAT_QUALITY_FALLBACK_MODEL,
} from '../venice.js';

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
    assert.deepEqual(buildSurpriseEventModelRoute(defaults), ['main', 'emergency', 'quality']);
});

test('deduplicates routes when the user selects the same fallback', () => {
    const settings = { ...defaults, qualityFallback: 'main', ccPrimary: 'main' };
    assert.deepEqual(buildCharacterModelRoute(settings, false), ['main', 'emergency']);
    assert.deepEqual(buildCharacterModelRoute(settings, true), ['main', 'emergency']);
    assert.deepEqual(buildStrictReviewModelRoute(settings, false), ['main', 'emergency']);
    assert.deepEqual(buildSurpriseEventModelRoute(settings), ['main', 'emergency']);
});

test('repairs missing or corrupt persisted model settings with defaults', () => {
    assert.deepEqual(parseChatModelSettings('{broken', defaults), defaults);
    assert.deepEqual(normalizeChatModelSettings({ primary: ' new-main ', ccPrimary: '' }, defaults), {
        ...defaults,
        primary: 'new-main',
    });
});

test('uses Qwen 3.8 as the shared normal and group primary without changing strict review', () => {
    const productionDefaults = {
        primary: VENICE_CHAT_MODEL,
        qualityFallback: VENICE_CHAT_QUALITY_FALLBACK_MODEL,
        emergencyFallback: VENICE_CHAT_FALLBACK_MODEL,
        ccPrimary: VENICE_CC_MODEL,
    };

    const normalAndGroupRoute = buildCharacterModelRoute(productionDefaults, false);
    assert.equal(DEFAULT_PRIMARY_CHAT_MODEL, 'qwen-3-8-27b');
    assert.equal(normalAndGroupRoute[0], 'qwen-3-8-27b');
    assert.equal(normalAndGroupRoute.filter(model => model === 'qwen-3-6-plus').length, 0);
    assert.equal(buildStrictReviewModelRoute(productionDefaults, false)[0], VENICE_CHAT_QUALITY_FALLBACK_MODEL);
});
