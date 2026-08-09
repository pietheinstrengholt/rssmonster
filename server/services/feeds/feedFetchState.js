// Defines durable feed-fetch state transitions independently from scheduling policy.

import {
  FETCH_OUTCOMES
} from './http/contracts.js';

const SUCCESS_OUTCOMES = new Set([
  FETCH_OUTCOMES.CHANGED,
  FETCH_OUTCOMES.UNCHANGED,
  FETCH_OUTCOMES.NOT_MODIFIED
]);
const FETCH_OUTCOME_TYPES = new Set(Object.values(FETCH_OUTCOMES));

// Adds an optional update only when its value was explicitly supplied.
const setIfDefined = (updates, field, value) => {
  if (value !== undefined) updates[field] = value;
};

// Records every fetch attempt while mirroring attempt time to legacy lastFetched.
export const buildFetchAttemptState = (attemptedAt = new Date()) => ({
  lastAttemptAt: attemptedAt,
  lastFetched: attemptedAt
});

// Builds the persistent changes for one completed neutral fetch outcome.
export const buildFetchOutcomeState = ({
  feed,
  outcome,
  completedAt = new Date(),
  nextFetchAt,
  diagnosticMessage,
  quarantined = false,
  lastPublishedAt,
  observedEntryIntervalMs
}) => {
  if (!FETCH_OUTCOME_TYPES.has(outcome?.type)) {
    throw new TypeError(`Unsupported fetch outcome: ${outcome?.type}`);
  }

  const updates = { lastFetchOutcome: outcome.type };
  setIfDefined(updates, 'nextFetchAt', nextFetchAt);

  if (!SUCCESS_OUTCOMES.has(outcome.type)) {
    const failureCount = Number(feed?.consecutiveFailures || 0) + 1;
    updates.consecutiveFailures = failureCount;
    updates.errorCount = failureCount;
    updates.errorMessage = diagnosticMessage || 'Feed acquisition failed';
    updates.errorSince = feed?.errorSince || completedAt;
    updates.status = quarantined ? 'error' : 'active';
    return updates;
  }

  updates.lastSuccessAt = completedAt;
  updates.consecutiveFailures = 0;
  updates.errorCount = 0;
  updates.errorMessage = null;
  updates.errorSince = null;
  updates.status = 'active';
  if (outcome.type === FETCH_OUTCOMES.NOT_MODIFIED) {
    if (outcome.policy?.etag) updates.etag = outcome.policy.etag;
    if (outcome.policy?.lastModified) {
      updates.lastModified = outcome.policy.lastModified;
    }
    if (outcome.policy?.cacheFreshUntil) {
      updates.cacheFreshUntil = outcome.policy.cacheFreshUntil;
    }
  } else {
    updates.etag = outcome.policy?.etag ?? null;
    updates.lastModified = outcome.policy?.lastModified ?? null;
    updates.cacheFreshUntil = outcome.policy?.cacheFreshUntil ?? null;
  }

  if (outcome.type === FETCH_OUTCOMES.CHANGED) {
    updates.lastChangedAt = completedAt;
    updates.contentHash = outcome.bodyHash ?? null;
    setIfDefined(updates, 'lastPublishedAt', lastPublishedAt);
    setIfDefined(
      updates,
      'observedEntryIntervalMs',
      observedEntryIntervalMs
    );
  }

  return updates;
};

export default { buildFetchAttemptState, buildFetchOutcomeState };
