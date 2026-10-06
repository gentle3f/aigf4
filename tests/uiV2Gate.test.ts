import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../ui-v2.css', import.meta.url), 'utf8');

test('UI v2 is opt-in through the ui=v2 query parameter', () => {
    assert.match(html, /params\.get\('ui'\) === 'v2'/);
    assert.match(html, /document\.documentElement\.dataset\.wetappUi = 'v2'/);
    assert.match(html, /href="\/ui-v2\.css"/);
});

test('UI v2 stylesheet is gated and does not redefine unscoped production surfaces', () => {
    assert.match(css, /html\[data-wetapp-ui="v2"\]/);
    const ruleStarts = [...css.matchAll(/(^|\n)([^@\/][^\n{]*)\{/g)]
        .map(match => match[2].trim())
        .filter(selector => selector && !selector.startsWith('from') && !selector.startsWith('to'));
    const unsafe = ruleStarts.filter(selector =>
        !selector.includes('html[data-wetapp-ui="v2"]')
        && !selector.startsWith(':root')
        && !selector.startsWith('0%')
        && !selector.startsWith('30%')
        && !selector.startsWith('60%')
        && !selector.startsWith('100%')
        && !selector.startsWith('@media')
    );
    assert.deepEqual(unsafe, []);
});
