import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from '../../config/auth.js';

const CURSOR_VERSION = 1;
const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CURSOR_LENGTH = 4096;

export class ArticleSearchCursorError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ArticleSearchCursorError';
    this.code = code;
    this.status = status;
  }
}

// Returns the dedicated cursor secret, retaining JWT_SECRET as a deployment-compatible fallback.
const cursorSecret = () => process.env.ARTICLE_CURSOR_SECRET || getJwtSecret();

// Serializes plain query metadata with stable object-key ordering.
const stableSerialize = value => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
};

// Hashes the normalized effective search without exposing it in cursor payloads.
export const fingerprintArticleSearch = query => (
  createHash('sha256').update(stableSerialize(query)).digest('base64url')
);

const signPayload = encodedPayload => (
  createHmac('sha256', cursorSecret()).update(encodedPayload).digest('base64url')
);

// Issues one opaque page cursor with a bounded lifetime.
export const createArticleSearchCursor = ({
  userId,
  queryHash,
  sort,
  snapshotMaxArticleId,
  position,
  consumedCount,
  totalCount,
  sourceCount,
  now = Date.now(),
  ttlMs = CURSOR_TTL_MS
}) => {
  const payload = {
    type: 'article-search',
    version: CURSOR_VERSION,
    userId: Number(userId),
    queryHash,
    sort,
    snapshotMaxArticleId: Number(snapshotMaxArticleId),
    position,
    consumedCount: Number(consumedCount),
    totalCount: Number(totalCount),
    sourceCount: Number(sourceCount),
    expiresAt: now + ttlMs
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
};

// Parses and validates an opaque cursor before its values can affect a query.
export const parseArticleSearchCursor = (token, { userId, queryHash, sort, now = Date.now() }) => {
  if (typeof token !== 'string' || !token || token.length > MAX_CURSOR_LENGTH) {
    throw new ArticleSearchCursorError('CURSOR_MALFORMED', 'The article cursor is malformed.');
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(Boolean)) {
    throw new ArticleSearchCursorError('CURSOR_MALFORMED', 'The article cursor is malformed.');
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new ArticleSearchCursorError('CURSOR_INVALID', 'The article cursor is invalid.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new ArticleSearchCursorError('CURSOR_MALFORMED', 'The article cursor is malformed.');
  }

  if (payload?.type !== 'article-search' || payload?.version !== CURSOR_VERSION) {
    throw new ArticleSearchCursorError(
      'CURSOR_VERSION_UNSUPPORTED',
      'The article cursor version is unsupported.',
      422
    );
  }
  if (Number(payload.userId) !== Number(userId)) {
    throw new ArticleSearchCursorError('CURSOR_USER_MISMATCH', 'The article cursor belongs to another user.', 403);
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) {
    throw new ArticleSearchCursorError('CURSOR_EXPIRED', 'The article cursor has expired.', 410);
  }
  if (payload.queryHash !== queryHash || payload.sort !== sort) {
    throw new ArticleSearchCursorError(
      'CURSOR_QUERY_MISMATCH',
      'The article cursor does not belong to the active query.',
      409
    );
  }
  if (
    !Number.isSafeInteger(payload.snapshotMaxArticleId)
    || payload.snapshotMaxArticleId < 0
    || !Number.isSafeInteger(payload.consumedCount)
    || payload.consumedCount < 0
    || !Number.isSafeInteger(payload.totalCount)
    || payload.totalCount < 0
    || !Number.isSafeInteger(payload.sourceCount)
    || payload.sourceCount < 0
    || !payload.position
  ) {
    throw new ArticleSearchCursorError('CURSOR_MALFORMED', 'The article cursor is malformed.');
  }

  return payload;
};

export const articleSearchCursorExpiresAt = (now = Date.now()) => (
  new Date(now + CURSOR_TTL_MS).toISOString()
);
