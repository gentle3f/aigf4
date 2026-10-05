import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('ordinary sends gate NPC promotion intent before scanning established NPC history', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const createExplicitNpcPromotionProposal =');
    const end = source.indexOf('const createObservedNpcPromotionProposals =', start);
    assert.ok(start >= 0 && end > start);
    const proposalSource = source.slice(start, end);

    const gateIndex = proposalSource.indexOf('if (!hasNpcPromotionIntent(text)) return null;');
    const historyIndex = proposalSource.indexOf('memoryManager.peekChatHistory(conversationKey)');
    const establishedIndex = proposalSource.indexOf('collectEstablishedNpcNames(history, persona.name, text)');

    assert.ok(gateIndex >= 0);
    assert.ok(historyIndex > gateIndex);
    assert.ok(establishedIndex > gateIndex);
});
