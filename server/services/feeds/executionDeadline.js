// Defines absolute feed execution deadlines shared across acquisition and persistence.

const transactionLeaseAssertions = new WeakMap();

// Creates the stable timeout error used across feed execution layers.
export const createFeedTimeoutError = (message = 'Feed execution timed out') => {
  const error = new Error(message);
  error.name = 'TimeoutError';
  error.code = 'FEED_EXECUTION_TIMEOUT';
  return error;
};

// Resolves an absolute deadline, falling back only for legacy callers.
export const resolveDeadlineAt = (deadlineAt, fallbackMs) => {
  const parsed = Number(deadlineAt);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Date.now() + fallbackMs;
};

// Returns the non-negative milliseconds remaining before one absolute deadline.
export const remainingDeadlineMs = deadlineAt =>
  Math.max(0, Number(deadlineAt) - Date.now());

// Throws before or after an operation once its execution context is no longer valid.
export const throwIfExecutionExpired = ({ signal, deadlineAt, leaseState } = {}) => {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : createFeedTimeoutError();
  }
  if (
    deadlineAt !== null &&
    deadlineAt !== undefined &&
    Number.isFinite(Number(deadlineAt)) &&
    Number(deadlineAt) > 0 &&
    Date.now() >= Number(deadlineAt)
  ) {
    throw createFeedTimeoutError();
  }
  if (leaseState?.lost) {
    throw leaseState.error || new Error('Feed lease ownership was lost');
  }
};

// Reports whether an error represents the shared abort or deadline contract.
export const isFeedTimeoutError = error =>
  error?.name === 'TimeoutError' ||
  error?.name === 'AbortError' ||
  error?.code === 'FEED_EXECUTION_TIMEOUT';

// Rejects at the deadline while consuming the cooperatively aborted operation's settlement.
export const withExecutionTimeout = async (operation, timeoutMs) => {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutMs;
  const timeoutError = createFeedTimeoutError(
    `Feed processing timed out after ${timeoutMs / 1000} seconds`
  );
  let timeoutId;
  const operationPromise = Promise.resolve().then(() =>
    operation(controller.signal, deadlineAt)
  );
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
    void operationPromise.catch(() => {});
  }
};

// Runs the optional crawl ownership guard before a lease-scoped database write.
export const assertExecutionLeaseOwnership = async (
  execution = {},
  options = {}
) => {
  throwIfExecutionExpired(execution);
  const requiresLease = Boolean(
    execution.lease || typeof execution.assertLeaseOwnership === 'function'
  );
  if (!requiresLease) return true;

  const deadlineAt = Number(execution.deadlineAt);
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) {
    const error = new Error('Lease-scoped feed execution requires a valid deadline');
    error.code = 'FEED_EXECUTION_CONTEXT_INVALID';
    throw error;
  }
  if (typeof execution.assertLeaseOwnership !== 'function') {
    const error = new Error('Lease-scoped feed execution requires an ownership assertion');
    error.code = 'FEED_EXECUTION_CONTEXT_INVALID';
    throw error;
  }

  const transaction = options.transaction || null;
  const leaseSignature = `${execution.lease?.feedId || ''}:` +
    `${execution.lease?.leaseOwner || ''}`;
  const priorAssertion = transaction
    ? transactionLeaseAssertions.get(transaction)
    : null;
  if (priorAssertion?.leaseSignature === leaseSignature) {
    if (
      priorAssertion.leaseUntil &&
      new Date(priorAssertion.leaseUntil).getTime() <= Date.now()
    ) {
      const error = new Error(
        `Feed lease ownership was lost for feed ${execution.lease?.feedId}`
      );
      error.name = 'FeedLeaseLostError';
      error.code = 'FEED_LEASE_LOST';
      throw error;
    }
    throwIfExecutionExpired(execution);
    return true;
  }

  const ownedFeed = await execution.assertLeaseOwnership(options);
  if (transaction) {
    transactionLeaseAssertions.set(transaction, {
      leaseSignature,
      leaseUntil: ownedFeed?.leaseUntil || null
    });
  }
  throwIfExecutionExpired(execution);
  return true;
};

export default {
  assertExecutionLeaseOwnership,
  createFeedTimeoutError,
  isFeedTimeoutError,
  remainingDeadlineMs,
  resolveDeadlineAt,
  throwIfExecutionExpired,
  withExecutionTimeout
};
