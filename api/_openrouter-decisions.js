import https from 'node:https';

export const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
export const JEV_SHADOW_TIMEOUT_MS = 2_500;
export const MAX_REVIEW_STATE_CHARS = 48_000;
export const MAX_DECISIONS_RESPONSE_BYTES = 256 * 1024;

const signalKeys = {
  identityConflict: 'identity_conflict',
  speakerOwnershipViolation: 'speaker_ownership_violation',
  realityLayerViolation: 'reality_layer_violation',
  memoryConflict: 'memory_conflict',
  stateConflict: 'state_conflict',
  userAgencyViolation: 'user_agency_violation',
  continuityViolation: 'continuity_violation',
};

export const JEV_QUESTIONS = {
  route: {
    type: 'choice',
    instructions: 'Judge whether the candidate response contains a meaningful semantic continuity or state problem that warrants full strict review. Use only the provided structured state. Do not invent missing facts.',
    criteria: {
      clean: 'No meaningful identity, speaker-ownership, reality-layer, memory, state, wardrobe, user-agency, or continuity conflict is supported by the provided state.',
      full_review: 'At least one meaningful identity, speaker-ownership, reality-layer, memory, state, wardrobe, user-agency, or continuity concern is supported by the provided state and merits full strict review.',
    },
  },
  identity_conflict: {
    type: 'noul',
    instructions: 'Does the candidate contradict a fixed participant identity, confuse one participant for another, or assign an incompatible identity or role?',
  },
  speaker_ownership_violation: {
    type: 'noul',
    instructions: 'Does the candidate assign speech or actions to the wrong participant or violate who is allowed to speak or act in this turn?',
  },
  reality_layer_violation: {
    type: 'noul',
    instructions: 'Does the candidate violate the supplied reality layer, for example treating remote texting participants as physically co-present when the state says they are not?',
  },
  memory_conflict: {
    type: 'noul',
    instructions: 'Does the candidate contradict a relevant memory explicitly supplied in the state? If no relevant memory is supplied, do not infer a conflict.',
  },
  state_conflict: {
    type: 'noul',
    instructions: 'Does the candidate contradict supplied scene, presence, wardrobe, or other explicit current-state information?',
  },
  user_agency_violation: {
    type: 'noul',
    instructions: 'Does the candidate improperly invent a consequential choice, action, speech, or commitment for the user that the user did not make?',
  },
  continuity_violation: {
    type: 'noul',
    instructions: 'Does the candidate materially contradict the immediately supplied conversation or scene continuity even if the problem does not fit the other categories?',
  },
};

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, allowed) => Object.keys(value).every(key => allowed.has(key));
const isFiniteProbability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isOptionalString = value => value === undefined || typeof value === 'string';

const isWardrobe = value => {
  if (!isPlainObject(value) || !hasOnlyKeys(value, new Set(['user', 'characters']))) return false;
  return typeof value.user === 'string'
    && isPlainObject(value.characters)
    && Object.values(value.characters).every(outfit => typeof outfit === 'string');
};

const isParticipant = value => isPlainObject(value)
  && hasOnlyKeys(value, new Set(['id', 'name', 'present', 'role']))
  && typeof value.id === 'string'
  && typeof value.name === 'string'
  && (value.present === undefined || typeof value.present === 'boolean')
  && isOptionalString(value.role);

const isMemory = value => isPlainObject(value)
  && hasOnlyKeys(value, new Set(['id', 'summary', 'kind']))
  && typeof value.id === 'string'
  && typeof value.summary === 'string'
  && isOptionalString(value.kind);

const isProposedScene = value => isPlainObject(value)
  && hasOnlyKeys(value, new Set(['id', 'location', 'realityLayer', 'realityEpochId', 'presentMemberIds', 'summary', 'unresolved', 'startedAt', 'wardrobe']))
  && typeof value.id === 'string'
  && typeof value.location === 'string'
  && ['physical', 'texting', 'imagined'].includes(value.realityLayer)
  && isOptionalString(value.realityEpochId)
  && Array.isArray(value.presentMemberIds) && value.presentMemberIds.every(id => typeof id === 'string')
  && typeof value.summary === 'string'
  && Array.isArray(value.unresolved) && value.unresolved.every(item => typeof item === 'string')
  && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)
  && (value.wardrobe === undefined || isWardrobe(value.wardrobe));

export const isValidReviewState = state => isPlainObject(state)
  && hasOnlyKeys(state, new Set([
    'latestUserText', 'realityLayer', 'realityEpochId', 'sceneSummary', 'participants',
    'wardrobe', 'relevantMemories', 'candidateText', 'proposedScene',
  ]))
  && typeof state.latestUserText === 'string'
  && (state.realityLayer === undefined || ['physical', 'texting', 'imagined'].includes(state.realityLayer))
  && isOptionalString(state.realityEpochId)
  && isOptionalString(state.sceneSummary)
  && Array.isArray(state.participants) && state.participants.every(isParticipant)
  && (state.wardrobe === undefined || isWardrobe(state.wardrobe))
  && Array.isArray(state.relevantMemories) && state.relevantMemories.every(isMemory)
  && typeof state.candidateText === 'string'
  && (state.proposedScene === undefined || isProposedScene(state.proposedScene));

const unavailable = (reasonCode, details) => ({ status: 'unavailable', reasonCode, ...details });

const networkCauseCodes = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED',
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER',
]);

const safeProperty = (value, key) => {
  try {
    return value && typeof value === 'object' ? value[key] : undefined;
  } catch {
    return undefined;
  }
};

export const extractNetworkCauseCode = error => {
  const visited = new Set();
  const findCode = value => {
    if (!value || typeof value !== 'object' || visited.has(value)) return undefined;
    visited.add(value);
    const code = safeProperty(value, 'code');
    if (typeof code === 'string' && networkCauseCodes.has(code)) return code;
    const causeCode = findCode(safeProperty(value, 'cause'));
    if (causeCode) return causeCode;
    const errors = safeProperty(value, 'errors');
    if (!Array.isArray(errors)) return undefined;
    for (const nestedError of errors) {
      const nestedCode = findCode(nestedError);
      if (nestedCode) return nestedCode;
    }
    return undefined;
  };
  return findCode(error) || 'NETWORK_UNKNOWN';
};

export const classifyUpstreamHttpFailure = status => {
  const reasonCodes = {
    400: 'UPSTREAM_BAD_REQUEST',
    401: 'UPSTREAM_UNAUTHORIZED',
    402: 'UPSTREAM_PAYMENT_REQUIRED',
    403: 'UPSTREAM_FORBIDDEN',
    404: 'UPSTREAM_NOT_FOUND',
    408: 'UPSTREAM_REQUEST_TIMEOUT',
    413: 'UPSTREAM_TOO_LARGE',
    422: 'UPSTREAM_UNPROCESSABLE',
    429: 'UPSTREAM_RATE_LIMITED',
  };
  if (reasonCodes[status]) return reasonCodes[status];
  return status >= 500 && status <= 599 ? 'UPSTREAM_SERVER_ERROR' : 'UPSTREAM_HTTP_ERROR';
};

const normalizeUsage = usage => {
  if (!isPlainObject(usage)) return undefined;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cost = usage.cost;
  if (![inputTokens, outputTokens, cost].every(value => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0))) {
    return undefined;
  }
  const normalized = {};
  if (inputTokens !== undefined) normalized.inputTokens = inputTokens;
  if (outputTokens !== undefined) normalized.outputTokens = outputTokens;
  if (cost !== undefined) normalized.cost = cost;
  return Object.keys(normalized).length ? normalized : undefined;
};

export const normalizeDecisionsResponse = body => {
  if (!isPlainObject(body) || typeof body.model !== 'string' || !isPlainObject(body.answers)) return null;
  const route = body.answers.route;
  if (!isPlainObject(route)
    || route.type !== 'choice'
    || !['clean', 'full_review'].includes(route.choice)
    || !isPlainObject(route.probabilities)
    || !isFiniteProbability(route.probabilities.clean)
    || !isFiniteProbability(route.probabilities.full_review)
    || !isFiniteProbability(route.confidence)) return null;

  const signals = {};
  for (const [clientKey, upstreamKey] of Object.entries(signalKeys)) {
    const answer = body.answers[upstreamKey];
    if (!isPlainObject(answer) || answer.type !== 'noul' || !isFiniteProbability(answer.noul)) return null;
    signals[clientKey] = answer.noul;
  }

  const normalized = {
    status: 'ok',
    model: body.model,
    route: {
      choice: route.choice,
      probabilities: {
        clean: route.probabilities.clean,
        full_review: route.probabilities.full_review,
      },
      confidence: route.confidence,
    },
    signals,
  };
  const usage = normalizeUsage(body.usage);
  if (usage) normalized.usage = usage;
  return normalized;
};

export const requestOpenRouterViaHttps = ({
  apiKey,
  requestBody,
  timeoutMs = JEV_SHADOW_TIMEOUT_MS,
  requestImpl = https.request,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) => new Promise((resolve, reject) => {
  let request;
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeoutImpl(timeout);
    callback(value);
  };
  const timeoutError = Object.assign(new Error(), { name: 'AbortError' });
  const timeout = setTimeoutImpl(() => {
    try {
      request?.destroy(timeoutError);
    } catch {
      // The normalized timeout result must not depend on a request teardown failure.
    }
    finish(reject, timeoutError);
  }, timeoutMs);

  try {
    request = requestImpl(OPENROUTER_DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }, response => {
      const statusCode = response.statusCode;
      if (typeof statusCode !== 'number') return finish(resolve, { statusCode: 0 });
      if (statusCode < 200 || statusCode >= 300) {
        response.once('error', () => undefined);
        response.resume?.();
        return finish(resolve, { statusCode });
      }

      let size = 0;
      const chunks = [];
      response.on('data', chunk => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_DECISIONS_RESPONSE_BYTES) {
          response.destroy?.();
          finish(resolve, { statusCode, bodyTooLarge: true });
          return;
        }
        chunks.push(bytes);
      });
      response.once('end', () => finish(resolve, { statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      response.once('error', error => finish(reject, error));
    });
    request.once('error', error => finish(reject, error));
    request.end(requestBody);
  } catch (error) {
    finish(reject, error);
  }
});

export const runOpenRouterDecision = async (state, {
  transportImpl = requestOpenRouterViaHttps,
  env = process.env,
  timeoutMs = JEV_SHADOW_TIMEOUT_MS,
} = {}) => {
  if (!isValidReviewState(state)) return unavailable('INVALID_STATE');
  let serializedState;
  try {
    serializedState = JSON.stringify(state);
  } catch {
    return unavailable('INVALID_STATE');
  }
  if (serializedState.length > MAX_REVIEW_STATE_CHARS) return unavailable('OVERSIZE');

  const configuredModel = env.OPENROUTER_MODEL || JEV_MODEL;
  if (configuredModel !== JEV_MODEL) return unavailable('MODEL_NOT_ALLOWED');
  const apiKey = env.OPENROUTER_API || env.OPENROUTER_API_KEY;
  if (!apiKey) return unavailable('MISSING_CREDENTIALS');

  const requestBody = JSON.stringify({ model: JEV_MODEL, state, questions: JEV_QUESTIONS });
  try {
    const upstream = await transportImpl({ apiKey, requestBody, timeoutMs });
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) return unavailable(classifyUpstreamHttpFailure(upstream.statusCode));
    if (upstream.bodyTooLarge) return unavailable('MALFORMED_RESPONSE');
    let body;
    try {
      body = JSON.parse(upstream.body);
    } catch {
      return unavailable('MALFORMED_RESPONSE');
    }
    return normalizeDecisionsResponse(body) || unavailable('MALFORMED_RESPONSE');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return unavailable('TIMEOUT');
    return unavailable('UPSTREAM_NETWORK_ERROR', { networkCode: extractNetworkCauseCode(error) });
  }
};
