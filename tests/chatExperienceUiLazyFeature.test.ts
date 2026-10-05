import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Chat Experience UI is lazy while preference prompts stay hot', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const groupSource = readFileSync(new URL('../groupChat.ts', import.meta.url), 'utf8');
    const groupPromptSource = readFileSync(new URL('../groupChatPrompt.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import \{ preferencePrompt \} from ['"]\.\/chatExperience\.js['"]/);
    assert.match(groupPromptSource, /import \{ preferencePrompt \} from ['"]\.\/chatExperience\.js['"]/);
    assert.match(indexSource, /import\(['"]\.\/features\/chatExperienceUi\.js['"]\)/);
    assert.doesNotMatch(indexSource, /import \{[^}]*experienceDialog[^}]*\} from ['"]\.\/chatExperience\.js['"]/s);
    assert.doesNotMatch(groupSource, /chatExperienceUi/);
});

test('User-triggered experience tools share the cached cold UI module', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /const loadChatExperienceUi =/);
    assert.match(source, /const \{\s*experienceButton,\s*experienceDialog,\s*generateExperienceDraft,\s*\} = await loadChatExperienceUi\(\)/);
    assert.match(source, /\['最近文字用量', async \(\) => \{\s*const \{ experienceDialog \} = await loadChatExperienceUi\(\)/);
    assert.match(source, /\['目前場景與衣著', async \(\) => \{\s*const \{ experienceButton, experienceDialog \} = await loadChatExperienceUi\(\)/);
    assert.match(source, /\['互動偏好', async \(\) => \{\s*const \{ editChatPreferences \} = await loadChatExperienceUi\(\)/);

    const coldSource = readFileSync(new URL('../features/chatExperienceUi.ts', import.meta.url), 'utf8');
    assert.match(coldSource, /export async function generateExperienceDraft/);
    assert.match(coldSource, /You suggest the next message for the USER/);
    assert.match(coldSource, /Editing task: rewrite only the last assistant reply/);
    assert.doesNotMatch(source, /You suggest the next message for the USER/);
    assert.doesNotMatch(source, /Editing task: rewrite only the last assistant reply/);
    assert.match(source, /parseGroupGeneration\(generated\.text, request\.room\)/);
    assert.match(source, /memoryManager\.setChatHistory\(key, updated, true\)/);
});
