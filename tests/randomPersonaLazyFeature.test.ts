import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Random persona catalog stays cold behind the shared seed provider', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const seedSource = readFileSync(new URL('../features/randomPersonaSeed.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/randomPersonaSeed\.js['"]\)/);
    assert.doesNotMatch(indexSource, /from ['"]\.\/randomPersona\.js['"]/);
    assert.match(seedSource, /from ['"]\.\.\/randomPersona\.js['"]/);
    assert.match(seedSource, /createRandomAdultFemalePersona/);
    assert.match(indexSource, /const createFreshRandomPersona = async/);
});

test('Random Recruit workflow is lazy loaded only from explicit creation', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const recruitSource = readFileSync(new URL('../features/randomRecruit.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/randomRecruit\.js['"]\)/);
    assert.match(indexSource, /randomRecruitBtn\.addEventListener\('click',[\s\S]*randomlyRecruitNewPersona\(\)/);
    assert.doesNotMatch(indexSource, /random-recruit-status/);
    assert.match(recruitSource, /random-recruit-status/);
    assert.match(recruitSource, /requestImage/);
    assert.match(recruitSource, /saveAvatar/);
    assert.match(recruitSource, /import \{ optimizeAvatarDataUrl \} from ['"]\.\/avatarImage\.js['"]/);
    assert.match(recruitSource, /optimizeAvatarDataUrl\(result\.blobs\[0\]\)/);
    assert.doesNotMatch(recruitSource, /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|roomManager|sendMessage/);
});

test('Mimic manual randomize awaits the same cold random-persona seed provider', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const mimicSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /createRandomPersonaSeed: async \(\) =>/);
    assert.match(mimicSource, /createRandomPersonaSeed: \(\) => MimicPersonaSeed \| Promise<MimicPersonaSeed>/);
    assert.match(mimicSource, /const fillRandomManualFields = async/);
    assert.match(mimicSource, /await getDependencies\(\)\.createRandomPersonaSeed\(\)/);
});
