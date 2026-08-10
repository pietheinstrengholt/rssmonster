import { Sequelize } from 'sequelize';
import db from '../../models/index.js';
import {
  CRAWL_OUTCOMES,
  classifyCrawlOutcome,
  isSuccessfulCrawlOutcome
} from './crawlResult.js';
import { FETCH_OUTCOMES } from './http/contracts.js';

const { sequelize, Feed, FeedCrawlResult } = db;
const MAX_ERROR_MESSAGE_LENGTH = 1000;
const MAX_ATTEMPT_SUMMARY_ITEMS = 20;

// Converts the operational category into the durable three-state lifecycle.
export const resolveFeedCrawlStatus = category => {
  if (category === CRAWL_OUTCOMES.RECOVERED) return 'RECOVERED';
  return isSuccessfulCrawlOutcome(category) ? 'SUCCESS' : 'FAILED';
};

// Classifies the primary failure that a successful alternate endpoint recovered from.
export const resolveRecoveryErrorCategory = outcome => {
  if (!outcome?.discovery?.recovered) return null;
  const primary = outcome.discovery.primary || {};
  const parserFailure = primary.parserFailure || null;
  const primaryOutcome = {
    type: primary.outcomeType || (
      parserFailure ? FETCH_OUTCOMES.MALFORMED : null
    ),
    response: Number.isInteger(primary.httpStatus)
      ? { status: primary.httpStatus }
      : null,
    error: {
      status: primary.httpStatus ?? null,
      code: parserFailure?.code || primary.errorCode || null,
      reason: parserFailure?.reason || null
    }
  };
  const category = classifyCrawlOutcome({ outcome: primaryOutcome });
  return isSuccessfulCrawlOutcome(category) ? null : category;
};

// Bounds candidate diagnostics to compact non-sensitive fields suitable for JSON persistence.
const buildAttemptSummary = (outcome, requestedUrl) => {
  const candidates = Array.isArray(outcome?.discovery?.candidates)
    ? outcome.discovery.candidates.slice(0, MAX_ATTEMPT_SUMMARY_ITEMS)
    : [];
  if (candidates.length === 0 && !outcome?.discovery?.primary) return null;
  const primary = outcome.discovery.primary;
  return [{
    type: 'ORIGINAL',
    url: String(requestedUrl || '').slice(0, 2048),
    outcome: String(
      primary?.outcomeType || primary?.parserFailure?.code || 'UNKNOWN'
    ).slice(0, 64),
    ...(Number.isInteger(primary?.httpStatus) ? { httpStatus: primary.httpStatus } : {})
  }, ...candidates.map(candidate => ({
    type: 'DISCOVERY',
    url: String(candidate?.resolvedUrl || candidate?.requestedUrl || '').slice(0, 2048),
    outcome: String(
      candidate?.outcomeType || candidate?.parserFailure?.code || 'UNKNOWN'
    ).slice(0, 64),
    ...(Number.isInteger(candidate?.httpStatus) ? { httpStatus: candidate.httpStatus } : {})
  }))];
};

// Persists the final result and updates the feed health cache in one transaction.
export const persistFeedCrawlResult = async ({
  crawlRunId,
  feed,
  requestedUrl,
  outcome,
  error,
  category,
  startedAt,
  completedAt,
  durationMs,
  itemCount = 0,
  articlesNew = 0,
  articlesUpdated = 0,
  articlesUnchanged = 0,
  articlesDuplicate = 0
}) => {
  if (!crawlRunId || !feed?.id || !feed?.userId) return null;
  const status = resolveFeedCrawlStatus(category);
  const successful = status !== 'FAILED';
  const recoveryAttempted = Boolean(outcome?.discovery?.recovered) ||
    Number(outcome?.discovery?.candidateCount || 0) > 1 ||
    Number(outcome?.discovery?.attempts || 1) > 1;
  const resolvedUrl = outcome?.discovery?.resolvedUrl || outcome?.url || feed.url || null;
  const errorMessage = error?.message || outcome?.error?.message || null;
  const recoveryErrorCategory = status === 'RECOVERED'
    ? resolveRecoveryErrorCategory(outcome)
    : null;
  const values = {
    crawlRunId,
    userId: feed.userId,
    feedId: feed.id,
    status,
    errorCategory: status === 'FAILED' ? category : recoveryErrorCategory,
    errorCode: String(outcome?.error?.code || error?.code || '').slice(0, 128) || null,
    httpStatus: outcome?.response?.status ?? outcome?.error?.status ?? null,
    requestedUrl,
    resolvedUrl,
    recoveryAttempted,
    recoverySucceeded: status === 'RECOVERED',
    attemptCount: Math.max(1, Number(outcome?.discovery?.attempts ?? outcome?.attempts ?? 1)),
    itemsFetched: Math.max(0, Number(itemCount) || 0),
    articlesNew: Math.max(0, Number(articlesNew) || 0),
    articlesUpdated: Math.max(0, Number(articlesUpdated) || 0),
    articlesUnchanged: Math.max(0, Number(articlesUnchanged) || 0),
    articlesDuplicate: Math.max(0, Number(articlesDuplicate) || 0),
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    errorMessage: errorMessage ? String(errorMessage).slice(0, MAX_ERROR_MESSAGE_LENGTH) : null,
    attemptSummary: buildAttemptSummary(outcome, requestedUrl),
    startedAt,
    completedAt
  };

  return sequelize.transaction(async transaction => {
    const result = await FeedCrawlResult.create(values, { transaction });
    const health = {
      lastCrawlAt: completedAt,
      lastCrawlStatus: status,
      lastCrawlErrorCategory: successful ? null : category,
      lastCrawlDurationMs: values.durationMs,
      ...(successful
        ? {
          lastSuccessfulCrawlAt: completedAt,
          consecutiveFailures: 0,
          totalCrawlSuccesses: Sequelize.literal('totalCrawlSuccesses + 1')
        }
        : {
          ...(category === CRAWL_OUTCOMES.VALIDATION_ERROR
            ? { consecutiveFailures: Sequelize.literal('consecutiveFailures + 1') }
            : {}),
          totalCrawlFailures: Sequelize.literal('totalCrawlFailures + 1')
        })
    };
    await Feed.update(health, { where: { id: feed.id, userId: feed.userId }, transaction });
    return result;
  });
};

export default {
  persistFeedCrawlResult,
  resolveFeedCrawlStatus,
  resolveRecoveryErrorCategory
};
