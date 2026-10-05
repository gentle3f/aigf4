import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Persona list refresh after a reply is deferred until after at least one paint', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /const schedulePersonaListRefreshAfterPaint = \(\) => \{[^]*window\.requestAnimationFrame\(\(\) => \{[^]*window\.requestAnimationFrame\(\(\) => \{/u);
    assert.match(source, /const scheduledVersion = personaListRenderVersion;[^]*if \(personaListRenderVersion !== scheduledVersion\) return;[^]*renderPersonaList\(\)/u);
});

test('Final reply leaves synchronous critical work before scheduling the sidebar rebuild', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const completeIndex = source.indexOf("completeChatPerformanceTurn('response:final-visible');");
    const finishIndex = source.lastIndexOf('finishChatRequest(request);', completeIndex);
    const deferredIndex = source.indexOf('schedulePersonaListRefreshAfterPaint();', completeIndex);

    assert.ok(finishIndex >= 0);
    assert.ok(completeIndex > finishIndex);
    assert.ok(deferredIndex > completeIndex);

    const finalization = source.slice(finishIndex, deferredIndex);
    assert.doesNotMatch(finalization, /renderPersonaList\(\)/);
    assert.doesNotMatch(finalization, /response:persona-list-render/);
});

test('Any intervening synchronous list render invalidates the deferred refresh', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /const renderPersonaList = \(\) => \{\s*personaListRenderVersion \+= 1;/u);
    assert.match(source, /if \(personaListRenderVersion !== scheduledVersion\) return;/);
});
