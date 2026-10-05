import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Group prompt builder is cold while group history, display, and parser stay in the hot shell', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const groupSource = readFileSync(new URL('../groupChat.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/groupChatPrompt\.js['"]\)/);
    assert.doesNotMatch(indexSource, /buildGroupSystemPrompt(?:WithAccounting)?,?\s*\n?\s*} from ["']\.\/groupChat\.js["']/);
    assert.doesNotMatch(groupSource, /buildGroupSystemPrompt/);
    assert.match(groupSource, /export const parseGroupGeneration/);
    assert.match(groupSource, /export const getGroupDisplaySegments/);
    assert.match(groupSource, /export const contentToGroupHistoryText/);
});

test('Opening a group chat prefetches the prompt module before the user sends', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /if \(room\) \{\s*void loadGroupChatPromptModule\(\)\.catch/);
    assert.match(source, /const groupPromptModule = await loadGroupChatPromptModule\(\)/);
    assert.match(source, /groupPromptModule\.buildGroupSystemPromptWithAccounting/);
    assert.match(source, /const \{ buildGroupSystemPrompt \} = await loadGroupChatPromptModule\(\)/);
});
