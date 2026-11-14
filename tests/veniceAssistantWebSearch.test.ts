import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Venice web search, scraping and citations are enabled only per opt-in', () => {
  const venice = read('../venice.ts');
  assert.match(venice, /enableWebSearch\?: boolean/);
  assert.match(venice, /enableWebSearch = false/);
  assert.match(venice, /enable_web_search: enableWebSearch \? 'auto' : 'off'/);
  assert.match(venice, /enable_web_scraping: enableWebSearch/);
  assert.match(venice, /enable_web_citations: enableWebSearch/);
});

test('only the pinned Venice AI assistant activates the web lookup path', () => {
  const app = read('../index.tsx');
  const settings = read('../appSettings.ts');
  assert.match(app, /enableWebSearch: assistantMode && isVeniceAssistantWebSearchEnabled\(\)/);
  assert.match(app, /assistantWebSearchButton\.textContent = enabled/);
  assert.match(app, /assistantWebSearchButton\.addEventListener\('click'/);
  assert.match(app, /veniceAssistantWebSearchV1/);
  assert.match(settings, /veniceAssistantWebSearchV1/);
});

test('SSE remains the Venice AI path when web search is available', () => {
  const app = read('../index.tsx');
  assert.match(app, /onTextDelta: assistantMode \? text => showAssistantStreamPreview/);
  assert.match(app, /CHAT_SLOW_MODEL_ATTEMPT_TIMEOUT_MS = 265_000/);
});
