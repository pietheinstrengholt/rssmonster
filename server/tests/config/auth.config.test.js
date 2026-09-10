import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getFeverCredentialSecret,
  getJwtSecret,
  isRegistrationEnabled,
  getAuthConfiguration,
  validateAuthConfiguration
} from '../../config/auth.js';

const originalJwtSecret = process.env.JWT_SECRET;
const originalFeverCredentialSecret =
  process.env.FEVER_CREDENTIAL_SECRET;

afterEach(() => {
  vi.unstubAllEnvs();
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

describe('registration configuration', () => {
  it.each([undefined, 'true'])('enables registration with %s', value => {
    vi.stubEnv('ALLOW_REGISTRATION', value);
    expect(isRegistrationEnabled()).toBe(true);
  });

  it.each(['false', ' FALSE '])('disables registration with %s', value => {
    vi.stubEnv('ALLOW_REGISTRATION', value);
    expect(isRegistrationEnabled()).toBe(false);
  });
});

const oidcEnvironment = {
  OIDC_ENABLED: 'true',
  OIDC_ISSUER_URL: 'https://identity.example.com',
  OIDC_CLIENT_ID: 'reader',
  OIDC_CLIENT_SECRET: 'private-client-secret',
  OIDC_REDIRECT_URI: 'http://localhost:3000/api/auth/oidc/callback'
};

describe('authentication policies', () => {
  it('preserves the existing defaults without requiring OIDC credentials', () => {
    expect(validateAuthConfiguration({})).toEqual({
      registrationEnabled: true,
      localAuthEnabled: true,
      oidcEnabled: false,
      oidcAutoProvision: false,
      oidc: null
    });
  });

  it('keeps registration, local login, and OIDC provisioning independent', () => {
    expect(getAuthConfiguration({
      ...oidcEnvironment,
      ALLOW_REGISTRATION: 'false',
      LOCAL_AUTH_ENABLED: 'false',
      OIDC_AUTO_PROVISION: 'true'
    })).toMatchObject({
      registrationEnabled: false,
      localAuthEnabled: false,
      oidcEnabled: true,
      oidcAutoProvision: true,
      oidc: { scopes: ['openid', 'profile', 'email'] }
    });
  });

  it.each(['ALLOW_REGISTRATION', 'LOCAL_AUTH_ENABLED', 'OIDC_ENABLED', 'OIDC_AUTO_PROVISION'])(
    'rejects malformed %s without echoing its value', name => {
      expect(() => getAuthConfiguration({ [name]: 'sensitive-invalid-value' }))
        .toThrow(`${name} must be either true or false`);
    }
  );

  it('accepts trimmed, case-insensitive booleans and blank defaults', () => {
    expect(getAuthConfiguration({ ALLOW_REGISTRATION: ' FALSE ', LOCAL_AUTH_ENABLED: ' TRUE ', OIDC_ENABLED: '' }))
      .toMatchObject({ registrationEnabled: false, localAuthEnabled: true, oidcEnabled: false });
  });

  it('rejects disabling every authentication method', () => {
    expect(() => getAuthConfiguration({ LOCAL_AUTH_ENABLED: 'false' }))
      .toThrow('At least one authentication method must be enabled');
  });

  it.each(['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI'])(
    'requires %s only when OIDC is enabled', name => {
      expect(() => getAuthConfiguration({ ...oidcEnvironment, [name]: '' }))
        .toThrow(`${name} is required when OIDC is enabled`);
      expect(getAuthConfiguration({ ...oidcEnvironment, OIDC_ENABLED: 'false', [name]: '' }).oidc).toBeNull();
    }
  );

  it.each([
    ['OIDC_ISSUER_URL', 'not-a-url'],
    ['OIDC_ISSUER_URL', 'http://identity.example.com'],
    ['OIDC_ISSUER_URL', 'https://identity.example.com/?secret=value'],
    ['OIDC_REDIRECT_URI', 'http://reader.example.com/callback'],
    ['OIDC_REDIRECT_URI', 'https://reader.example.com/callback#token'],
    ['OIDC_REDIRECT_URI', 'https://user:secret@reader.example.com/callback']
  ])('rejects unsafe or malformed %s', (name, value) => {
    let error;
    try {
      getAuthConfiguration({ ...oidcEnvironment, [name]: value });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'AUTH_CONFIGURATION_INVALID' });
    expect(error.message).not.toContain(value);
  });

  it.each(['https://reader.example.com/callback', 'http://localhost:3000/callback', 'http://127.0.0.1:3000/callback', 'http://[::1]:3000/callback'])(
    'accepts redirect URI %s', redirectUri => {
      expect(getAuthConfiguration({ ...oidcEnvironment, OIDC_REDIRECT_URI: redirectUri }).oidc.redirectUri).toBe(redirectUri);
    }
  );

  it('requires the openid scope and normalizes whitespace and duplicates', () => {
    expect(() => getAuthConfiguration({ ...oidcEnvironment, OIDC_SCOPES: 'profile email' }))
      .toThrow('OIDC_SCOPES must include openid');
    expect(getAuthConfiguration({ ...oidcEnvironment, OIDC_SCOPES: ' openid  email openid ' }).oidc.scopes)
      .toEqual(['openid', 'email']);
  });

  it('allows OIDC-only authentication and validates the callback path', () => {
    expect(validateAuthConfiguration(oidcEnvironment).oidcEnabled).toBe(true);
    expect(validateAuthConfiguration({ ...oidcEnvironment, LOCAL_AUTH_ENABLED: 'false' }).localAuthEnabled)
      .toBe(false);
    expect(validateAuthConfiguration({ ...oidcEnvironment, OIDC_AUTO_PROVISION: 'true' }).oidc.autoProvision)
      .toBe(true);
    expect(() => validateAuthConfiguration({ ...oidcEnvironment, OIDC_REDIRECT_URI: 'https://reader.example.com/wrong' }))
      .toThrow('OIDC_REDIRECT_URI must use the path /api/auth/oidc/callback');
  });
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

describe('OIDC access restriction configuration', () => {
  it('defaults to no restrictions and normalizes configured lists', () => {
    expect(getAuthConfiguration(oidcEnvironment).oidc.accessPolicy).toEqual({ allowedEmailDomains: [], allowedGroups: [], groupsClaim: 'groups' });
    expect(getAuthConfiguration({ ...oidcEnvironment, OIDC_ALLOWED_EMAIL_DOMAINS: ' Example.COM,example.com,example.org ', OIDC_ALLOWED_GROUPS: 'Readers,Administrators,Readers', OIDC_GROUPS_CLAIM: ' custom.groups ' }).oidc.accessPolicy)
      .toEqual({ allowedEmailDomains: ['example.com', 'example.org'], allowedGroups: ['Readers', 'Administrators'], groupsClaim: 'custom.groups' });
  });

  it.each(['*.example.com', '@example.com', 'https://example.com', 'example.com,', ',example.com', 'example..com', '-example.com', 'example.com.', 'example.com evil.com'])(
    'rejects malformed domain allowlist %s', value => {
      expect(() => getAuthConfiguration({ ...oidcEnvironment, OIDC_ALLOWED_EMAIL_DOMAINS: value })).toThrow();
    }
  );

  it('rejects empty group entries but ignores provider settings when disabled', () => {
    expect(() => getAuthConfiguration({ ...oidcEnvironment, OIDC_ALLOWED_GROUPS: 'readers,,admins' })).toThrow('OIDC_ALLOWED_GROUPS');
    expect(getAuthConfiguration({ OIDC_ALLOWED_EMAIL_DOMAINS: '*', OIDC_ALLOWED_GROUPS: ',' }).oidc).toBeNull();
    expect(getAuthConfiguration({ ...oidcEnvironment, OIDC_ALLOWED_EMAIL_DOMAINS: ' ', OIDC_ALLOWED_GROUPS: '', OIDC_GROUPS_CLAIM: ' ' }).oidc.accessPolicy)
      .toEqual({ allowedEmailDomains: [], allowedGroups: [], groupsClaim: 'groups' });
  });
});


describe('OIDC frontend return URL', () => {
  it('defaults to the callback origin and accepts separate frontend ports', () => {
    expect(getAuthConfiguration(oidcEnvironment).oidc.frontendUrl).toBe('http://localhost:3000/');
    expect(getAuthConfiguration({ ...oidcEnvironment, OIDC_FRONTEND_URL: 'http://localhost:8080' }).oidc.frontendUrl).toBe('http://localhost:8080');
  });

  it.each(['https://attacker.example', 'http://127.0.0.1:8080', 'https://localhost:8080', 'http://localhost:8080/path', 'http://localhost:8080/?next=evil', 'http://user:password@localhost:8080', 'javascript:alert(1)'])(
    'rejects incompatible frontend URL %s', frontendUrl => {
      expect(() => getAuthConfiguration({ ...oidcEnvironment, OIDC_FRONTEND_URL: frontendUrl })).toThrow();
    }
  );
});
