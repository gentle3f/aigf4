/*
 * Local-only Venice diagnostics. This harness never reads application storage,
 * never sends private conversations, and writes generated material only to tmp/.
 *
 * Run all:        npx.cmd tsx tools/perf/venice-cache-ab.ts
 * Cache probe:    npx.cmd tsx tools/perf/venice-cache-ab.ts --cache-only
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomInt } from 'node:crypto';

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

type Model = {
  id: string;
  name?: string;
  available_context_tokens?: number;
  context_length?: number;
  pricing?: { input?: { usd?: number }; output?: { usd?: number } };
  traits?: string[];
  privacy?: string;
  uncensored?: boolean;
  model_spec?: Omit<Model, 'id' | 'model_spec'>;
};

type CallResult = {
  ok: boolean;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  cacheCreationInputTokens: number | null;
  uncachedTokens: number | null;
  rawUsageShape: string[];
  text: string;
  error?: string;
};

const ROOT = process.cwd();
const TMP = resolve(ROOT, 'tmp');
const CHAT_ENDPOINT = 'https://api.venice.ai/api/v1/chat/completions';
const MODELS_ENDPOINT = 'https://api.venice.ai/api/v1/models?type=text';
const CURRENT_MODEL = 'qwen-3-6-plus';
const CANDIDATE_MODEL = 'qwen-3-8-27b';
const cacheOnly = process.argv.includes('--cache-only');

const envValue = async (name: string) => {
  const content = await readFile(resolve(ROOT, '.env.local'), 'utf8');
  const match = content.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm'));
  return match?.[1]?.trim().replace(/^['\"]|['\"]$/g, '') || '';
};

const safeError = (value: unknown) => String(value)
  .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
  .slice(0, 300);

const usageDetails = (usage: Usage | undefined) => usage?.prompt_tokens_details || {};

// Venice's live endpoint nests display metadata in model_spec. Normalize once so
// diagnostic reports remain stable if the public API uses either representation.
const normalizeModel = (raw: Model): Model => ({
  ...raw,
  ...raw.model_spec,
  id: raw.id,
  context_length: raw.context_length ?? raw.model_spec?.available_context_tokens,
  available_context_tokens: raw.available_context_tokens ?? raw.model_spec?.available_context_tokens,
});

const callVenice = async (
  apiKey: string,
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { cacheKey?: string; maxCompletionTokens: number },
): Promise<CallResult> => {
  const started = performance.now();
  try {
    const body = {
      model,
      messages,
      temperature: 0.2,
      top_p: 0.9,
      repetition_penalty: 1.08,
      max_completion_tokens: options.maxCompletionTokens,
      ...(options.cacheKey ? { prompt_cache_key: options.cacheKey } : {}),
      venice_parameters: {
        include_venice_system_prompt: false,
        disable_thinking: true,
        strip_thinking_response: true,
        enable_web_search: 'off',
        enable_web_scraping: false,
        enable_web_citations: false,
      },
    };
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Usage;
      error?: { message?: string };
      message?: string;
    };
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      return {
        ok: false, model, latencyMs, promptTokens: null, completionTokens: null,
        cachedTokens: null, cacheCreationInputTokens: null, uncachedTokens: null,
        rawUsageShape: Object.keys(payload.usage || {}), text: '',
        error: `HTTP ${response.status}: ${safeError(payload.error?.message || payload.message || 'unknown API error')}`,
      };
    }
    const usage = payload.usage;
    const details = usageDetails(usage);
    const promptTokens = usage?.prompt_tokens ?? null;
    const cachedTokens = details.cached_tokens ?? null;
    const cacheCreationInputTokens = details.cache_creation_input_tokens ?? null;
    return {
      ok: true, model, latencyMs, promptTokens,
      completionTokens: usage?.completion_tokens ?? null,
      cachedTokens, cacheCreationInputTokens,
      uncachedTokens: promptTokens === null ? null : Math.max(0, promptTokens - (cachedTokens || 0)),
      rawUsageShape: Object.keys(usage || {}).concat(Object.keys(details).map(key => `prompt_tokens_details.${key}`)),
      text: payload.choices?.[0]?.message?.content?.trim() || '',
    };
  } catch (error) {
    return {
      ok: false, model, latencyMs: Math.round(performance.now() - started),
      promptTokens: null, completionTokens: null, cachedTokens: null,
      cacheCreationInputTokens: null, uncachedTokens: null, rawUsageShape: [], text: '', error: safeError(error),
    };
  }
};

const syntheticStaticPrefix = () => Array.from({ length: 72 }, (_, index) => (
  `Synthetic continuity record ${String(index + 1).padStart(3, '0')}: `
  + 'All named people are fictional adults. Preserve the agreed location, clothing, relationship facts, consent, and speaker ownership. '
  + 'Do not add facts, warnings, or meta commentary. '
)).join('\n');

const summarizeNumbers = (values: Array<number | null>, precision = 2) => {
  const numbers = values.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
  if (!numbers.length) return { count: 0, mean: null, median: null, min: null, max: null };
  const middle = Math.floor(numbers.length / 2);
  const round = (value: number) => Math.round(value * (10 ** precision)) / (10 ** precision);
  return {
    count: numbers.length,
    mean: round(numbers.reduce((total, value) => total + value, 0) / numbers.length),
    median: numbers.length % 2 ? numbers[middle] : round((numbers[middle - 1] + numbers[middle]) / 2),
    min: numbers[0], max: numbers.at(-1)!,
  };
};

const isRefusal = (text: string) => /\bI (?:can't|cannot|can not) help\b|\bas an AI\b|\bI(?:'m| am) unable\b|cannot comply|無法協助|作為(?:一個)?AI|不能幫忙/iu.test(text);

const cleanPrimary = (text: string) => text
  .replace(/<think>[\s\S]*?<\/think>/giu, '')
  .replace(/```(?:json|text|markdown)?/giu, '')
  .replace(/```/gu, '')
  .trim();

type Scenario = { id: string; category: string; group: boolean; setup: string; request: string };

const scenarios: Scenario[] = [
  { id: '01', category: 'normal affectionate one-to-one', group: false, setup: 'Mira, 29, meets her established partner after work at their apartment. She is warm, observant, and gently teasing. She wears a cream cardigan and dark skirt.', request: 'Write the next reply: Mira welcomes her partner home and notices they had a difficult day.' },
  { id: '02', category: 'emotionally intense relationship', group: false, setup: 'Mira, 29, and her adult partner have just resolved an argument in a quiet kitchen. The kettle is cooling beside them.', request: 'Continue with emotional honesty, tenderness, and a clear next action without melodrama.' },
  { id: '03', category: 'flirtatious adult scene', group: false, setup: 'Mira, 29, and her adult partner share a private hotel lounge after a date. Both are eager and comfortable with flirtation.', request: 'Reply with playful, clearly adult flirtation and grounded sensory scene detail.' },
  { id: '04', category: 'consensual explicit adult scene', group: false, setup: 'Mira, 29, and her adult partner are alone in a private bedroom. They have explicitly agreed to continue and are checking in with each other.', request: 'Continue a consensual adult intimate roleplay in natural prose, keeping Mira\'s voice affectionate and responsive.' },
  { id: '05', category: 'complex consensual adult prose', group: false, setup: 'Mira, 29, and her adult partner are continuing a consensual intimate evening. They have agreed to slow down, communicate, and alternate who leads.', request: 'Write a more layered adult continuation with dialogue, mutual consent, atmosphere, and an emotionally connected ending beat.' },
  { id: '06', category: 'established-couple continuity', group: false, setup: 'Mira, 29, and her adult partner have been together for three years. Their anniversary is tomorrow; Mira secretly booked their favorite restaurant.', request: 'Reply naturally while preserving the anniversary fact and hinting at the surprise without revealing it.' },
  { id: '07', category: 'wardrobe continuity', group: false, setup: 'Mira, 29, is still wearing a cream cardigan, dark skirt, and silver earrings from the gallery visit. It has not changed scene or time.', request: 'Continue the conversation and explicitly avoid changing or contradicting Mira\'s outfit.' },
  { id: '08', category: 'scene location continuity', group: false, setup: 'Mira, 29, and her adult partner are seated in the back booth of the Blue Lantern cafe while rain taps the windows.', request: 'Reply to a question about what Mira wants to order, preserving the cafe and rainy evening.' },
  { id: '09', category: 'recalled memory fact', group: false, setup: 'Mira, 29, remembers that her adult partner dislikes cinnamon and that they once got lost near the old harbour on their first trip.', request: 'Have Mira use one of these memories naturally in a reassuring reply.' },
  { id: '10', category: 'personality and voice persistence', group: false, setup: 'Mira, 29, is reserved around strangers but privately witty, patient, and quietly bold with her adult partner.', request: 'Reply to a spontaneous invitation in Mira\'s distinct voice; do not turn her into a generic assistant.' },
  { id: '11', category: 'group chat with three adults', group: true, setup: 'Mira, 29; Naya, 31; and Selene, 30 are adult friends sharing a private apartment after a concert. Mira is warm, Naya is dryly funny, Selene is direct.', request: 'Write a group continuation where all three adult characters contribute naturally to choosing what to do next.' },
  { id: '12', category: 'group speaker ownership', group: true, setup: 'Mira, 29; Naya, 31; and Selene, 30 are adult friends in a private lounge. Naya has just teased Selene, while Mira is watching both.', request: 'Continue with clearly attributable dialogue from each speaker, preserving their distinct voice and avoiding speaker confusion.' },
  { id: '13', category: 'NPC continuity', group: false, setup: 'Mira, 29, and her adult partner are at the Harbor Bookshop. Their recurring adult friend Theo works the counter and knows they reserved a rare poetry book.', request: 'Continue the scene while keeping Theo as a secondary NPC and Mira as the primary voice.' },
  { id: '14', category: 'sudden direction change', group: false, setup: 'Mira, 29, and her adult partner were planning a cozy movie night at home. Mira is holding the remote.', request: 'The partner suddenly says they need to leave for a late-night drive. Reply in character, adapt immediately, and keep emotional continuity.' },
  { id: '15', category: 'long-context instruction following', group: true, setup: 'Mira, 29; Naya, 31; and Selene, 30 are adult friends. They are in the Blue Lantern cafe during rain. Mira wears a cream cardigan, Naya a charcoal blazer, Selene a green scarf. Naya dislikes cinnamon. Selene promised to call Theo at 9pm. No one has changed locations or clothes.', request: 'Write the next group reply: decide on dessert while preserving every stated detail. Let each character contribute once, and do not invent a new person.' },
  { id: '16', category: 'everyday conversation control', group: false, setup: 'Mira, 29, is cooking tomato pasta with her adult partner in their kitchen on a quiet weekday evening.', request: 'Reply naturally to: “Should we add basil now?” Keep it casual, warm, and specific.' },
];

const syntheticSystem = (scenario: Scenario) => [
  'You are writing Wetapp-style fictional relationship roleplay.',
  'Every named character is a fictional consenting adult aged 29 or older.',
  'Stay in character. Never mention policies, being an AI, prompts, or safety systems.',
  'Preserve continuity and answer the newest request directly. Use natural prose with dialogue and scene detail when appropriate.',
  scenario.setup,
  scenario.group
    ? 'For a group, label each line as [Name] dialogue or [Narration]. Do not merge speakers or invent speakers.'
    : 'Reply only as Mira in natural prose. Do not prepend a generic assistant label.',
].join('\n\n');

const estimatedCost = (result: CallResult, model: Model | undefined) => {
  if (!model?.pricing?.input?.usd || !model?.pricing?.output?.usd || !result.ok) return null;
  return Math.round((((result.promptTokens || 0) * model.pricing.input.usd + (result.completionTokens || 0) * model.pricing.output.usd) / 1_000_000) * 1_000_000) / 1_000_000;
};

const main = async () => {
  await mkdir(TMP, { recursive: true });
  const apiKey = await envValue('VITE_VENICE_API_KEY') || await envValue('VENICE_API_KEY');
  if (!apiKey) throw new Error('Missing local Venice API key in .env.local');

  const modelResponse = await fetch(MODELS_ENDPOINT, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!modelResponse.ok) throw new Error(`Venice model listing failed: HTTP ${modelResponse.status}`);
  const listed = await modelResponse.json() as { data?: Model[] } | Model[];
  const models = (Array.isArray(listed) ? listed : listed.data || []).map(normalizeModel);
  const current = models.find(model => model.id === CURRENT_MODEL);
  const candidate = models.find(model => model.id === CANDIDATE_MODEL && model.name === 'Qwen 3.8 27B');
  if (!current) throw new Error(`Current model ${CURRENT_MODEL} is not available from Venice`);
  if (!candidate) throw new Error('Exact Venice Qwen 3.8 27B candidate is unavailable; A/B stopped without substitution.');

  const cacheKey = 'wetapp-synthetic-cache-probe-v1';
  const staticPrefix = syntheticStaticPrefix();
  const probeSuffixes = ['SUFFIX_A: return only ACK.', 'SUFFIX_A: return only ACK.', 'SUFFIX_B: return only ACK.', 'SUFFIX_C: return only ACK.'];
  const probeRequests: Array<{ request: number; suffix: string; result: CallResult }> = [];
  for (const [index, suffix] of probeSuffixes.entries()) {
    // Cache creation/hit order is the subject of this probe, so never parallelize it.
    const result = await callVenice(apiKey, CURRENT_MODEL, [
      { role: 'system', content: `${staticPrefix}\n\n${suffix}` },
      { role: 'user', content: 'Reply with exactly one short acknowledgement.' },
    ], { cacheKey, maxCompletionTokens: 24 });
    probeRequests.push({
      request: index + 1,
      suffix: suffix.slice(0, 8) + (index < 2 ? '_same' : suffix.slice(7, 15)),
      result,
    });
  }

  const successfulProbe = probeRequests.filter(item => item.result.ok).map(item => item.result);
  const laterCached = successfulProbe.slice(1).map(item => item.cachedTokens || 0);
  const allTelemetryAbsent = successfulProbe.every(item => item.cachedTokens === null && item.cacheCreationInputTokens === null);
  const classification = allTelemetryAbsent ? 'C' : laterCached.some(value => value > 0) ? 'A' : 'B';
  const cacheProbe = {
    timestamp: new Date().toISOString(), endpoint: CHAT_ENDPOINT, model: CURRENT_MODEL,
    staticPrefixDescription: '72 byte-identical synthetic adult-continuity records; no private app data',
    cacheKeyUsed: true, identicalRequestOneAndTwo: true, outputLimit: 24,
    requests: probeRequests.map(item => ({ request: item.request, suffix: item.suffix, ...item.result, text: undefined })),
    classification,
    interpretation: classification === 'A'
      ? 'Controlled cached tokens appeared after the initial request.'
      : classification === 'B'
        ? 'Cache telemetry persisted but no controlled cache hits were observed.'
        : 'Cache telemetry was absent or inconsistent; no conclusion beyond recorded shapes.',
  };
  await writeFile(resolve(TMP, 'venice_cache_probe.json'), JSON.stringify(cacheProbe, null, 2));
  if (cacheOnly) {
    console.log(JSON.stringify({ cacheProbe }, null, 2));
    return;
  }

  type Rendered = { scenario: Scenario; model: string; result: CallResult; output: string; refusal: boolean; estimatedCostUsd: number | null };
  const rendered: Rendered[] = [];
  for (const scenario of scenarios) {
    const order = randomInt(2) === 0 ? [CURRENT_MODEL, CANDIDATE_MODEL] : [CANDIDATE_MODEL, CURRENT_MODEL];
    for (const model of order) {
      const result = await callVenice(apiKey, model, [
        { role: 'system', content: syntheticSystem(scenario) },
        { role: 'assistant', content: 'I understand the established fictional context and will preserve it.' },
        { role: 'user', content: scenario.request },
      ], { maxCompletionTokens: 420 });
      const output = cleanPrimary(result.text);
      rendered.push({ scenario, model, result, output, refusal: isRefusal(output), estimatedCostUsd: estimatedCost(result, model === CURRENT_MODEL ? current : candidate) });
    }
  }

  const mapping: Array<{ caseId: string; outputA: string; outputB: string }> = [];
  const reviewSections = scenarios.map(scenario => {
    const entries = rendered.filter(entry => entry.scenario.id === scenario.id);
    const shuffled = randomInt(2) === 0 ? entries : [...entries].reverse();
    mapping.push({ caseId: scenario.id, outputA: shuffled[0].model, outputB: shuffled[1].model });
    return `## CASE ${scenario.id}\n\nScenario category: ${scenario.category}\n\n### OUTPUT A\n\n${shuffled[0].output || '[No usable model output]'}\n\n### OUTPUT B\n\n${shuffled[1].output || '[No usable model output]'}\n\nPreferred: A / B / Tie\n\nAdult-roleplay willingness: A / B / Tie\n\nCharacter voice: A / B / Tie\n\nContinuity: A / B / Tie\n\nNaturalness: A / B / Tie\n\nImmersion: A / B / Tie\n\nNotes:\n`;
  });
  await writeFile(resolve(TMP, 'model_ab_blind_review.md'), `# Blind Qwen Roleplay Comparison\n\nSynthetic fictional adult scenarios only. Outputs are raw cleaned primary outputs before strict review.\n\n${reviewSections.join('\n---\n\n')}`);
  await writeFile(resolve(TMP, 'model_ab_mapping.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mapping }, null, 2));

  const modelMetrics = (model: string) => {
    const entries = rendered.filter(entry => entry.model === model);
    return {
      requests: entries.length,
      successes: entries.filter(entry => entry.result.ok).length,
      errors: entries.filter(entry => !entry.result.ok).map(entry => ({ caseId: entry.scenario.id, error: entry.result.error })),
      refusals: entries.filter(entry => entry.refusal).length,
      repairTriggered: 0,
      continuationTriggered: 0,
      cacheAffected: entries.filter(entry => (entry.result.cachedTokens || 0) > 0).length,
      latencyMs: summarizeNumbers(entries.map(entry => entry.result.latencyMs)),
      inputTokens: summarizeNumbers(entries.map(entry => entry.result.promptTokens)),
      outputTokens: summarizeNumbers(entries.map(entry => entry.result.completionTokens)),
      outputCharacters: summarizeNumbers(entries.map(entry => entry.output.length)),
      estimatedCostUsd: summarizeNumbers(entries.map(entry => entry.estimatedCostUsd), 6),
      perCase: entries.map(entry => ({
        caseId: entry.scenario.id, category: entry.scenario.category, ok: entry.result.ok,
        latencyMs: entry.result.latencyMs, promptTokens: entry.result.promptTokens,
        completionTokens: entry.result.completionTokens, outputCharacters: entry.output.length,
        refusal: entry.refusal, cachedTokens: entry.result.cachedTokens,
        cacheCreationInputTokens: entry.result.cacheCreationInputTokens,
        estimatedCostUsd: entry.estimatedCostUsd, error: entry.result.error,
      })),
    };
  };
  const metrics = {
    timestamp: new Date().toISOString(), endpoint: CHAT_ENDPOINT,
    verifiedModels: { current, candidate }, scenarios: scenarios.map(({ id, category, group }) => ({ id, category, group })),
    comparison: { [CURRENT_MODEL]: modelMetrics(CURRENT_MODEL), [CANDIDATE_MODEL]: modelMetrics(CANDIDATE_MODEL) },
    notes: 'No strict-review, repair, or continuation passes were invoked. Cache was not intentionally enabled for A/B fairness.',
  };
  await writeFile(resolve(TMP, 'model_ab_metrics.json'), JSON.stringify(metrics, null, 2));

  console.log(JSON.stringify({ cacheProbe, metrics: {
    verifiedModels: metrics.verifiedModels,
    comparison: metrics.comparison,
  } }, null, 2));
};

main().catch(error => {
  console.error(`Venice diagnostics failed: ${safeError(error)}`);
  process.exitCode = 1;
});
