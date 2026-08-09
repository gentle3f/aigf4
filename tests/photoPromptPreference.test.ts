import assert from 'node:assert/strict';
import test from 'node:test';
import {
    cleanGeneratedPhotoPrompt,
    FAVORITE_PHOTO_PROMPT_MAX_LENGTH,
    normalizeFavoritePhotoPrompt,
    selectPhotoPromptVersion,
} from '../photoPromptPreference.js';

test('generated prompt cleaning removes discarded-option notes before image generation', () => {
    const cleaned = cleanGeneratedPhotoPrompt([
        'Mina wears a white shirt and holds one ceramic mug with both hands.',
        '(Note: Favorite instruction for a black shirt and empty hands was omitted due to conflict with current continuity.)',
    ].join(' '));

    assert.match(cleaned, /white shirt/u);
    assert.match(cleaned, /ceramic mug/u);
    assert.doesNotMatch(cleaned, /black shirt|empty hands|favorite|conflict/iu);
});

test('favorite photo prompt is normalized and bounded before persistence', () => {
    const value = `  soft   window light\n${'x'.repeat(800)}  `;
    const normalized = normalizeFavoritePhotoPrompt(value);

    assert.equal(normalized.includes('\n'), false);
    assert.equal(normalized.includes('  '), false);
    assert.equal(normalized.length, FAVORITE_PHOTO_PROMPT_MAX_LENGTH);
});

test('photo confirmation switches between independently reconciled prompt versions', () => {
    const base = 'White shirt in the current kitchen, holding a cup.';
    const favorite = 'White shirt in the current kitchen, holding a cup, soft window light.';

    assert.equal(selectPhotoPromptVersion(base, favorite, true), favorite);
    assert.equal(selectPhotoPromptVersion(base, favorite, false), base);
    assert.equal(selectPhotoPromptVersion(base, undefined, true), base);
});
