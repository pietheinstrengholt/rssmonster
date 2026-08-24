import { createHash, randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { redactFeedLogText, sanitizeFeedLogValue } from '../feeds/feedLogging.js';

const { ProcessingFailure } = db;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
const MAX_CONTEXT_LENGTH = 8000;
const RECORDED_FAILURE = Symbol('processingFailureRecorded');
const SENSITIVE_CONTEXT_KEY = /authorization|cookie|credential|password|secret|token|api[-_]?key/i;

// Redacts common non-URL credential forms that can appear in provider errors.
const redactSensitiveText = value => redactFeedLogText(value)
  .replace(/\b(Bearer)\s+[^\s,;]+/gi, '$1 REDACTED')
  .replace(
    /\b(api[-_]?key|authorization|credential|password|secret|token)\s*[:=]\s*[^\s,;&]+/gi,
    '$1=REDACTED'
  );

// Bounds one optional scalar identifier without retaining arbitrary objects.
const boundedString = (value, maximum) => {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  return redactSensitiveText(String(value)).slice(0, maximum) || null;
};

// Converts arbitrary context into a bounded, redacted JSON value.
const sanitizeContext = context => {
  if (!context || typeof context !== 'object') return null;
  const sanitized = sanitizeFeedLogValue(context);
  const redactKeys = value => {
    if (Array.isArray(value)) return value.map(redactKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_CONTEXT_KEY.test(key) ? 'REDACTED' : redactKeys(item)
    ]));
  };
  const redacted = redactKeys(sanitized);
  const serialized = JSON.stringify(redacted);
  if (serialized.length <= MAX_CONTEXT_LENGTH) return redacted;
  return {
    truncated: true,
    preview: serialized.slice(0, MAX_CONTEXT_LENGTH)
  };
};

// Classifies a caught error into the deliberately small persistence taxonomy.
export const classifyProcessingFailure = error => {
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '').toUpperCase();
  const message = String(error?.message || error || '').toUpperCase();

  if (
    name.includes('TIMEOUT') ||
    code.includes('TIMEOUT') ||
    message.includes('TIMED OUT') ||
    message.includes('TIMEOUT')
  ) return 'TIMEOUT';
  if (code.includes('RATE_LIMIT') || message.includes('RATE LIMIT')) return 'RATE_LIMITED';
  if (code === 'FEED_LEASE_LOST' || code.includes('LEASE_LOST')) return 'LEASE_LOST';
  if (
    name === 'ABORTERROR' ||
    code.includes('ABORT') ||
    code.includes('CANCEL')
  ) return 'CANCELLED';
  if (
    code.includes('UNAVAILABLE') ||
    code.includes('CONNECTION') ||
    message.includes('UNAVAILABLE')
  ) return 'UNAVAILABLE';
  if (
    name.includes('SEQUELIZE') ||
    code.includes('DATABASE') ||
    code.includes('PERSISTENCE')
  ) return 'PERSISTENCE_FAILURE';
  if (
    name.includes('VALIDATION') ||
    code.includes('VALIDATION') ||
    code.includes('INVALID') ||
    code.includes('MALFORMED')
  ) return 'INVALID_DATA';
  return 'ERROR';
};

// Builds a stable grouping key while keeping every occurrence append-only.
export const processingFailureFingerprint = ({ stage, failureType, code, errorName, message }) =>
  createHash('sha256')
    .update([
      stage,
      failureType,
      code || '',
      errorName || '',
      String(message || '')
        .replace(/https?:\/\/\S+/gi, '<url>')
        .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<uuid>')
        .replace(/\b\d+\b/g, '<number>')
    ].join('|'))
    .digest('hex');

// Reports whether a propagating Error already has a successfully persisted observation.
export const wasProcessingFailureRecorded = error => Boolean(error?.[RECORDED_FAILURE]);

// Persists one abnormal outcome without ever replacing the original application failure.
export const recordProcessingFailure = async ({
  crawlRunId = null,
  executionId = null,
  userId,
  stage,
  failureType = null,
  severity = 'ERROR',
  code = null,
  error = null,
  message = null,
  subjectType = null,
  subjectId = null,
  feedId = null,
  articleId = null,
  retryable = null,
  attemptNumber = null,
  context = null,
  occurredAt = new Date()
} = {}) => {
  const resolvedUserId = Number(userId);
  if (!Number.isSafeInteger(resolvedUserId) || resolvedUserId <= 0 || !stage) {
    console.error('[OBSERVABILITY] Cannot record processing failure without userId and stage.');
    return null;
  }
  if (wasProcessingFailureRecorded(error)) return null;

  const resolvedMessage = boundedString(
    message || error?.message || error || 'Unknown processing failure',
    MAX_MESSAGE_LENGTH
  ) || 'Unknown processing failure';
  const resolvedType = failureType || classifyProcessingFailure(error || resolvedMessage);
  const resolvedCode = boundedString(code || error?.code, 128);
  const errorName = boundedString(error?.name, 128);
  const values = {
    crawlRunId: crawlRunId ? Number(crawlRunId) : null,
    executionId: executionId || randomUUID(),
    userId: resolvedUserId,
    stage: String(stage).slice(0, 64),
    failureType: resolvedType,
    severity,
    code: resolvedCode,
    errorName,
    message: resolvedMessage,
    stackTrace: boundedString(error?.stack, MAX_STACK_LENGTH),
    subjectType: boundedString(subjectType, 32),
    subjectId: boundedString(subjectId, 128),
    feedId: feedId ? Number(feedId) : null,
    articleId: articleId ? Number(articleId) : null,
    retryable: retryable ?? ['TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE', 'LEASE_LOST'].includes(resolvedType),
    attemptNumber: Number.isSafeInteger(Number(attemptNumber)) ? Number(attemptNumber) : null,
    context: sanitizeContext(context),
    occurredAt
  };
  values.fingerprint = processingFailureFingerprint(values);

  try {
    const failure = await ProcessingFailure.create(values);
    if (error && typeof error === 'object' && Object.isExtensible(error)) {
      Object.defineProperty(error, RECORDED_FAILURE, {
        value: true,
        configurable: false,
        enumerable: false
      });
    }
    return failure;
  } catch (observabilityError) {
    console.error(
      '[OBSERVABILITY] Failed to record processing failure:',
      sanitizeFeedLogValue(observabilityError)
    );
    return null;
  }
};

export default { classifyProcessingFailure, recordProcessingFailure };
