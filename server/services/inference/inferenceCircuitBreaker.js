const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;
const CIRCUIT_OPEN_CODE = 'INFERENCE_CIRCUIT_OPEN';
const MAX_PATH_LENGTH = 256;

const parsePositiveInteger = (value, fallback, name) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const safePath = path => String(path || '/')
  .split('?')[0]
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .slice(0, MAX_PATH_LENGTH);

export const getInferenceCircuitConfig = (environment = process.env) => ({
  failureThreshold: parsePositiveInteger(
    environment.INFERENCE_CIRCUIT_FAILURE_THRESHOLD,
    DEFAULT_FAILURE_THRESHOLD,
    'INFERENCE_CIRCUIT_FAILURE_THRESHOLD'
  ),
  cooldownMs: parsePositiveInteger(
    environment.INFERENCE_CIRCUIT_COOLDOWN_MS,
    DEFAULT_COOLDOWN_MS,
    'INFERENCE_CIRCUIT_COOLDOWN_MS'
  )
});

export class InferenceCircuitOpenError extends Error {
  constructor({ requestId, inferencePath, retryAfterMs, openedAt }) {
    super(`Inference circuit is open; retry after ${retryAfterMs}ms`);
    this.name = 'InferenceCircuitOpenError';
    this.code = CIRCUIT_OPEN_CODE;
    this.requestId = requestId;
    this.inferencePath = inferencePath;
    this.retryAfterMs = retryAfterMs;
    this.openedAt = openedAt;
  }
}

export const createInferenceCircuitBreaker = ({
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  now = Date.now,
  logger = console
} = {}) => {
  const configuredFailureThreshold = parsePositiveInteger(
    failureThreshold,
    DEFAULT_FAILURE_THRESHOLD,
    'failureThreshold'
  );
  const configuredCooldownMs = parsePositiveInteger(
    cooldownMs,
    DEFAULT_COOLDOWN_MS,
    'cooldownMs'
  );

  let state = 'closed';
  let consecutiveFailures = 0;
  let openedAt = null;
  let retryAt = null;
  let halfOpenProbeActive = false;
  let causeCategory = 'none';
  let rejectionLoggedForOpenedAt = null;

  const snapshot = () => Object.freeze({
    state,
    consecutiveFailures,
    openedAt,
    retryAt,
    halfOpenProbeActive
  });

  const log = (event, { requestId, inferencePath, category = causeCategory } = {}) => {
    const effectiveCooldownMs = openedAt === null || retryAt === null
      ? configuredCooldownMs
      : Math.max(0, retryAt - openedAt);
    logger.warn([
      `[INFERENCE CIRCUIT] ${event}`,
      `requestId=${JSON.stringify(requestId || 'unavailable')}`,
      `path=${JSON.stringify(safePath(inferencePath))}`,
      `cause=${JSON.stringify(category)}`,
      `failureCount=${consecutiveFailures}`,
      `cooldownMs=${effectiveCooldownMs}`
    ].join(' '));
  };

  const rejectOpenRequest = ({ requestId, inferencePath, category }) => {
    const retryAfterMs = Math.max(0, (retryAt ?? now()) - now());
    if (rejectionLoggedForOpenedAt !== openedAt) {
      rejectionLoggedForOpenedAt = openedAt;
      log('request_rejected_circuit_open', { requestId, inferencePath, category });
    }
    throw new InferenceCircuitOpenError({
      requestId,
      inferencePath,
      retryAfterMs,
      openedAt
    });
  };

  const beforeRequest = ({ requestId, inferencePath }) => {
    if (state === 'closed') return Object.freeze({ halfOpenProbe: false });

    if (state === 'open') {
      if (now() < retryAt) {
        rejectOpenRequest({ requestId, inferencePath, category: causeCategory });
      }
      state = 'half_open';
      halfOpenProbeActive = true;
      log('circuit_half_open', { requestId, inferencePath });
      return Object.freeze({ halfOpenProbe: true });
    }

    if (halfOpenProbeActive) {
      rejectOpenRequest({
        requestId,
        inferencePath,
        category: 'half_open_probe_active'
      });
    }

    halfOpenProbeActive = true;
    return Object.freeze({ halfOpenProbe: true });
  };

  const open = ({ requestId, inferencePath, category, retryAfterMs = 0 }) => {
    state = 'open';
    openedAt = now();
    retryAt = openedAt + Math.max(configuredCooldownMs, retryAfterMs);
    halfOpenProbeActive = false;
    causeCategory = category;
    rejectionLoggedForOpenedAt = null;
    log('circuit_opened', { requestId, inferencePath, category });
  };

  const recordSuccess = (admission, context) => {
    if (admission.halfOpenProbe) {
      state = 'closed';
      halfOpenProbeActive = false;
      log('circuit_closed', context);
      consecutiveFailures = 0;
      openedAt = null;
      retryAt = null;
      causeCategory = 'none';
      rejectionLoggedForOpenedAt = null;
      return;
    }
    if (state === 'closed') consecutiveFailures = 0;
  };

  const recordFailure = (admission, {
    qualifies,
    requestId,
    inferencePath,
    category,
    retryAfterMs = 0
  }) => {
    if (!qualifies) {
      if (admission.halfOpenProbe) halfOpenProbeActive = false;
      return;
    }

    if (admission.halfOpenProbe) {
      consecutiveFailures += 1;
      open({ requestId, inferencePath, category, retryAfterMs });
      return;
    }
    if (state !== 'closed') return;

    consecutiveFailures += 1;
    if (consecutiveFailures >= configuredFailureThreshold) {
      open({ requestId, inferencePath, category, retryAfterMs });
    }
  };

  return Object.freeze({
    beforeRequest,
    recordSuccess,
    recordFailure,
    getSnapshot: snapshot
  });
};

export default createInferenceCircuitBreaker;
