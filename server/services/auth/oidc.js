import { isLocalAuthEnabled } from '../../config/auth.js';
import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { hashOidcValue, passwordVersion, OidcLoginError, resolveOidcIdentity } from './identities.js';
export { hashOidcValue, passwordVersion, OidcLoginError } from './identities.js';

const { OidcTransaction, User } = db;
const randomToken = () => randomBytes(32).toString('base64url');
const isToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const configurationHash = configuration => hashOidcValue(JSON.stringify(configuration));

// Each service owns only a bounded discovery cache; authentication state lives in the database.
export const createOidcService = ({ protocol = null, now = () => new Date() } = {}) => {
  let cached;
  const discover = async configuration => {
    protocol ??= await import('openid-client');
    const key = configurationHash(configuration);
    if (cached?.key === key && cached.expiresAt > now().getTime()) return cached.promise;
    const promise = protocol.discovery(
      new URL(configuration.issuerUrl), configuration.clientId,
      configuration.clientSecret, undefined,
      { timeout: 10, execute: [protocol.enableNonRepudiationChecks] }
    );
    cached = { key, promise, expiresAt: now().getTime() + 5 * 60_000 };
    try {
      return await promise;
    } catch (error) {
      if (cached?.promise === promise) cached = null;
      throw error;
    }
  };

  const start = async (configuration, { linkUser = null } = {}) => {
    if (linkUser && !isLocalAuthEnabled()) throw new OidcLoginError();
    const provider = await discover(configuration);
    const state = randomToken();
    const browser = randomToken();
    const nonce = randomToken();
    const codeVerifier = protocol.randomPKCECodeVerifier();
    const authorizationUrl = protocol.buildAuthorizationUrl(provider, {
      redirect_uri: configuration.redirectUri,
      scope: configuration.scopes.join(' '),
      response_type: 'code',
      state, nonce,
      code_challenge: await protocol.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      prompt: 'select_account'
    }).href;
    // Expired records are removed in bounded batches, including abandoned attempts.
    const expired = await OidcTransaction.findAll({
      attributes: ['stateHash'], where: { expiresAt: { [Op.lte]: now() } }, limit: 100
    });
    if (expired.length) await OidcTransaction.destroy({
      where: { stateHash: { [Op.in]: expired.map(row => row.stateHash) } }
    });
    await OidcTransaction.create({
      stateHash: hashOidcValue(state), browserHash: hashOidcValue(browser),
      configurationHash: configurationHash(configuration), nonce, codeVerifier,
      phase: 'pending', linkUserId: linkUser?.id || null,
      passwordVersion: linkUser ? passwordVersion(linkUser) : null,
      expiresAt: new Date(now().getTime() + 10 * 60_000)
    });
    return { authorizationUrl, browser };
  };

  const callback = async (configuration, url, browser) => {
    const state = url.searchParams.get('state');
    if (!isToken(state) || !isToken(browser) || url.searchParams.getAll('state').length !== 1) throw new OidcLoginError();
    const where = {
      stateHash: hashOidcValue(state), browserHash: hashOidcValue(browser),
      configurationHash: configurationHash(configuration), phase: 'pending',
      expiresAt: { [Op.gt]: now() }
    };
    const attempt = await OidcTransaction.findOne({ where });
    if (!attempt) throw new OidcLoginError();
    const [claimed] = await OidcTransaction.update(
      { phase: 'processing', codeVerifier: null, nonce: null }, { where }
    );
    if (claimed !== 1) throw new OidcLoginError();
    try {
      const provider = await discover(configuration);
      const tokens = await protocol.authorizationCodeGrant(provider, url, {
        expectedState: state, expectedNonce: attempt.nonce,
        pkceCodeVerifier: attempt.codeVerifier, idTokenExpected: true
      });
      const claims = tokens.claims();
      if (claims?.iss !== configuration.issuerUrl || typeof claims.sub !== 'string' || !claims.sub) throw new OidcLoginError();
      const user = await resolveOidcIdentity(claims, {
        accessPolicy: configuration.accessPolicy,
        autoProvision: configuration.autoProvision,
        linkUserId: attempt.linkUserId,
        linkPasswordVersion: attempt.passwordVersion,
        now: now()
      });
      const exchangeCode = randomToken();
      await attempt.update({
        phase: 'ready', codeVerifier: null, nonce: null, userId: user.id,
        passwordVersion: passwordVersion(user), exchangeHash: hashOidcValue(exchangeCode),
        expiresAt: new Date(now().getTime() + 60_000)
      });
      return exchangeCode;
    } catch (error) {
      await attempt.destroy();
      throw error;
    }
  };

  const exchange = async (configuration, code, browser) => {
    if (!isToken(code) || !isToken(browser)) throw new OidcLoginError();
    const where = {
      exchangeHash: hashOidcValue(code), browserHash: hashOidcValue(browser), phase: 'ready',
      configurationHash: configurationHash(configuration), expiresAt: { [Op.gt]: now() }
    };
    const attempt = await OidcTransaction.findOne({ where });
    if (!attempt || await OidcTransaction.destroy({ where }) !== 1) throw new OidcLoginError();
    if (attempt.linkUserId && !isLocalAuthEnabled()) throw new OidcLoginError();
    const user = await User.findByPk(attempt.userId);
    if (!user || passwordVersion(user) !== attempt.passwordVersion) throw new OidcLoginError();
    return { user, linked: Boolean(attempt.linkUserId) };
  };
  return { start, callback, exchange };
};

export const oidcService = createOidcService();
