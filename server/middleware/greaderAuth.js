import crypto from 'node:crypto';
import db from '../models/index.js';
import {
  createGreaderActionToken,
  createGreaderAuthToken
} from '../utils/apiCredentials.js';

const { User } = db;

const AUTH_PREFIX = 'GoogleLogin auth=';
const LEGACY_AUTH_PREFIX = 'GoogleLogin_auth=';
const AUTH_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const DUMMY_USER = {
  id: 0,
  password: 'invalid-google-reader-credential'
};

// This function sends the Google Reader bad-token response without credential details.
export const sendGreaderUnauthorized = res =>
  res
    .set('Google-Bad-Token', 'true')
    .status(401)
    .type('text/plain')
    .send('Unauthorized');

// This function compares equal-format credentials without data-dependent byte comparison.
const credentialsMatch = (candidate, expected) => {
  if (
    typeof candidate !== 'string' ||
    typeof expected !== 'string'
  ) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
};

// This function parses supported Google Reader authorization header formats.
export const parseGreaderAuthorization = authorization => {
  if (typeof authorization !== 'string') {
    return null;
  }

  // Parse GoogleLogin auth header: "GoogleLogin auth=username/token"
  const prefix = authorization.startsWith(AUTH_PREFIX)
    ? AUTH_PREFIX
    : authorization.startsWith(LEGACY_AUTH_PREFIX)
      ? LEGACY_AUTH_PREFIX
      : null;
  if (!prefix) {
    return null;
  }

  const credential = authorization.slice(prefix.length);
  const separatorIndex = credential.length - 65;
  if (
    separatorIndex < 1 ||
    credential[separatorIndex] !== '/'
  ) {
    return null;
  }

  const username = credential.slice(0, separatorIndex);
  const token = credential.slice(separatorIndex + 1);
  if (!AUTH_TOKEN_PATTERN.test(token)) {
    return null;
  }

  return { username, token };
};

// Helper to validate auth header and return user.
// This middleware authenticates one Google Reader request and caches its user.
export const authenticateGreader = async (req, res, next) => {
  try {
    const credential = parseGreaderAuthorization(req.headers.authorization);
    if (!credential) {
      return sendGreaderUnauthorized(res);
    }

    const user = await User.findOne({
      where: { username: credential.username },
      attributes: ['id', 'username', 'password']
    });
    const expectedToken = createGreaderAuthToken(user || DUMMY_USER);
    const validToken = credentialsMatch(credential.token, expectedToken);
    if (!user || !validToken) {
      return sendGreaderUnauthorized(res);
    }

    req.greaderUser = user;
    req.greaderAuthToken = credential.token;
    return next();
  } catch (err) {
    console.error('Error in authenticateGreader:', err);
    return res.status(500).json({ error: 'Authentication unavailable' });
  }
};

// This middleware validates the action token required by Google Reader mutations.
export const validateGreaderActionToken = (req, res, next) => {
  const actionToken = req.body?.T ?? req.query.T;
  const expectedToken = createGreaderActionToken(
    req.greaderUser,
    req.greaderAuthToken
  );

  if (!credentialsMatch(actionToken, expectedToken)) {
    return sendGreaderUnauthorized(res);
  }

  return next();
};
