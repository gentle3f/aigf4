import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCharacterPhotoModelLadder,
    inferCharacterPhotoContentMode,
} from '../features/characterPhotoImagePolicy.js';
import type { VeniceImageModelSummary } from '../veniceImage.js';

const model = (
    id: string,
    kind: 'generate' | 'edit',
    traits: string[] = [],
): VeniceImageModelSummary => ({
    id,
    name: id,
    kind,
    privacy: 'private',
    traits,
    resolutionPrices: {},
    constraints: {},
});

test('character photo content mode only marks explicit adult photo requests as nsfw', () => {
    assert.equal(inferCharacterPhotoContentMode('Take a candid photo while packing the suitcase.'), 'general');
    assert.equal(inferCharacterPhotoContentMode('Take an explicit NSFW nude photo now.'), 'nsfw');
    assert.equal(inferCharacterPhotoContentMode('影一張全裸成人照片'), 'nsfw');
});

test('NSFW edit routing prioritizes the uncensored edit model before ordinary edit models', () => {
    const models = [
        model('qwen-image-3-edit', 'edit'),
        model('grok-imagine-edit', 'edit'),
        model('qwen-edit-uncensored', 'edit'),
    ];
    assert.deepEqual(
        buildCharacterPhotoModelLadder({
            mode: 'edit',
            models,
            primaryModelId: 'qwen-image-3-edit',
            contentMode: 'nsfw',
        }).map(item => item.id),
        ['qwen-edit-uncensored', 'qwen-image-3-edit', 'grok-imagine-edit'],
    );
});

test('NSFW generate routing prioritizes Venice most-uncensored models', () => {
    const models = [
        model('qwen-image-3', 'generate'),
        model('lustify-v7', 'generate', ['most_uncensored']),
        model('lustify-v8', 'generate', ['most_uncensored']),
        model('grok-imagine-image', 'generate'),
    ];
    assert.deepEqual(
        buildCharacterPhotoModelLadder({
            mode: 'generate',
            models,
            primaryModelId: 'qwen-image-3',
            contentMode: 'nsfw',
        }).map(item => item.id),
        ['lustify-v8', 'lustify-v7', 'qwen-image-3'],
    );
});

test('general photo routing keeps configured primary first and then reliable alternates', () => {
    const models = [
        model('qwen-image-3', 'generate'),
        model('grok-imagine-image', 'generate'),
        model('flux-2-pro', 'generate'),
    ];
    assert.deepEqual(
        buildCharacterPhotoModelLadder({
            mode: 'generate',
            models,
            primaryModelId: 'qwen-image-3',
            contentMode: 'general',
        }).map(item => item.id),
        ['qwen-image-3', 'grok-imagine-image', 'flux-2-pro'],
    );
});
