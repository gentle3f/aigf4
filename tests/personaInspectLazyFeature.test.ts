import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('persona inspect stays cold behind explicit God Mode commands', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/personaInspect.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /\/persona\|setting\|人格\|設定\/iu\.test\(userMessage\)/);
    assert.match(indexSource, /import\(['"]\.\/features\/personaInspect\.js['"]\)/);
    assert.doesNotMatch(indexSource, /show current persona|目前人格|當前人格/);
    assert.match(featureSource, /show current persona/);
    assert.match(featureSource, /目前人格/);
    assert.match(featureSource, /formatPersonaDetails/);
    assert.doesNotMatch(
        featureSource,
        /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|roomManager|appendMessage|buildGroupSystemPrompt/,
    );
});
