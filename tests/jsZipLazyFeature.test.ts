import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadJsZip } from '../jsZipLoader.js';

test('JSZip is not eagerly loaded by the app shell', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const fileManagerSource = readFileSync(new URL('../fileManager.ts', import.meta.url), 'utf8');
    const albumSource = readFileSync(new URL('../features/albumUi.ts', import.meta.url), 'utf8');
    const mimicSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(html, /jszip/i);
    assert.doesNotMatch(indexSource, /declare (?:var|const) JSZip/);
    assert.match(fileManagerSource, /await loadJsZip\(\)/);
    assert.match(albumSource, /await loadJsZip\(\)/);
    assert.match(mimicSource, /await loadJsZip\(\)/);
});

test('JSZip loader reuses an already available global API without requiring the DOM', async () => {
    const previous = (globalThis as typeof globalThis & { JSZip?: unknown }).JSZip;
    const sentinel = class FakeJsZip {};
    (globalThis as typeof globalThis & { JSZip?: unknown }).JSZip = sentinel;

    try {
        assert.equal(await loadJsZip(), sentinel);
    } finally {
        if (previous === undefined) {
            delete (globalThis as typeof globalThis & { JSZip?: unknown }).JSZip;
        } else {
            (globalThis as typeof globalThis & { JSZip?: unknown }).JSZip = previous;
        }
    }
});
