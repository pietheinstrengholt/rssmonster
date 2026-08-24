const DEFAULT_DEADLOCK_ATTEMPTS = 3;
const DEFAULT_DEADLOCK_RETRY_BASE_MS = 50;
const DEFAULT_DEADLOCK_RETRY_MAX_MS = 250;

// Reports whether MySQL selected the current statement as a deadlock victim.
export const isDatabaseDeadlock = error => [
  error?.original?.code,
  error?.parent?.code,
  error?.code
].includes('ER_LOCK_DEADLOCK') || /deadlock/i.test(error?.message || '');

// Retries one idempotent database write with bounded exponential jitter.
export async function retryDatabaseWrite(operation, {
  attempts = DEFAULT_DEADLOCK_ATTEMPTS,
  baseDelayMs = DEFAULT_DEADLOCK_RETRY_BASE_MS,
  maxDelayMs = DEFAULT_DEADLOCK_RETRY_MAX_MS,
  random = Math.random,
  wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs))
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts || !isDatabaseDeadlock(error)) throw error;

      const retryCeiling = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const delayMs = Math.max(1, Math.floor(random() * retryCeiling));
      await wait(delayMs);
    }
  }

  return undefined;
}
