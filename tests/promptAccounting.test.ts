import assert from 'node:assert/strict';
import test from 'node:test';
import {
    classifyCharacterSystemPrompt,
    estimatePromptTokens,
    promptComponent,
    summarizePromptComponents,
} from '../promptAccounting.js';

test('accounts for character prompt components without exposing their content', () => {
    const prompt = [
        'You are Alice, the active romance character in a continuous private conversation.',
        'Short identity:\nA musician.',
        'User-confirmed public identity (real person):\nCanonical name: Alice',
        'Character identity and voice:\nWarm but stubborn.',
        'soul.md permanent identity, relationship and user anchors:\n- Trust: She remembers.',
        'memory.md recent important events and continuity:\n- Park: They shared an umbrella.',
        'AUTHORITATIVE CURRENT WARDROBE LEDGER:\n- Alice: white dress',
        'Personality anchors:\n- Shy before direct affection.',
        'USER CHAT PREFERENCES: preserve continuity.',
        'Speaker and participant ownership (apply on every turn):\n- Keep NPCs separate.',
    ].join('\n\n');
    const names = classifyCharacterSystemPrompt(prompt).map(component => component.name);
    assert.deepEqual(names, [
        'identity-relationship', 'persona-definition', 'public-identity', 'persona-definition',
        'soul-memory', 'episodic-memory', 'wardrobe', 'behaviour-guidance',
        'response-preferences', 'continuity-ownership',
    ]);
});

test('keeps aggregate accounting bounded to sizes and message counts', () => {
    const total = summarizePromptComponents([
        promptComponent('persona-definition', 'Alice', 1),
        { name: 'recent-conversation-history', chars: 80, messages: 4 },
    ]);
    assert.deepEqual(total, { chars: 85, messages: 5 });
    assert.equal(estimatePromptTokens(85), 47);
});
