import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { normalizeEmailAddress } from '../../config/email.js';

const { EmailDelivery, Sequelize, User, sequelize } = db;
const { Op } = Sequelize;

export const DEFAULT_EMAIL_LEASE_MS = 2 * 60 * 1000;
export const DEFAULT_EMAIL_MAX_ATTEMPTS = 5;
export const DEFAULT_EMAIL_RETRY_BASE_MS = 30 * 1000;
export const DEFAULT_EMAIL_RETRY_MAX_MS = 60 * 60 * 1000;
const MAX_CLAIM_LIMIT = 100;
const CLAIM_DEADLOCK_ATTEMPTS = 3;
const VERIFIED_ADDRESS_MESSAGE_TYPES = new Set(['daily_digest', 'password_reset']);

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const requiredString = (value, field, maxLength) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty string of at most ${maxLength} characters`);
  }
  return normalized;
};

const requiredId = (value, field) => {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return normalized;
};

const normalizedDate = (value, field) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date;
};

const isClaimDeadlock = error => [
  error?.original?.code,
  error?.parent?.code,
  error?.code
].includes('ER_LOCK_DEADLOCK') || /deadlock/i.test(error?.message || '');

const claimLimit = limit => {
  const bounded = Math.min(positiveInteger(limit, 10), MAX_CLAIM_LIMIT);
  return sequelize.getDialect() === 'sqlite' ? 1 : bounded;
};

const lockOptions = transaction => ({
  transaction,
  lock: transaction.LOCK.UPDATE,
  ...(sequelize.getDialect() === 'mysql' ? { skipLocked: true } : {})
});

const attemptsRemaining = () => Sequelize.where(
  Sequelize.col('attemptCount'),
  Op.lt,
  Sequelize.col('maxAttempts')
);

const validatePayload = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload must be an object');
  }
  const subject = requiredString(payload.subject, 'payload.subject', 998);
  if (/[\r\n]/.test(subject)) throw new TypeError('payload.subject must be a single line');
  return {
    subject,
    text: requiredString(payload.text, 'payload.text', 1_000_000),
    html: requiredString(payload.html, 'payload.html', 2_000_000)
  };
};

// Calculates bounded exponential retry delay with positive jitter.
export const emailRetryDelayMs = (retryCount, {
  baseDelayMs = DEFAULT_EMAIL_RETRY_BASE_MS,
  maxDelayMs = DEFAULT_EMAIL_RETRY_MAX_MS,
  jitterRatio = 0.25,
  random = Math.random
} = {}) => {
  const base = positiveInteger(baseDelayMs, DEFAULT_EMAIL_RETRY_BASE_MS);
  const maximum = positiveInteger(maxDelayMs, DEFAULT_EMAIL_RETRY_MAX_MS);
  const exponent = Math.max(0, positiveInteger(retryCount, 1) - 1);
  const exponential = Math.min(maximum, base * (2 ** exponent));
  const normalizedRatio = Number.isFinite(jitterRatio) ? Math.max(0, jitterRatio) : 0.25;
  return Math.min(maximum, exponential + Math.floor(exponential * normalizedRatio * random()));
};

// Persists a rendered email before any delivery attempt and returns its stable duplicate.
export const enqueueEmailDelivery = async ({
  userId,
  messageType,
  recipient,
  dedupeKey,
  payload,
  scheduledAt = new Date(),
  maxAttempts = DEFAULT_EMAIL_MAX_ATTEMPTS
}, { transaction = null } = {}) => {
  const normalizedUserId = requiredId(userId, 'userId');
  const normalizedType = requiredString(messageType, 'messageType', 64);
  if (!/^[a-z0-9_-]+$/i.test(normalizedType)) {
    throw new TypeError('messageType contains unsupported characters');
  }
  const normalizedDedupeKey = requiredString(dedupeKey, 'dedupeKey', 255);
  const normalizedRecipient = normalizeEmailAddress(recipient);
  const normalizedScheduledAt = normalizedDate(scheduledAt, 'scheduledAt');
  const ownedUser = await User.findByPk(normalizedUserId, {
    attributes: ['id', 'email', 'emailVerifiedAt'],
    transaction
  });
  if (!ownedUser) throw new TypeError('userId must identify an existing user');
  if (VERIFIED_ADDRESS_MESSAGE_TYPES.has(normalizedType) && (
    !ownedUser.emailVerifiedAt || ownedUser.email !== normalizedRecipient
  )) {
    throw new TypeError(`${normalizedType} requires the user's verified email address`);
  }

  const [delivery, created] = await EmailDelivery.findOrCreate({
    where: {
      userId: normalizedUserId,
      messageType: normalizedType,
      dedupeKey: normalizedDedupeKey
    },
    defaults: {
      recipient: normalizedRecipient,
      payload: validatePayload(payload),
      scheduledAt: normalizedScheduledAt,
      availableAt: normalizedScheduledAt,
      maxAttempts: positiveInteger(maxAttempts, DEFAULT_EMAIL_MAX_ATTEMPTS)
    },
    transaction
  });
  return { delivery, created };
};

// Marks exhausted pending or abandoned deliveries terminal before a claim pass.
const terminalizeExhaustedDeliveries = (now, transaction) => EmailDelivery.update({
  status: 'failed',
  leaseOwner: null,
  leaseUntil: null,
  completedAt: now,
  lastError: 'EMAIL_ATTEMPTS_EXHAUSTED: email delivery attempts exhausted'
}, {
  where: {
    [Op.or]: [
      { status: 'pending' },
      { status: 'sending', leaseUntil: { [Op.lte]: now } }
    ],
    [Op.and]: Sequelize.where(
      Sequelize.col('attemptCount'),
      Op.gte,
      Sequelize.col('maxAttempts')
    )
  },
  transaction,
  hooks: false
});

// Atomically claims a bounded batch without allowing concurrent workers to share rows.
export const claimEmailDeliveries = async ({
  limit = 10,
  now = new Date(),
  leaseMs = DEFAULT_EMAIL_LEASE_MS,
  leaseOwner = randomUUID()
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');
  const normalizedLeaseOwner = requiredString(leaseOwner, 'leaseOwner', 64);
  const leaseUntil = new Date(
    normalizedNow.getTime() + positiveInteger(leaseMs, DEFAULT_EMAIL_LEASE_MS)
  );

  for (let attempt = 1; attempt <= CLAIM_DEADLOCK_ATTEMPTS; attempt++) {
    try {
      return await sequelize.transaction({
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
      }, async transaction => {
        await terminalizeExhaustedDeliveries(normalizedNow, transaction);
        const deliveries = await EmailDelivery.findAll({
          where: {
            [Op.or]: [
              {
                status: 'pending',
                availableAt: { [Op.lte]: normalizedNow },
                [Op.or]: [
                  { leaseUntil: { [Op.is]: null } },
                  { leaseUntil: { [Op.lte]: normalizedNow } }
                ],
                [Op.and]: attemptsRemaining()
              },
              {
                status: 'sending',
                leaseUntil: { [Op.lte]: normalizedNow },
                [Op.and]: attemptsRemaining()
              }
            ]
          },
          order: [['scheduledAt', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
          limit: claimLimit(limit),
          ...lockOptions(transaction)
        });

        for (const delivery of deliveries) {
          const recovered = delivery.status === 'sending';
          await delivery.update({
            status: 'sending',
            attemptCount: Number(delivery.attemptCount || 0) + 1,
            retryCount: Number(delivery.retryCount || 0) + (recovered ? 1 : 0),
            leaseOwner: normalizedLeaseOwner,
            leaseUntil,
            completedAt: null
          }, { transaction, hooks: false });
        }
        return deliveries;
      });
    } catch (error) {
      if (attempt === CLAIM_DEADLOCK_ATTEMPTS || !isClaimDeadlock(error)) throw error;
    }
  }
  return [];
};

// Extends only the live lease owned by the sending worker.
export const renewEmailDeliveryLease = async ({ deliveryId, userId, leaseOwner }, {
  now = new Date(),
  leaseMs = DEFAULT_EMAIL_LEASE_MS
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');
  const leaseUntil = new Date(
    normalizedNow.getTime() + positiveInteger(leaseMs, DEFAULT_EMAIL_LEASE_MS)
  );
  const identity = {
    id: requiredString(deliveryId, 'deliveryId', 36),
    userId: requiredId(userId, 'userId'),
    leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
    status: 'sending',
    leaseUntil: { [Op.gt]: normalizedNow }
  };
  const [updatedCount] = await EmailDelivery.update({ leaseUntil }, {
    where: identity,
    hooks: false
  });
  if (updatedCount === 1) return true;
  return Boolean(await EmailDelivery.findOne({ attributes: ['id'], where: identity }));
};

// Marks one live owned delivery sent and releases its lease.
export const completeEmailDelivery = async ({ deliveryId, userId, leaseOwner }, {
  providerMessageId = null,
  now = new Date()
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');
  const [updatedCount] = await EmailDelivery.update({
    status: 'sent',
    leaseOwner: null,
    leaseUntil: null,
    providerMessageId: providerMessageId
      ? String(providerMessageId).slice(0, 255)
      : null,
    lastError: null,
    completedAt: normalizedNow
  }, {
    where: {
      id: requiredString(deliveryId, 'deliveryId', 36),
      userId: requiredId(userId, 'userId'),
      leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
      status: 'sending',
      leaseUntil: { [Op.gt]: normalizedNow }
    },
    hooks: false
  });
  return updatedCount === 1;
};

// Requeues a transient failure or terminally fails a permanent or exhausted delivery.
export const failEmailDelivery = async ({ deliveryId, userId, leaseOwner }, {
  errorCode,
  retryable,
  now = new Date(),
  ...retryOptions
}) => {
  const normalizedNow = normalizedDate(now, 'now');
  return sequelize.transaction(async transaction => {
    const delivery = await EmailDelivery.findOne({
      where: {
        id: requiredString(deliveryId, 'deliveryId', 36),
        userId: requiredId(userId, 'userId'),
        leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
        status: 'sending',
        leaseUntil: { [Op.gt]: normalizedNow }
      },
      ...lockOptions(transaction)
    });
    if (!delivery) return { updated: false, status: 'lease_lost' };

    const shouldRetry = retryable && Number(delivery.attemptCount) < Number(delivery.maxAttempts);
    const nextRetryCount = Number(delivery.retryCount || 0) + (shouldRetry ? 1 : 0);
    const availableAt = shouldRetry
      ? new Date(normalizedNow.getTime() + emailRetryDelayMs(nextRetryCount, retryOptions))
      : null;
    const status = shouldRetry ? 'pending' : 'failed';
    const safeCode = String(errorCode || 'EMAIL_DELIVERY_FAILED')
      .replace(/[^A-Z0-9_\-]/gi, '_')
      .slice(0, 100);
    await delivery.update({
      status,
      retryCount: nextRetryCount,
      availableAt: availableAt || delivery.availableAt,
      leaseOwner: null,
      leaseUntil: null,
      completedAt: shouldRetry ? null : normalizedNow,
      lastError: `${safeCode}: ${shouldRetry ? 'temporary' : 'permanent'} email delivery failure`
    }, { transaction, hooks: false });
    return { updated: true, status, availableAt, retryCount: nextRetryCount };
  });
};
