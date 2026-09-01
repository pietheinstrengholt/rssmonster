import { describe, expect, it, vi } from 'vitest';

import {
  isDatabaseDeadlock,
  isRetryableTransactionConflict,
  isSqliteLockConflict,
  retryDatabaseTransaction,
  retryDatabaseWrite
} from '../../utils/databaseRetry.js';

describe('database write retry', () => {
  it('retries MySQL deadlocks with bounded jitter before returning the result', async () => {
    const deadlock = Object.assign(new Error(
      'Deadlock found when trying to get lock; try restarting transaction'
    ), {
      original: { code: 'ER_LOCK_DEADLOCK' }
    });
    const operation = vi.fn()
      .mockRejectedValueOnce(deadlock)
      .mockRejectedValueOnce(deadlock)
      .mockResolvedValue('updated');
    const wait = vi.fn().mockResolvedValue();

    await expect(retryDatabaseWrite(operation, {
      baseDelayMs: 50,
      maxDelayMs: 75,
      random: () => 0.5,
      wait
    })).resolves.toBe('updated');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 25);
    expect(wait).toHaveBeenNthCalledWith(2, 37);
  });

  it('does not retry unrelated failures or retry beyond the deadlock budget', async () => {
    const ordinaryError = new Error('database unavailable');
    const ordinaryOperation = vi.fn().mockRejectedValue(ordinaryError);
    const deadlock = { parent: { code: 'ER_LOCK_DEADLOCK' } };
    const deadlockOperation = vi.fn().mockRejectedValue(deadlock);
    const wait = vi.fn().mockResolvedValue();

    await expect(retryDatabaseWrite(ordinaryOperation, { wait }))
      .rejects.toBe(ordinaryError);
    await expect(retryDatabaseWrite(deadlockOperation, { wait }))
      .rejects.toBe(deadlock);

    expect(ordinaryOperation).toHaveBeenCalledOnce();
    expect(deadlockOperation).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(isDatabaseDeadlock(deadlock)).toBe(true);
    expect(isDatabaseDeadlock(ordinaryError)).toBe(false);
  });

  it.each([
    { code: 'SQLITE_BUSY' },
    { parent: { code: 'SQLITE_BUSY_SNAPSHOT' } },
    { original: { code: 'SQLITE_LOCKED_SHAREDCACHE' } }
  ])('recognizes SQLite lock conflicts from wrapped errors', error => {
    expect(isSqliteLockConflict(error)).toBe(true);
    expect(isRetryableTransactionConflict(error)).toBe(true);
  });

  it('retries the complete SQLite IMMEDIATE transaction callback', async () => {
    const busy = { original: { code: 'SQLITE_BUSY' } };
    const transaction = vi.fn(async (options, operation) => operation({ options }));
    const sequelize = { getDialect: () => 'sqlite', transaction };
    const operation = vi.fn()
      .mockRejectedValueOnce(busy)
      .mockResolvedValue('reconciled');
    const wait = vi.fn().mockResolvedValue();

    await expect(retryDatabaseTransaction(sequelize, operation, {
      random: () => 0.5,
      wait
    })).resolves.toBe('reconciled');

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0][0]).toEqual({ type: 'IMMEDIATE' });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25);
  });

  it('does not broaden individual write retries to SQLite lock errors', async () => {
    const busy = { code: 'SQLITE_BUSY' };
    const operation = vi.fn().mockRejectedValue(busy);
    const wait = vi.fn().mockResolvedValue();

    await expect(retryDatabaseWrite(operation, { wait })).rejects.toBe(busy);

    expect(operation).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });
});
