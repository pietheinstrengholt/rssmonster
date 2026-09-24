import { createHash } from 'node:crypto';
import db from '../../../models/index.js';
import { decryptSecret } from '../../secretEncryption.js';
import { normalizeFeedAuthentication } from '../feedAuthentication.js';

// Bind credentials to the configured origin, never to a discovered or redirected host.
export const buildFeedRequestAuthentication = (url, input = {}) => {
  const credentials = normalizeFeedAuthentication(input);
  if (credentials.authenticationType !== 'basic') return null;
  const origin = new URL(url).origin;
  // Native Fetch has no username/password option; URL userinfo remains forbidden.
  const authorization = `Basic ${Buffer.from(`${credentials.authenticationUsername}:${credentials.authenticationPassword}`, 'utf8').toString('base64')}`;
  return Object.freeze({ origin, authorization });
};

// Normal Feed reads exclude the password. Load it only at the retrieval boundary.
export const loadFeedRequestAuthentication = async feed => {
  if (feed?.authenticationType !== 'basic') return null;
  const stored = await db.Feed.findOne({
    where: { id: feed.id, userId: feed.userId },
    attributes: ['url', 'authenticationType', 'authenticationUsername', 'authenticationPassword'],
    logging: false
  });
  if (!stored) throw new Error('Feed credentials are unavailable');
  return buildFeedRequestAuthentication(stored.url, {
    authenticationType: stored.authenticationType,
    authenticationUsername: stored.authenticationUsername,
    authenticationPassword: decryptSecret(stored.authenticationPassword)
  });
};

export const feedAuthenticationHeaders = (authentication, url) =>
  authentication && new URL(url).origin === authentication.origin
    ? { authorization: authentication.authorization }
    : {};

// Requests for different accounts must never share a response or body hash.
export const feedAuthenticationIdentity = authentication => authentication
  ? createHash('sha256').update(`${authentication.origin}\n${authentication.authorization}`).digest('hex')
  : null;

// Automatic URL promotion must not rebind stored credentials to a new origin.
export const assertFeedAuthenticationOrigin = (authentication, url) => {
  if (authentication && new URL(url).origin !== authentication.origin) {
    const error = new Error('Authenticated feed discovery changed origin. Update the feed URL explicitly.');
    error.code = 'FEED_AUTHENTICATION_ORIGIN_CHANGED';
    throw error;
  }
};
