import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readVeniceSse } from '../veniceStream.js';

const encoder = new TextEncoder();
const fromBytes = (pieces: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (const bytes of pieces) controller.enqueue(bytes);
    controller.close();
  },
});
const fromText = (text: string) => fromBytes([encoder.encode(text)]);

test('Venice SSE assembles deltas, UTF-8 split packets, and the usage-only chunk', async () => {
  const sse = [
    'data: {"model":"deepseek-v3","choices":[{"delta":{"reasoning_content":"private thought","content":"你"}}]}\r\n\r\n',
    'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\r\n\r\n',
    'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2}}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ].join('');
  const bytes = encoder.encode(sse);
  const split = sse.indexOf('你');
  const rawIndex = encoder.encode(sse.slice(0, split)).length + 1;
  const fragments = [bytes.subarray(0, 3), bytes.subarray(3, rawIndex), bytes.subarray(rawIndex, rawIndex + 2), bytes.subarray(rawIndex + 2)];
  const updates: string[] = [];
  const result = await readVeniceSse(fromBytes(fragments), value => updates.push(value));
  assert.equal(result.text, '你好');
  assert.deepEqual(updates, ['你', '你好']);
  assert.equal(result.model, 'deepseek-v3');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.usage?.prompt_tokens, 8);
  assert.equal(result.usage?.completion_tokens, 2);
});

test('Venice SSE reports in-band upstream errors', async () => {
  const error = 'data: {"error":{"code":"model_overloaded","message":"Try again later"}}\n\ndata: [DONE]\n\n';
  await assert.rejects(() => readVeniceSse(fromText(error), () => undefined), /Try again later/);
});

test('Venice SSE does not treat incomplete transmission as a completed answer', async () => {
  const incomplete = 'data: {"choices":[{"delta":{"content":"half"}}]}\n\n';
  await assert.rejects(() => readVeniceSse(fromText(incomplete), () => undefined), /before \[DONE\]/);
});

test('Venice SSE ignores reasoning text and honours provider filters', async () => {
  const error = 'data: {"type":"content_filter_error","code":"content_blocked_by_provider"}\n\ndata: [DONE]\n\n';
  await assert.rejects(() => readVeniceSse(fromText(error), () => undefined), /interrupted/);
});

test('Assistant only uses SSE and keeps previews out of persisted chat history', () => {
  const app = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../api/venice-chat.js', import.meta.url), 'utf8');
  assert.match(app, /onTextDelta: assistantMode \? text => showAssistantStreamPreview\(request, text\)/);
  assert.match(app, /clearAssistantStreamPreview\(request\)/);
  assert.match(api, /req\.body\?\.stream === true/);
  assert.match(api, /res\.write\(chunk\)/);
  assert.match(api, /text\/event-stream/);
});
