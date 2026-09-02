import { describe, expect, it, vi } from 'vitest';
import {
  createGeneratedFeedToken,
  GeneratedFeedTokenGenerationError,
  persistWithGeneratedFeedToken
} from '../../services/generatedFeedTokens.js';

describe('Generated Feed tokens', () => {
  it('creates opaque 256-bit base64url values', () => {
    const first = createGeneratedFeedToken();
    const second = createGeneratedFeedToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it('retries unique-token collisions and returns the persisted result', async () => {
    const collision = Object.assign(new Error('collision'), {
      name: 'SequelizeUniqueConstraintError'
    });
    const operation = vi.fn()
      .mockRejectedValueOnce(collision)
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ id: 7 });
    const tokenFactory = vi.fn()
      .mockReturnValueOnce('token-one')
      .mockReturnValueOnce('token-two')
      .mockReturnValueOnce('token-three');

    await expect(persistWithGeneratedFeedToken(operation, { tokenFactory }))
      .resolves.toEqual({ id: 7 });
    expect(operation.mock.calls).toEqual([
      ['token-one'],
      ['token-two'],
      ['token-three']
    ]);
  });

  it('does not retry unrelated persistence failures', async () => {
    const error = new Error('database unavailable');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(persistWithGeneratedFeedToken(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('reports exhausted collision retries without exposing tokens', async () => {
    const collision = Object.assign(new Error('duplicate token value'), {
      name: 'SequelizeUniqueConstraintError'
    });

    await expect(persistWithGeneratedFeedToken(
      vi.fn().mockRejectedValue(collision),
      { tokenFactory: () => 'private-token', maxAttempts: 2 }
    )).rejects.toEqual(expect.any(GeneratedFeedTokenGenerationError));
  });
});
