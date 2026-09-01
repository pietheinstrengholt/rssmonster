import Sequelize from 'sequelize';

const DEFAULT_DEADLOCK_ATTEMPTS = 3;
const DEFAULT_DEADLOCK_RETRY_BASE_MS = 50;
const DEFAULT_DEADLOCK_RETRY_MAX_MS = 250;

// Reports whether MySQL selected the current statement as a deadlock victim.
export const isDatabaseDeadlock = error => [
  error?.original?.code,
  error?.parent?.code,
  error?.code
].includes('ER_LOCK_DEADLOCK') || /deadlock/i.test(error?.message || '');

// Reports whether SQLite rejected a write because another connection owns the lock.
export const isSqliteLockConflict = error => [
  error?.original?.code,
  error?.parent?.code,
  error?.code
].some(code => typeof code === 'string' && (
  code === 'SQLITE_LOCKED' ||
  code.startsWith('SQLITE_LOCKED_') ||
  code === 'SQLITE_BUSY' ||
  code.startsWith('SQLITE_BUSY_')
));

// Reports whether replaying a complete database transaction can resolve contention.
export const isRetryableTransactionConflict = error =>
  isDatabaseDeadlock(error) || isSqliteLockConflict(error);

// Retries one operation using a caller-supplied conflict classifier.
const retryOperation = async (operation, {
  attempts = DEFAULT_DEADLOCK_ATTEMPTS,
  baseDelayMs = DEFAULT_DEADLOCK_RETRY_BASE_MS,
  maxDelayMs = DEFAULT_DEADLOCK_RETRY_MAX_MS,
  random = Math.random,
  wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
  isRetryable = isDatabaseDeadlock
} = {}) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts || !isRetryable(error)) throw error;

      const retryCeiling = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const delayMs = Math.max(1, Math.floor(random() * retryCeiling));
      await wait(delayMs);
    }
  }

  return undefined;
};

// Retries one idempotent database write with bounded exponential jitter.
export const retryDatabaseWrite = (operation, options = {}) =>
  retryOperation(operation, options);

// Retries only a complete, caller-declared replay-safe transaction callback.
export const retryDatabaseTransaction = (sequelize, operation, options = {}) => {
  const transactionOptions = sequelize.getDialect() === 'sqlite'
    ? { type: Sequelize.Transaction.TYPES.IMMEDIATE }
    : {};

  return retryOperation(
    () => sequelize.transaction(transactionOptions, operation),
    { ...options, isRetryable: isRetryableTransactionConflict }
  );
};
