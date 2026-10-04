import { createHmac } from 'node:crypto';
import { Op, Sequelize } from 'sequelize';
import db from '../models/index.js';
import { decryptSecret } from './secretEncryption.js';
import { fetchWithOutboundRequestSafeguard } from '../utils/outboundRequestSafeguard.js';

const { Article, Category, Feed, Webhook, WebhookDelivery, sequelize } = db;

export const WEBHOOK_DELIVERY_POLICY = Object.freeze({
  requestTimeoutMs: 10_000,
  leaseMs: 60_000,
  pollIntervalMs: 1_000,
  concurrency: 5,
  maxAttempts: 5,
  retryDelaysMs: [60_000, 300_000, 1_800_000, 7_200_000]
});

const read = (record, field) => typeof record?.getDataValue === 'function'
  ? record.getDataValue(field)
  : record?.[field];
const wholeSecond = date => new Date(Math.floor(date.getTime() / 1000) * 1000);
const due = now => ({ [Op.lte]: now });

export const nextWebhookRetryAt = (attemptCount, now = new Date()) => {
  const delay = WEBHOOK_DELIVERY_POLICY.retryDelaysMs[attemptCount - 1];
  return delay == null ? null : new Date(now.getTime() + delay);
};

export const isRetryableWebhookStatus = status =>
  status === 408 || status === 425 || status === 429 || status >= 500;

// A claim reserves a due row for longer than the HTTP timeout. Expired claims are retried.
export const claimWebhookDeliveries = async ({
  limit = WEBHOOK_DELIVERY_POLICY.concurrency,
  userId = null,
  now = new Date()
} = {}) => sequelize.transaction({
  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
}, async transaction => {
  const claimTime = wholeSecond(now);
  const deliveries = await WebhookDelivery.findAll({
    where: {
      status: { [Op.in]: ['pending', 'failed'] },
      attemptCount: { [Op.lt]: WEBHOOK_DELIVERY_POLICY.maxAttempts },
      nextAttemptAt: due(claimTime)
    },
    include: [{ model: Webhook, as: 'webhook', attributes: ['id'],
      where: { enabled: true, ...(userId == null ? {} : { userId }) }, required: true }],
    order: [['nextAttemptAt', 'ASC'], ['id', 'ASC']],
    limit: Math.max(1, Math.min(WEBHOOK_DELIVERY_POLICY.concurrency, limit)),
    transaction,
    lock: transaction.LOCK.UPDATE,
    ...(sequelize.getDialect() !== 'sqlite' ? { skipLocked: true } : {})
  });
  const leaseUntil = new Date(claimTime.getTime() + WEBHOOK_DELIVERY_POLICY.leaseMs);
  for (const delivery of deliveries) {
    const previousLastAttemptAt = delivery.lastAttemptAt;
    await delivery.update({
      status: 'pending',
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: claimTime,
      nextAttemptAt: leaseUntil
    }, { transaction });
    delivery.previousLastAttemptAt = previousLastAttemptAt;
  }
  return deliveries;
});

// A crash during the final attempt must not leave a permanently pending row.
export const expireFinalWebhookAttempts = (now = new Date()) => WebhookDelivery.update({
  status: 'failed', nextAttemptAt: null, error: 'DELIVERY_RESULT_UNAVAILABLE'
}, { where: {
  status: 'pending',
  attemptCount: { [Op.gte]: WEBHOOK_DELIVERY_POLICY.maxAttempts },
  lastAttemptAt: { [Op.ne]: null },
  nextAttemptAt: due(now)
} });

export const buildWebhookPayload = ({ delivery, webhook, article, feed, category }) => ({
  version: 1,
  event: 'article.matched',
  deliveryId: read(delivery, 'id'),
  webhook: { id: read(webhook, 'id'), name: read(webhook, 'name') },
  article: {
    id: read(article, 'id'),
    title: read(article, 'title'),
    url: read(article, 'url'),
    author: read(article, 'author') || null,
    publishedAt: read(article, 'publishedAt')?.toISOString?.() || null,
    language: read(article, 'language') || null,
    feed: { id: read(feed, 'id'), title: read(feed, 'feedName') },
    categories: category ? [{ id: read(category, 'id'), title: read(category, 'name') }] : []
  }
});

// Integrations verify sha256=<hex HMAC> over the exact UTF-8 JSON body bytes sent.
export const signWebhookBody = (secret, body) =>
  `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

export const sendWebhookRequest = async ({
  webhook, payload, signal, transport = fetchWithOutboundRequestSafeguard,
  timeoutMs = WEBHOOK_DELIVERY_POLICY.requestTimeoutMs
}) => {
  const body = JSON.stringify(payload);
  const endpointUrl = read(webhook, 'endpointUrl');
  const secretValue = read(webhook, 'secret');
  const secret = secretValue ? decryptSecret(secretValue) : null;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'RSSMonster/2.4.0',
    'X-RSSMonster-Event': 'article.matched',
    'X-RSSMonster-Delivery': String(payload.deliveryId)
  };
  if (secret) headers['X-RSSMonster-Signature'] = signWebhookBody(secret, body);
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
  const response = await transport(endpointUrl, {
    method: 'POST', headers, body, signal: requestSignal
  }, 0, undefined, undefined, {
    connectTimeoutMs: timeoutMs,
    allowPrivateAddresses: true
  });
  try {
    return response.status;
  } finally {
    await response.body?.cancel?.().catch(() => {});
  }
};

const failureCode = error => {
  let current = error;
  while (current) {
    if (current.code === 'SSRF_BLOCKED') return 'ENDPOINT_BLOCKED';
    if (current.code === 'REDIRECT_LIMIT_EXCEEDED') return 'REDIRECT_BLOCKED';
    if (current.name === 'TimeoutError' || current.name === 'AbortError') return 'REQUEST_TIMEOUT';
    current = current.cause;
  }
  if (error?.name === 'SecretEncryptionError') return 'SIGNING_UNAVAILABLE';
  return 'NETWORK_ERROR';
};

const recordResult = async (delivery, { httpStatus = null, error = null, retryable = false }, now) => {
  const success = httpStatus >= 200 && httpStatus < 300;
  const nextAttemptAt = !success && retryable
    ? nextWebhookRetryAt(delivery.attemptCount, now)
    : null;
  await WebhookDelivery.update({
    status: success ? 'success' : 'failed',
    httpStatus,
    error: success ? null : error,
    nextAttemptAt
  }, { where: { id: delivery.id, attemptCount: delivery.attemptCount, status: 'pending' } });
  return { status: success ? 'success' : 'failed', httpStatus, nextAttemptAt };
};

export const processWebhookDelivery = async (delivery, {
  signal,
  now = () => new Date(),
  transport,
  logger = console
} = {}) => {
  const startedAt = Date.now();
  const webhook = await Webhook.unscoped().findByPk(delivery.webhookId, {
    attributes: ['id', 'userId', 'name', 'enabled', 'endpointUrl', 'secret']
  });
  if (!webhook) return { status: 'deleted' };
  if (!webhook.enabled) {
    await WebhookDelivery.update({
      attemptCount: delivery.attemptCount - 1,
      lastAttemptAt: delivery.previousLastAttemptAt,
      nextAttemptAt: now()
    }, { where: { id: delivery.id, attemptCount: delivery.attemptCount, status: 'pending' } });
    return { status: 'disabled' };
  }

  const article = await Article.findOne({ where: { id: delivery.articleId, userId: webhook.userId } });
  const feed = article && await Feed.findOne({ where: { id: article.feedId, userId: webhook.userId } });
  const category = feed && await Category.findOne({ where: { id: feed.categoryId, userId: webhook.userId } });
  let result;
  try {
    if (!article || !feed) {
      result = await recordResult(delivery, { error: 'SOURCE_UNAVAILABLE' }, now());
    } else {
      const payload = buildWebhookPayload({ delivery, webhook, article, feed, category });
      const httpStatus = await sendWebhookRequest({ webhook, payload, signal, transport });
      result = await recordResult(delivery, {
        httpStatus,
        error: httpStatus >= 200 && httpStatus < 300 ? null : `HTTP_${httpStatus}`,
        retryable: isRetryableWebhookStatus(httpStatus)
      }, now());
    }
  } catch (error) {
    const code = failureCode(error);
    result = await recordResult(delivery, {
      error: code,
      retryable: !['ENDPOINT_BLOCKED', 'REDIRECT_BLOCKED'].includes(code)
    }, now());
  }
  logger.log('[WebhookWorker] delivery.result', JSON.stringify({
    deliveryId: delivery.id,
    webhookId: delivery.webhookId,
    articleId: delivery.articleId,
    attempt: delivery.attemptCount,
    status: result.status,
    httpStatus: result.httpStatus,
    durationMs: Date.now() - startedAt
  }));
  return result;
};
