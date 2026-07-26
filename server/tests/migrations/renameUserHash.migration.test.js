import { describe, expect, it, vi } from 'vitest';

import migration from '../../migrations/20260725000000-rename-user-hash-to-fever-credential-hash.js';

describe('rename user hash migration', () => {
  it('renames the generic hash column to feverCredentialHash', async () => {
    const queryInterface = {
      renameColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface);

    expect(queryInterface.renameColumn).toHaveBeenCalledWith(
      'users',
      'hash',
      'feverCredentialHash'
    );
  });

  it('restores the previous column name when reverting', async () => {
    const queryInterface = {
      renameColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.renameColumn).toHaveBeenCalledWith(
      'users',
      'feverCredentialHash',
      'hash'
    );
  });
});
