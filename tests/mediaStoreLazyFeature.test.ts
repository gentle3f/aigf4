import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Photo and chat attachment stores are cold-loaded from media-only paths', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /import\(['"]\.\/photoStore\.js['"]\)/);
    assert.match(source, /import\(['"]\.\/chatMediaStore\.js['"]\)/);
    assert.doesNotMatch(source, /from ["']\.\/photoStore\.js["']/);
    assert.doesNotMatch(source, /from ["']\.\/chatMediaStore\.js["']/);
    assert.match(source, /loadPhotoStoreModule\(\)\)\.getCharacterPhotoBlob/);
    assert.match(source, /loadPhotoStoreModule\(\)\)\.saveCharacterPhotoAsset/);
    assert.match(source, /loadChatMediaStoreModule\(\)\)\.getChatAttachmentBlob/);
    assert.match(source, /loadChatMediaStoreModule\(\)\)\.saveChatAttachment/);
});

test('Normal text generation source does not depend on either media store loader', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const generateSingleChatReply = async');
    const end = source.indexOf('const generateGroupChatReply = async', start);
    const singleGenerationSource = source.slice(start, end);

    assert.doesNotMatch(singleGenerationSource, /loadPhotoStoreModule|loadChatMediaStoreModule|photoStore|chatMediaStore/);
});
