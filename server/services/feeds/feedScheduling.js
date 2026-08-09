// Defines deterministic adaptive feed scheduling and cadence observation policy.

import { FETCH_OUTCOMES } from './http/contracts.js';

export const MIN_FETCH_INTERVAL_MS = 5 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const MAX_ACTIVITY_INTERVAL_MS = 4 * HOUR_MS;
export const MAX_JITTER_MS = 60 * 1000;
export const MALFORMED_BASE_BACKOFF_MS = 6 * HOUR_MS;
export const NOT_FOUND_BACKOFF_MS = 24 * HOUR_MS;
export const PERMANENT_BACKOFF_MS = 12 * HOUR_MS;
export const MALFORMED_QUARANTINE_THRESHOLD = 3;

const MIN_CADENCE_SAMPLE_MS = MIN_FETCH_INTERVAL_MS;
const MAX_CADENCE_SAMPLE_MS = 30 * DAY_MS;
const CADENCE_EWMA_NEW_WEIGHT = 0.25;
const SUCCESS_OUTCOMES = new Set([
  FETCH_OUTCOMES.CHANGED,
  FETCH_OUTCOMES.UNCHANGED,
  FETCH_OUTCOMES.NOT_MODIFIED
]);
const LONG_LIVED_HTTP_STATUSES = new Set([404, 410]);

// Constrains one finite numeric value to an inclusive range.
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

// Converts one supported date input into a valid timestamp or null.
const toTimestamp = value => {
  if (value === null || value === undefined) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

// Converts persisted cadence into a finite non-negative number or null.
const toCadence = value => {
  if (value === null || value === undefined || value === '') return null;
  const cadenceMs = Number(value);
  return Number.isFinite(cadenceMs) && cadenceMs >= 0 ? cadenceMs : null;
};

// Resolves the injected clock once so every calculation shares one instant.
const readClock = clock => {
  const timestamp = toTimestamp(clock());
  if (timestamp === null) throw new TypeError('The scheduling clock is invalid');
  return timestamp;
};

// Returns the deterministic midpoint of a non-empty numeric sample.
const median = values => {
  const sortedValues = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[midpoint];
  return Math.round(
    (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
  );
};

// Produces a stable non-negative one-minute-or-smaller identity spread.
export const deterministicJitterMs = feedIdentity => {
  const identity = String(feedIdentity ?? '');
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % (MAX_JITTER_MS + 1);
};

// Chooses the adaptive interval from publisher activity and observed cadence.
export const calculateActivityIntervalMs = ({
  lastPublishedAt,
  observedEntryIntervalMs,
  now
}) => {
  const nowTimestamp = toTimestamp(now);
  if (nowTimestamp === null) throw new TypeError('The scheduling time is invalid');
  const publishedTimestamp = toTimestamp(lastPublishedAt);
  if (publishedTimestamp === null) return MAX_ACTIVITY_INTERVAL_MS;

  const inactiveMs = Math.max(0, nowTimestamp - publishedTimestamp);
  if (inactiveMs >= 30 * DAY_MS) return MAX_ACTIVITY_INTERVAL_MS;
  if (inactiveMs >= 14 * DAY_MS) return 2 * HOUR_MS;
  if (inactiveMs >= 7 * DAY_MS) return HOUR_MS;

  const cadenceMs = toCadence(observedEntryIntervalMs);
  if (cadenceMs === null) return MIN_FETCH_INTERVAL_MS;
  return clamp(cadenceMs / 2, MIN_FETCH_INTERVAL_MS, HOUR_MS);
};

// Selects a user override when configured and otherwise retains adaptive cadence.
export const calculateBaseFetchIntervalMs = ({
  updateIntervalMinutes,
  lastPublishedAt,
  observedEntryIntervalMs,
  now
}) => {
  const intervalMinutes = Number(updateIntervalMinutes);
  if (
    updateIntervalMinutes !== null &&
    updateIntervalMinutes !== undefined &&
    Number.isFinite(intervalMinutes) &&
    intervalMinutes > 0
  ) {
    return intervalMinutes * 60 * 1000;
  }

  return calculateActivityIntervalMs({
    lastPublishedAt,
    observedEntryIntervalMs,
    now
  });
};

// Updates cadence from robust publisher evidence independently of article insertion.
export const updateCadenceObservation = ({
  lastPublishedAt,
  observedEntryIntervalMs,
  publicationTimestamps,
  newlyObservedPublicationTimestamps = []
}, { clock = () => new Date() } = {}) => {
  const nowTimestamp = readClock(clock);
  const previousPublishedTimestamp = toTimestamp(lastPublishedAt);
  const timestampInputs = publicationTimestamps ??
    newlyObservedPublicationTimestamps;
  const trustedTimestamps = [...new Set(timestampInputs
    .map(toTimestamp)
    .filter(timestamp => (
      timestamp !== null &&
      timestamp <= nowTimestamp &&
      (
        previousPublishedTimestamp === null ||
        timestamp > previousPublishedTimestamp
      )
    )))]
    .sort((left, right) => left - right);
  const newestPublishedTimestamp = trustedTimestamps.at(-1);

  if (newestPublishedTimestamp === undefined) {
    return Object.freeze({
      lastPublishedAt: previousPublishedTimestamp === null
        ? null
        : new Date(previousPublishedTimestamp),
      observedEntryIntervalMs: toCadence(observedEntryIntervalMs)
    });
  }

  let nextCadenceMs = toCadence(observedEntryIntervalMs);

  if (previousPublishedTimestamp !== null) {
    const timeline = [previousPublishedTimestamp, ...trustedTimestamps];
    const adjacentIntervals = timeline
      .slice(1)
      .map((timestamp, index) => timestamp - timeline[index]);
    const sampleMs = clamp(
      median(adjacentIntervals),
      MIN_CADENCE_SAMPLE_MS,
      MAX_CADENCE_SAMPLE_MS
    );
    nextCadenceMs = nextCadenceMs === null
      ? sampleMs
      : Math.round(
        nextCadenceMs * (1 - CADENCE_EWMA_NEW_WEIGHT) +
        sampleMs * CADENCE_EWMA_NEW_WEIGHT
      );
  }

  return Object.freeze({
    lastPublishedAt: new Date(newestPublishedTimestamp),
    observedEntryIntervalMs: nextCadenceMs
  });
};

// Classifies retry delay and quarantine independently from publisher policy.
export const classifyFetchRetry = ({
  outcomeType,
  httpStatus = null,
  consecutiveFailures = 0
}) => {
  if (SUCCESS_OUTCOMES.has(outcomeType)) {
    return Object.freeze({ retryable: true, quarantined: false, backoffMs: 0 });
  }

  const failureCount = Math.max(1, Math.floor(Number(consecutiveFailures) || 1));
  if (outcomeType === FETCH_OUTCOMES.SECURITY_REJECTED) {
    return Object.freeze({ retryable: false, quarantined: true, backoffMs: null });
  }
  if (outcomeType === FETCH_OUTCOMES.MALFORMED) {
    const quarantined = failureCount >= MALFORMED_QUARANTINE_THRESHOLD;
    return Object.freeze({
      retryable: !quarantined,
      quarantined,
      backoffMs: quarantined
        ? null
        : MALFORMED_BASE_BACKOFF_MS * failureCount
    });
  }
  if (
    outcomeType === FETCH_OUTCOMES.PERMANENT_FAILURE &&
    LONG_LIVED_HTTP_STATUSES.has(Number(httpStatus))
  ) {
    return Object.freeze({
      retryable: true,
      quarantined: false,
      backoffMs: NOT_FOUND_BACKOFF_MS
    });
  }
  if (
    outcomeType === FETCH_OUTCOMES.PERMANENT_FAILURE ||
    outcomeType === FETCH_OUTCOMES.TOO_LARGE
  ) {
    return Object.freeze({
      retryable: true,
      quarantined: false,
      backoffMs: PERMANENT_BACKOFF_MS
    });
  }

  const backoffMs = Math.min(
    MAX_ACTIVITY_INTERVAL_MS,
    MIN_FETCH_INTERVAL_MS * (2 ** Math.min(failureCount - 1, 16))
  );
  return Object.freeze({ retryable: true, quarantined: false, backoffMs });
};

// Returns the classified delay for callers that only need retry duration.
export const calculateFailureBackoffMs = input =>
  classifyFetchRetry(input).backoffMs;

// Selects the latest valid scheduling constraint and then adds stable jitter.
export const calculateNextFetchAt = ({
  feedIdentity,
  updateIntervalMinutes = null,
  lastPublishedAt,
  observedEntryIntervalMs,
  cacheFreshUntil,
  retryAfterAt,
  outcomeType,
  httpStatus = null,
  consecutiveFailures = 0
}, { clock = () => new Date() } = {}) => {
  const nowTimestamp = readClock(clock);
  if (Number(updateIntervalMinutes) === 0 && updateIntervalMinutes !== null) {
    return null;
  }

  const baseIntervalMs = calculateBaseFetchIntervalMs({
    updateIntervalMinutes,
    lastPublishedAt,
    observedEntryIntervalMs,
    now: new Date(nowTimestamp)
  });
  const retryClassification = classifyFetchRetry({
    outcomeType,
    httpStatus,
    consecutiveFailures
  });
  if (!retryClassification.retryable) return null;

  const failureBackoffMs = retryClassification.backoffMs;
  const candidates = [
    nowTimestamp + baseIntervalMs,
    toTimestamp(cacheFreshUntil),
    toTimestamp(retryAfterAt),
    failureBackoffMs > 0 ? nowTimestamp + failureBackoffMs : null
  ].filter(timestamp => timestamp !== null);
  const latestConstraint = Math.max(...candidates);

  return new Date(latestConstraint + deterministicJitterMs(feedIdentity));
};

// Recomputes a setting change while retaining later durable publisher or failure limits.
export const calculateIntervalChangeNextFetchAt = ({
  feedIdentity,
  previousUpdateIntervalMinutes,
  updateIntervalMinutes,
  lastPublishedAt,
  observedEntryIntervalMs,
  cacheFreshUntil,
  currentNextFetchAt,
  lastFetchOutcome,
  consecutiveFailures = 0
}, { clock = () => new Date() } = {}) => {
  const nowTimestamp = readClock(clock);
  if (Number(updateIntervalMinutes) === 0 && updateIntervalMinutes !== null) {
    return null;
  }
  if (
    lastFetchOutcome &&
    !classifyFetchRetry({
      outcomeType: lastFetchOutcome,
      consecutiveFailures
    }).retryable
  ) {
    return null;
  }

  const jitterMs = deterministicJitterMs(feedIdentity);
  const wasDisabled = Number(previousUpdateIntervalMinutes) === 0 &&
    previousUpdateIntervalMinutes !== null;
  const proposedNextFetchAt = wasDisabled
    ? new Date(Math.max(
      nowTimestamp,
      toTimestamp(cacheFreshUntil) ?? nowTimestamp
    ) + jitterMs)
    : calculateNextFetchAt({
      feedIdentity,
      updateIntervalMinutes,
      lastPublishedAt,
      observedEntryIntervalMs,
      cacheFreshUntil,
      outcomeType: FETCH_OUTCOMES.CHANGED
    }, { clock: () => new Date(nowTimestamp) });

  if (!SUCCESS_OUTCOMES.has(lastFetchOutcome) && lastFetchOutcome) {
    const currentTimestamp = toTimestamp(currentNextFetchAt);
    if (currentTimestamp !== null && currentTimestamp > proposedNextFetchAt.getTime()) {
      return new Date(currentTimestamp);
    }
  }

  return proposedNextFetchAt;
};

export default {
  calculateActivityIntervalMs,
  calculateBaseFetchIntervalMs,
  calculateFailureBackoffMs,
  calculateIntervalChangeNextFetchAt,
  calculateNextFetchAt,
  classifyFetchRetry,
  deterministicJitterMs,
  updateCadenceObservation
};
