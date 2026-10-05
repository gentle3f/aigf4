import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Venice image transport is lazy loaded behind explicit image workflows', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /import\(['"]\.\/veniceImage\.js['"]\)/);
    assert.doesNotMatch(source, /import \{[^}]*requestVeniceImage[^}]*\} from ["']\.\/veniceImage\.js["']/s);
    assert.doesNotMatch(source, /import \{[^}]*listVeniceImageModels[^}]*\} from ["']\.\/veniceImage\.js["']/s);
    assert.match(source, /const loadVeniceImageModule =/);
    assert.match(source, /const listVeniceImageModels = async/);
    assert.match(source, /const requestVeniceImage = async/);
});

test('Venice image model defaults live in a tiny policy module shared by the cold transport', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const policySource = readFileSync(new URL('../veniceImagePolicy.ts', import.meta.url), 'utf8');
    const transportSource = readFileSync(new URL('../veniceImage.ts', import.meta.url), 'utf8');

    assert.match(source, /from ["']\.\/veniceImagePolicy\.js["']/);
    assert.match(policySource, /VENICE_IMAGE_GENERATE_MODEL/);
    assert.match(policySource, /VENICE_IMAGE_EDIT_MODEL/);
    assert.match(transportSource, /from ['"]\.\/veniceImagePolicy\.js['"]/);
});
