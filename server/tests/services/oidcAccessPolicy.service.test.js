import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import db from '../../models/index.js';
import { createOidcService, hashOidcValue } from '../../services/auth/oidc.js';

const ids = [], states = [];
const configuration = {
  issuerUrl: 'https://issuer.example.com', clientId: 'reader', clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3000/api/auth/oidc/callback', scopes: ['openid', 'email'],
  autoProvision: true, accessPolicy: { allowedEmailDomains: ['example.com'] }
};

// The protocol adapter supplies already validated claims; this suite tests application policy, not cryptography.
const attempt = async email => {
  const claims = { iss: configuration.issuerUrl, sub: randomBytes(16).toString('hex'), email, email_verified: true };
  const protocol = {
    discovery: vi.fn(async () => ({})), enableNonRepudiationChecks: vi.fn(),
    randomPKCECodeVerifier: () => 'test-verifier', calculatePKCECodeChallenge: async () => 'test-challenge',
    buildAuthorizationUrl: (_provider, parameters) => new URL('https://issuer.example.com/auth?' + new URLSearchParams(parameters)),
    authorizationCodeGrant: vi.fn(async () => ({ claims: () => claims }))
  };
  const service = createOidcService({ protocol });
  const { authorizationUrl, browser } = await service.start(configuration);
  const state = new URL(authorizationUrl).searchParams.get('state');
  states.push(hashOidcValue(state));
  const url = new URL(configuration.redirectUri + '?code=test&state=' + state);
  return { service, browser, url, protocol };
};

afterEach(async () => {
  await db.OidcTransaction.destroy({ where: { stateHash: states.splice(0) } });
  await db.User.destroy({ where: { id: ids.splice(0) } });
});

describe('OIDC callback access policy', () => {
  it('rejects disallowed claims before provisioning and removes the attempt', async () => {
    const { service, browser, url } = await attempt('user@other.org');
    await expect(service.callback(configuration, url, browser)).rejects.toMatchObject({ name: 'OidcLoginError' });
    expect(await db.OidcTransaction.findByPk(states[0])).toBeNull();
  });

  it('allows a matching identity through handoff but rejects a changed policy', async () => {
    const { service, browser, url } = await attempt(`reader-${randomBytes(8).toString('hex')}@example.com`);
    const code = await service.callback(configuration, url, browser);
    const row = await db.OidcTransaction.findByPk(states[0]);
    ids.push(row.userId);
    await expect(service.exchange({ ...configuration, accessPolicy: { allowedEmailDomains: ['other.org'] } }, code, browser))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
    expect(await service.exchange(configuration, code, browser)).toMatchObject({ user: { id: row.userId }, linked: false });
  });

  it('rejects callbacks begun under an earlier policy before token exchange', async () => {
    const { service, browser, url, protocol } = await attempt('user@example.com');
    await expect(service.callback({ ...configuration, accessPolicy: { allowedGroups: ['Readers'] } }, url, browser))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
    expect(protocol.authorizationCodeGrant).not.toHaveBeenCalled();
  });
});
