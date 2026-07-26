import { afterEach, describe, expect, it } from 'vitest';

import {
  getFeverCredentialSecret,
  getJwtSecret
} from '../../config/auth.js';

const originalJwtSecret = process.env.JWT_SECRET;
const originalFeverCredentialSecret =
  process.env.FEVER_CREDENTIAL_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  if (originalFeverCredentialSecret === undefined) {
    delete process.env.FEVER_CREDENTIAL_SECRET;
  } else {
    process.env.FEVER_CREDENTIAL_SECRET =
      originalFeverCredentialSecret;
  }
});

describe('JWT configuration', () => {
  it('returns the configured JWT secret', () => {
    process.env.JWT_SECRET = 'configured-secret';

    expect(getJwtSecret()).toBe('configured-secret');
  });

  it('rejects missing JWT configuration', () => {
    delete process.env.JWT_SECRET;

    expect(() => getJwtSecret()).toThrow(
      'Missing required env var: JWT_SECRET'
    );
  });

  it('requires a separate Fever credential secret', () => {
    process.env.FEVER_CREDENTIAL_SECRET = 'configured-fever-secret';
    expect(getFeverCredentialSecret()).toBe(
      'configured-fever-secret'
    );

    delete process.env.FEVER_CREDENTIAL_SECRET;
    expect(() => getFeverCredentialSecret()).toThrow(
      'Missing required env var: FEVER_CREDENTIAL_SECRET'
    );
  });
});
