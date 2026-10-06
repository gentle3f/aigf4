import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
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

test('UI v2 mobile usability refinements stay visual-only', () => {
    assert.match(css, /\.conversation-delete-button\s*\{[\s\S]*display: none !important/);
    assert.match(css, /#composer-camera-button\s*\{[\s\S]*display: none !important/);
    assert.match(css, /#chat-header-avatar-container > \.group-avatar-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /group-avatar-grid > span > img[\s\S]*object-fit: cover !important/);
    assert.match(css, /#more-options-menu[\s\S]*top: calc\(8px \+ env\(safe-area-inset-top\)\)[\s\S]*bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\)[\s\S]*overflow-y: auto !important/);
});

test('UI v2 mobile chat menu is portaled to the viewport instead of trapped inside the blurred header', () => {
    assert.match(appSource, /const shouldPortalUiV2MoreOptionsMenu = \(\) =>/);
    assert.match(appSource, /document\.documentElement\.dataset\.wetappUi === 'v2'/);
    assert.match(appSource, /window\.matchMedia\('\(max-width: 767px\)'\)\.matches/);
    assert.match(appSource, /document\.body\.appendChild\(moreOptionsMenu\)/);
    assert.match(appSource, /syncUiV2MoreOptionsMenuPortal\(\);\s*moreOptionsMenu\.classList\.toggle\('hidden'\)/);
});
