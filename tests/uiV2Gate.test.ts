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
        && !/^\d+%$/.test(selector)
        && !selector.startsWith('@media')
        && !selector.startsWith('@keyframes')
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

test('UI v2 gives one-on-one character replies an open conversational surface', () => {
    assert.match(appSource, /const isCharacterConversationReply = sender === 'bot'/);
    assert.match(appSource, /character-chat-turn/);
    assert.match(appSource, /character-message-surface/);
    assert.match(appSource, /character-message-speaker/);
    assert.match(css, /\.character-message-surface[\s\S]*background: transparent !important/);
    assert.match(css, /\.character-message-surface[\s\S]*box-shadow: none !important/);
    assert.match(css, /\.character-message-speaker[\s\S]*color: var\(--v2-accent\) !important/);
});

test('UI v2 uses stable persona-driven accents without touching Group reply logic', () => {
    assert.match(appSource, /UI_V2_ACCENT_PALETTES/);
    assert.match(appSource, /applyUiV2ConversationTheme/);
    assert.match(appSource, /room\?\.title \|\| currentPersona\?\.name \|\| key/);
    assert.match(css, /rgba\(var\(--v2-aura-1/);
    assert.match(css, /rgba\(var\(--v2-aura-2/);
});

test('UI v2 adds native-feel motion only to new UI events', () => {
    assert.match(appSource, /v2-message-enter/);
    assert.match(appSource, /v2-view-enter/);
    assert.match(appSource, /v2-composer-send/);
    assert.match(css, /wetappV2MessageIn/);
    assert.match(css, /wetappV2ViewIn/);
    assert.match(css, /wetappV2BottomSheetIn/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});

test('UI v2 supports a persisted warm dark mode', () => {
    assert.match(html, /wetappUiV2Theme/);
    assert.match(appSource, /ui-v2-theme-toggle/);
    assert.match(appSource, /wetappUiV2Theme/);
    assert.match(css, /data-wetapp-theme="dark"/);
    assert.match(css, /Warm dark, deliberately not cyber-black/);
});

test('UI v2 Home gives the latest conversation a featured identity card', () => {
    assert.match(appSource, /v2-featured-conversation-shell/);
    assert.match(appSource, /v2-featured-conversation/);
    assert.match(css, /\.v2-featured-conversation[\s\S]*min-height: 88px !important/);
});

test('UI v2 dark mode keeps Group dialogue and narration readable', () => {
    assert.match(css, /data-wetapp-theme="dark"\] \.group-story-dialogue[\s\S]*color: var\(--v2-ink\) !important/);
    assert.match(css, /data-wetapp-theme="dark"\] \.group-story-narration[\s\S]*color: #b8afa7 !important/);
    assert.match(css, /group-story-line > \.group-speaker-name[\s\S]*color: var\(--v2-accent\) !important/);
    assert.match(css, /data-wetapp-theme="dark"\] \.character-message-surface > p[\s\S]*color: var\(--v2-ink\) !important/);
});

test('UI v2 dark mode keeps Home and creation menu actions readable', () => {
    assert.match(css, /data-wetapp-theme="dark"\] #home-menu button[\s\S]*color: var\(--v2-ink\) !important/);
    assert.match(css, /data-wetapp-theme="dark"\] \.new-chat-menu button[\s\S]*color: var\(--v2-ink\) !important/);
});

test('UI v2 composer grows before it scrolls and keeps a complete internal scrollbar', () => {
    assert.match(appSource, /const syncMessageInputHeight = \(\) =>/);
    assert.match(appSource, /const maxHeight = 136/);
    assert.match(appSource, /messageInput\.style\.setProperty\('height', 'auto', 'important'\)/);
    assert.match(appSource, /messageInput\.style\.overflowY = messageInput\.scrollHeight > maxHeight \? 'auto' : 'hidden'/);
    assert.match(css, /#message-input[\s\S]*max-height: 136px !important/);
    assert.match(css, /#message-input::-webkit-scrollbar-track[\s\S]*margin-block: 8px/);
});

test('UI v2 loading and auditing states never force the chat back to the bottom', () => {
    assert.doesNotMatch(
        appSource,
        /if \(showLoadingIndicator\)[\s\S]{0,700}chatContainer\.scrollTop = chatContainer\.scrollHeight/
    );
    assert.match(css, /#loading-indicator[\s\S]*position: absolute !important/);
    assert.match(css, /#loading-indicator[\s\S]*pointer-events: none !important/);
});


test('UI v2 immersive scene mode is persisted, Group-only, and built from existing room state', () => {
    assert.match(appSource, /UI_V2_IMMERSIVE_SCENE_STORAGE_KEY = 'wetappUiV2ImmersiveScene'/);
    assert.match(appSource, /const ensureUiV2ImmersiveSceneStructure = \(\) =>/);
    assert.match(appSource, /const renderUiV2ImmersiveSceneChrome =/);
    assert.match(appSource, /room\.scene\.location/);
    assert.match(appSource, /room\.scene\.presentMemberIds/);
    assert.match(appSource, /room\.scene\.summary/);
    assert.match(appSource, /room\.scene\.unresolved/);
    assert.match(appSource, /document\.documentElement\.dataset\.wetappScene = enabled \? 'immersive' : 'standard'/);
    assert.match(css, /data-wetapp-scene="immersive"/);
    assert.match(css, /\.v2-immersive-scene-shell/);
    assert.match(css, /\.v2-scene-cast/);
});

test('UI v2 immersive Group replies stage only live lines and expose speaker state without relying on color alone', () => {
    assert.match(appSource, /const stageImmersiveReply = target === chatContainer/);
    assert.match(appSource, /line\.classList\.add\('v2-scene-reveal-line'\)/);
    assert.match(appSource, /immersiveGroupStageSpeakerIds\.push/);
    assert.match(appSource, /setUiV2SceneActiveSpeaker/);
    assert.match(css, /\.v2-scene-cast-person\.is-speaking::after[\s\S]*content: "說話中"/);
    assert.match(css, /wetappV2SceneLineIn/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.v2-scene-reveal-line/);
});
