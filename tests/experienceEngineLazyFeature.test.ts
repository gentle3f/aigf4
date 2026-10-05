import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Surprise-event generation is behind a cold feature while relationship state remains hot', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/surpriseEventGeneration.ts', import.meta.url), 'utf8');
    const groupSource = readFileSync(new URL('../groupChat.ts', import.meta.url), 'utf8');
    const groupPromptSource = readFileSync(new URL('../groupChatPrompt.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/surpriseEventGeneration\.js['"]\)/);
    assert.doesNotMatch(indexSource, /import\(['"]\.\/experienceEngine\.js['"]\)/);
    assert.doesNotMatch(indexSource, /from ["']\.\/experienceEngine\.js["']/);
    assert.match(featureSource, /from ['"]\.\.\/experienceEngine\.js['"]/);
    assert.match(indexSource, /from ["']\.\/relationshipState\.js["']/);
    assert.match(indexSource, /from ["']\.\/surpriseEventPresentation\.js["']/);
    assert.match(groupPromptSource, /from ['"]\.\/relationshipState\.js['"]/);
    assert.doesNotMatch(groupSource, /experienceEngine/);
});

test('cold Surprise-event feature owns the heavy prompt, validation and fallback path', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../features/surpriseEventGeneration.ts', import.meta.url), 'utf8');

    assert.match(source, /eventEngine\.parseSurpriseEventProposal/);
    assert.match(source, /eventEngine\.surpriseEventsAreTooSimilar/);
    assert.match(source, /eventEngine\.createFallbackSurpriseEvent/);
    assert.match(source, /eventEngine\.SURPRISE_EVENT_RESPONSE_FORMAT/);
    assert.match(source, /eventEngine\.NSFW_SURPRISE_EVENT_DIRECTIONS/);
    assert.match(source, /OUTPUT CONTRACT: return one JSON object only/);
    assert.match(source, /dependencies\.runModel/);
    assert.match(source, /dependencies\.recentMessages/);
    assert.doesNotMatch(indexSource, /OUTPUT CONTRACT: return one JSON object only/);
    assert.doesNotMatch(indexSource, /NSFW_SURPRISE_EVENT_DIRECTIONS/);
    assert.doesNotMatch(indexSource, /parseSurpriseEventProposal/);
});

test('cold Surprise-event feature does not own chat persistence, send, or strict review', () => {
    const source = readFileSync(new URL('../features/surpriseEventGeneration.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /memoryManager|sendMessage|getResponse|startJevShadowEvaluation|strictReview|reviewPipeline|localStorage|sessionStorage|indexedDB|Supabase/);
});

test('experienceEngine preserves its public relationship and presentation API by re-export', () => {
    const source = readFileSync(new URL('../experienceEngine.ts', import.meta.url), 'utf8');

    assert.match(source, /from ['"]\.\/relationshipState\.js['"]/);
    assert.match(source, /from ['"]\.\/surpriseEventPresentation\.js['"]/);
});
