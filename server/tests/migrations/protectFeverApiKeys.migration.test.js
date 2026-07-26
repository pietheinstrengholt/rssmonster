import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFeverCredentialHash } from '../../utils/apiCredentials.js';

const originalFeverCredentialSecret =
  process.env.FEVER_CREDENTIAL_SECRET;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalFeverCredentialSecret === undefined) {
    delete process.env.FEVER_CREDENTIAL_SECRET;
  } else {
    process.env.FEVER_CREDENTIAL_SECRET =
      originalFeverCredentialSecret;
  }
});

describe('protect Fever API keys migration', () => {
  it('replaces each legacy API key with its protected lookup value', async () => {
    process.env.FEVER_CREDENTIAL_SECRET = 'migration-test-secret';
    const legacyApiKey = '24574b626127fcb78f4d122973dcd613';
    const transaction = {};
    const queryInterface = {
      bulkUpdate: vi.fn().mockResolvedValue(undefined),
      sequelize: {
        query: vi.fn().mockResolvedValue([[
          { id: 7, hash: legacyApiKey }
        ]]),
        transaction: vi.fn(async callback => callback(transaction))
      }
    };
    const migration = (
      await import(
        '../../migrations/20260724000000-protect-fever-api-keys.js'
      )
    ).default;

    await migration.up(queryInterface);

    expect(queryInterface.bulkUpdate).toHaveBeenCalledWith(
      'users',
      { hash: createFeverCredentialHash(legacyApiKey) },
      { id: 7 },
      { transaction }
    );
  });
});
