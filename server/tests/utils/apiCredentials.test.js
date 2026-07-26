import { afterEach, describe, expect, it } from 'vitest';

import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const originalFeverCredentialSecret =
  process.env.FEVER_CREDENTIAL_SECRET;

afterEach(() => {
  if (originalFeverCredentialSecret === undefined) {
    delete process.env.FEVER_CREDENTIAL_SECRET;
  } else {
    process.env.FEVER_CREDENTIAL_SECRET =
      originalFeverCredentialSecret;
  }
});

describe('API credentials', () => {
  it('preserves the Fever MD5 wire-protocol format', () => {
    expect(createFeverApiKey('username', 'password')).toBe(
      '133e1b8eda335c4c7f7a508620ca7f10'
    );
  });

  it('protects the Fever API key with a secret-dependent HMAC', () => {
    const apiKey = createFeverApiKey('username', 'password');
    process.env.FEVER_CREDENTIAL_SECRET = 'first-secret';
    const firstHash = createFeverCredentialHash(apiKey);

    process.env.FEVER_CREDENTIAL_SECRET = 'second-secret';
    const secondHash = createFeverCredentialHash(apiKey);

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).not.toBe(apiKey);
    expect(secondHash).not.toBe(firstHash);
  });
});
