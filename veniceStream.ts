/** Parse Venice's OpenAI-compatible SSE response into one complete answer. */
export type VeniceStreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

export type VeniceStreamCompletion = {
  model?: string;
  text: string;
  finishReason: string | null;
  usage?: VeniceStreamUsage;
};

export async function readVeniceSse(
  body: ReadableStream<Uint8Array> | null,
  onTextDelta: (text: string) => void,
): Promise<VeniceStreamCompletion> {
  if (!body) throw new Error('Venice stream has no response body.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const result: VeniceStreamCompletion = { text: '', finishReason: null };
  let buffer = '';
  let eventLines: string[] = [];
  let receivedDone = false;

  const consumeEvent = () => {
    if (!eventLines.length) return;
    const data = eventLines
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
    eventLines = [];
    if (!data) return;
    if (data.trim() === '[DONE]') {
      receivedDone = true;
      return;
    }

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch {
      throw new Error('Malformed Venice SSE event.');
    }

    if (message.error) {
      const failure = typeof message.error === 'object'
        ? message.error as { message?: string; code?: string }
        : { message: String(message.error) };
      throw new Error(failure.message || failure.code || 'Venice streaming error.');
    }
    if (message.type === 'content_filter_error') {
      throw new Error('Venice provider interrupted the response.');
    }
    if (typeof message.model === 'string') result.model = message.model;
    if (message.usage && typeof message.usage === 'object') {
      result.usage = message.usage as VeniceStreamUsage;
    }

    const choices = Array.isArray(message.choices) ? message.choices : [];
    const choice = choices[0] as
      | { delta?: { content?: string }; finish_reason?: string | null }
      | undefined;
    if (!choice) return; // Venice's terminal usage-only event has choices: [].
    if (typeof choice.finish_reason === 'string') {
      result.finishReason = choice.finish_reason;
    }
    const delta = choice.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      result.text += delta;
      onTextDelta(result.text);
    }
  };

  const consumeLines = () => {
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (!line) consumeEvent();
      else eventLines.push(line);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeLines();
      if (receivedDone) break;
    }
    buffer += decoder.decode();
    consumeLines();
    if (buffer) eventLines.push(buffer.replace(/\r$/, ''));
    consumeEvent();
    if (!receivedDone) throw new Error('Venice stream ended before [DONE].');
    return result;
  } finally {
    // Release the stream reader even on cancellation or mid-stream errors.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
