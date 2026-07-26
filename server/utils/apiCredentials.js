import crypto from 'node:crypto';

import {
  getFeverCredentialSecret,
  getJwtSecret
} from '../config/auth.js';

const FEVER_CREDENTIAL_CONTEXT = 'rssmonster:fever-api-key:v1:';
const GREADER_TOKEN_CONTEXT = 'rssmonster:greader-token:v1:';

// This function creates the API key required by the legacy Fever wire protocol.
export const createFeverApiKey = (username, password) =>
  crypto
    .createHash('md5')
    .update(`${username}:${password}`)
    .digest('hex');

// This function creates a keyed database lookup value for a Fever API key.
export const createFeverCredentialHash = apiKey =>
  crypto
    .createHmac('sha256', getFeverCredentialSecret())
    .update(`${FEVER_CREDENTIAL_CONTEXT}${apiKey}`)
    .digest('hex');

// This function creates an opaque Google Reader bearer token.
export const createGreaderAuthToken = user =>
  crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${GREADER_TOKEN_CONTEXT}${user.id}:${user.password}`)
    .digest('hex');
