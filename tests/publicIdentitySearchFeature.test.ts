import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('public identity search stays behind a lazy resolution service', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const searchSource = readFileSync(new URL('../features/publicIdentitySearch.ts', import.meta.url), 'utf8');
    const resolutionSource = readFileSync(new URL('../features/publicIdentityResolution.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/publicIdentityResolution\.js['"]\)/);
    assert.doesNotMatch(indexSource, /\bsearchPublicIdentities\b|\bloadPublicIdentityMedia\b|\bbuildConfirmedPublicIdentity\b/);
    assert.match(resolutionSource, /import\(['"]\.\/publicIdentitySearch\.js['"]\)/);
    assert.match(resolutionSource, /buildConfirmedPublicIdentity/);
    assert.match(searchSource, /searchPublicIdentities\(query, controller\.signal\)/);
    assert.match(searchSource, /loadPublicIdentityMedia\(candidate, controller\.signal\)/);
    assert.match(searchSource, /buildConfirmedIdentity\(candidate, selectedPublicIdentityMedia\)/);
    assert.match(searchSource, /closePublicIdentityModalBtn\.addEventListener/);
    assert.match(searchSource, /confirmPublicIdentityBtn\.addEventListener/);
});

test('public identity lookup UI owns no model or chat behaviour', () => {
    const searchSource = readFileSync(new URL('../features/publicIdentitySearch.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(searchSource, /runMimicModelCall|generateVeniceText|startChat|memoryManager|RoomManager|strictReview|Jev|wardrobe/i);
});

test('public identity resolution model work is cold and shared by main and Mimic', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const mimicSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');
    const resolutionSource = readFileSync(new URL('../features/publicIdentityResolution.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /requestResolvedPublicIdentity/);
    assert.match(mimicSource, /import\(['"]\.\/publicIdentityResolution\.js['"]\)/);
    assert.doesNotMatch(indexSource, /You convert one user-confirmed Wikipedia result/);
    assert.doesNotMatch(mimicSource, /You convert one user-confirmed Wikipedia result/);
    assert.match(resolutionSource, /You convert one user-confirmed Wikipedia result/);
    assert.match(resolutionSource, /generateVeniceText/);
    assert.doesNotMatch(resolutionSource, /startChat|memoryManager|RoomManager|strictReview|Jev|wardrobe/i);
});
