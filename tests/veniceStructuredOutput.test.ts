import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ensureStructuredOutputJsonInstruction,
    type VeniceJsonSchemaResponseFormat,
    type VeniceMessage,
} from '../venice.js';

const responseFormat: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'test_result',
        strict: true,
        schema: { type: 'object', additionalProperties: false, properties: {} },
    },
};

test('adds the required JSON instruction to structured-output messages without mutating input', () => {
    const messages: VeniceMessage[] = [
        { role: 'system', content: 'Analyze this recurring character.' },
        { role: 'user', content: 'Observed conversation evidence.' },
    ];
    const prepared = ensureStructuredOutputJsonInstruction(messages, responseFormat);

    assert.notEqual(prepared, messages);
    assert.equal(messages[0].content, 'Analyze this recurring character.');
    assert.match(String(prepared[0].content), /JSON/iu);
});

test('keeps a request unchanged when JSON is already mentioned', () => {
    const messages: VeniceMessage[] = [
        { role: 'system', content: 'Return one valid JSON object.' },
        { role: 'user', content: 'Analyze this character.' },
    ];
    assert.equal(ensureStructuredOutputJsonInstruction(messages, responseFormat), messages);
});

test('prepends a system instruction when a structured request has no system message', () => {
    const messages: VeniceMessage[] = [{ role: 'user', content: 'Analyze this character.' }];
    const prepared = ensureStructuredOutputJsonInstruction(messages, responseFormat);

    assert.equal(prepared[0].role, 'system');
    assert.match(String(prepared[0].content), /JSON/iu);
    assert.equal(prepared[1], messages[0]);
});
