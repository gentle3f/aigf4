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

test('UI v2 chat actions are grouped into meaningful sections instead of one long list', () => {
    for (const title of ['互動', '角色', '場景', '記憶', '媒體', '工具', '管理']) {
        assert.match(appSource, new RegExp(`title: '${title}'`));
    }
    for (const id of [
        'interaction-preferences-menu-btn',
        'director-menu-btn',
        'continue-scene-menu-btn',
        'scene-wardrobe-menu-btn',
        'usage-diagnostics-menu-btn',
        'performance-diagnostics-menu-btn',
        'jev-shadow-menu-btn',
    ]) {
        assert.match(appSource, new RegExp(id));
    }
    assert.match(appSource, /layout\.className = 'v2-more-options-layout'/);
    assert.match(css, /\.v2-more-options-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /width: 390px !important/);
});

test('UI v2 chat action sheet has an explicit sticky close control', () => {
    assert.match(appSource, /closeButton\.className = 'v2-more-options-close'/);
    assert.match(appSource, /closeButton\.textContent = '×'/);
    assert.match(appSource, /moreOptionsMenu\.classList\.add\('hidden'\)/);
    assert.match(css, /\.v2-more-options-heading[\s\S]*position: sticky !important/);
    assert.match(css, /\.v2-more-options-close[\s\S]*width: 36px !important/);
});

test('UI v2 home separates creative tools from the conversation list', () => {
    assert.match(appSource, /const ensureUiV2HomeStructure = \(\) =>/);
    assert.match(appSource, /quickGrid\.append\(imageStudioEntry, videoStudioEntry\)/);
    assert.match(appSource, /searchWrap\.insertAdjacentElement\('afterend', quickSection\)/);
    assert.match(appSource, /pinnedLabel\.textContent = '助手'/);
    assert.match(appSource, /recentLabel\.textContent = '最近'/);
    assert.match(appSource, /is-group-conversation/);
    assert.match(appSource, /is-persona-conversation/);
    assert.match(css, /\.v2-home-quick-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.is-group-conversation \.conversation-line strong::after[\s\S]*content: "群組"/);
});
