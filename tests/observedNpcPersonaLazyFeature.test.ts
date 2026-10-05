import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Observed NPC persona analysis is lazy loaded only for accepted NPC promotion', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /import\(['"]\.\/observedNpcPersona\.js['"]\)/);
    assert.match(source, /import type \{ ObservedNpcPersonaDraft \} from ["']\.\/observedNpcPersona\.js["']/);
    assert.doesNotMatch(source, /import \{[^}]*buildFallbackObservedNpcPersonaDraft[^}]*\} from/s);
    assert.match(source, /const analyzeObservedNpcPersona = async/);
    assert.match(source, /await loadObservedNpcPersonaModule\(\)/);
    assert.doesNotMatch(source, /observed_npc_persona/);
    assert.doesNotMatch(source, /Analyze the recurring adult character/);

    const coldSource = readFileSync(new URL('../observedNpcPersona.ts', import.meta.url), 'utf8');
    assert.match(coldSource, /export const analyzeObservedNpcPersonaDraft/);
    assert.match(coldSource, /observed_npc_persona/);
    assert.match(coldSource, /Analyze the recurring adult character/);
});

test('Observed NPC analyzer runtime remains separate from ordinary NPC dialogue detection', () => {
    const source = readFileSync(new URL('../npcDialogue.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /observedNpcPersona/);
});
