import { afterEach, describe, expect, it } from 'vitest';

import {
  createFeverApiKey,
  createFeverCredentialHash,
  createGreaderActionToken,
  createGreaderAuthToken
} from '../../utils/apiCredentials.js';

const originalFeverCredentialSecret =
  process.env.FEVER_CREDENTIAL_SECRET;
const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalFeverCredentialSecret === undefined) {
    delete process.env.FEVER_CREDENTIAL_SECRET;
  } else {
    process.env.FEVER_CREDENTIAL_SECRET =
      originalFeverCredentialSecret;
  }
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
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

  it('creates a separate 57-character Google Reader action token', () => {
    const user = { id: 42, password: 'stored-password-hash' };
    const authToken = createGreaderAuthToken(user);
    const actionToken = createGreaderActionToken(user, authToken);

    expect(authToken).toMatch(/^[a-f0-9]{64}$/);
    expect(actionToken).toMatch(/^[a-f0-9]{57}$/);
    expect(actionToken).not.toBe(authToken);
    expect(createGreaderActionToken(user, authToken)).toBe(actionToken);
  });

  it('rotates Google Reader tokens with the secret and stored password hash', () => {
    const firstUser = { id: 42, password: 'first-password-hash' };
    process.env.JWT_SECRET = 'first-secret';
    const firstAuthToken = createGreaderAuthToken(firstUser);
    const firstActionToken = createGreaderActionToken(
      firstUser,
      firstAuthToken
    );

    process.env.JWT_SECRET = 'second-secret';
    const rotatedSecretAuthToken = createGreaderAuthToken(firstUser);
    const rotatedSecretActionToken = createGreaderActionToken(
      firstUser,
      rotatedSecretAuthToken
    );
    process.env.JWT_SECRET = 'first-secret';
    const rotatedPasswordAuthToken = createGreaderAuthToken({
      ...firstUser,
      password: 'second-password-hash'
    });

    expect(rotatedSecretAuthToken).not.toBe(firstAuthToken);
    expect(rotatedSecretActionToken).not.toBe(firstActionToken);
    expect(rotatedPasswordAuthToken).not.toBe(firstAuthToken);
  });
});
