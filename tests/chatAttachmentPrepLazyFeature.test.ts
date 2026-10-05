import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('chat attachment image preparation stays cold until file selection', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/chatAttachmentPrep.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /handleChatAttachmentSelection = async \(\) =>[\s\S]*import\(['"]\.\/features\/chatAttachmentPrep\.js['"]\)/);
    assert.doesNotMatch(indexSource, /MAX_CHAT_IMAGE_EDGE|MAX_CHAT_ATTACHMENT_TOTAL_BYTES|const getAttachmentKind =|const prepareChatAttachment =/);
    assert.match(featureSource, /MAX_CHAT_IMAGE_EDGE = 1600/);
    assert.match(featureSource, /MAX_CHAT_ATTACHMENT_TOTAL_BYTES = 2_500_000/);
    assert.match(featureSource, /canvas\.toBlob/);
    assert.match(featureSource, /getAttachmentKind/);
});

test('attachment persistence and send content-part assembly remain in main', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/chatAttachmentPrep.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /const persistPendingChatAttachments = async/);
    assert.match(indexSource, /saveChatAttachment/);
    assert.match(indexSource, /type: 'image_url'/);
    assert.match(indexSource, /type: 'file'/);
    assert.doesNotMatch(featureSource, /saveChatAttachment|loadChatMediaStoreModule|sendMessage|runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline/);
});
