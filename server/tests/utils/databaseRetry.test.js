import { describe, expect, it, vi } from 'vitest';

import {
  isDatabaseDeadlock,
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
});
