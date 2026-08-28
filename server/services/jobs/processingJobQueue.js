import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';

const { Article, ProcessingJob, Sequelize, sequelize } = db;
const { Op } = Sequelize;

export const DEFAULT_PROCESSING_JOB_LEASE_MS = 2 * 60 * 1000;
export const DEFAULT_PROCESSING_JOB_MAX_ATTEMPTS = 5;
export const DEFAULT_RETRY_BASE_DELAY_MS = 5 * 1000;
export const DEFAULT_RETRY_MAX_DELAY_MS = 15 * 60 * 1000;
const CLAIM_DEADLOCK_ATTEMPTS = 3;
const MAX_CLAIM_LIMIT = 100;
const MAX_ERROR_CODE_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 2000;

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

const optionalId = (value, field) => value === null || value === undefined
  ? null
  : requiredId(value, field);

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

const leaseEligibility = now => ({
  [Op.or]: [
    { leaseUntil: { [Op.is]: null } },
    { leaseUntil: { [Op.lte]: now } }
  ]
});

// Builds the indexed predicate for new or abandoned processing work.
export const buildClaimableProcessingJobWhere = ({ userId = null, now }) => ({
  ...(userId ? { userId: requiredId(userId, 'userId') } : {}),
  [Op.or]: [
    {
      status: 'pending',
      availableAt: { [Op.lte]: now },
      ...leaseEligibility(now)
    },
    {
      status: 'running',
      leaseUntil: { [Op.lte]: now }
    }
  ]
});

// Inserts one durable job, returning the existing owned job for a duplicate key.
export const enqueueProcessingJob = async ({
  type,
  userId,
  articleId = null,
  dedupeKey,
  payload = {},
  priority = 0,
  maxAttempts = DEFAULT_PROCESSING_JOB_MAX_ATTEMPTS,
  availableAt = new Date()
}, { transaction = null } = {}) => {
  const normalizedUserId = requiredId(userId, 'userId');
  const normalizedType = requiredString(type, 'type', 64);
  const normalizedDedupeKey = requiredString(dedupeKey, 'dedupeKey', 255);
  const normalizedArticleId = optionalId(articleId, 'articleId');
  const normalizedPriority = Number.parseInt(priority, 10);
  if (!Number.isInteger(normalizedPriority)) {
    throw new TypeError('priority must be an integer');
  }
  if (normalizedArticleId) {
    const ownedArticle = await Article.findOne({
      attributes: ['id'],
      where: {
        id: normalizedArticleId,
        userId: normalizedUserId
      },
      transaction
    });
    if (!ownedArticle) {
      const error = new Error('Processing job article is not owned by the supplied user');
      error.code = 'PROCESSING_JOB_ARTICLE_OWNERSHIP';
      throw error;
    }
  }

  const [job, created] = await ProcessingJob.findOrCreate({
    where: {
      userId: normalizedUserId,
      type: normalizedType,
      dedupeKey: normalizedDedupeKey
    },
    defaults: {
      articleId: normalizedArticleId,
      payload: payload ?? {},
      priority: normalizedPriority,
      maxAttempts: positiveInteger(maxAttempts, DEFAULT_PROCESSING_JOB_MAX_ATTEMPTS),
      availableAt: normalizedDate(availableAt, 'availableAt')
    },
    transaction
  });

  return { job, created };
};

// Atomically locks and leases one stable, bounded batch of available jobs.
export const claimProcessingJobs = async ({
  userId = null,
  limit = 10,
  now = new Date(),
  leaseMs = DEFAULT_PROCESSING_JOB_LEASE_MS,
  leaseOwner = randomUUID()
} = {}) => {
  const boundedLimit = claimLimit(limit);
  const normalizedNow = normalizedDate(now, 'now');
  const normalizedLeaseOwner = requiredString(leaseOwner, 'leaseOwner', 64);
  const boundedLeaseMs = positiveInteger(leaseMs, DEFAULT_PROCESSING_JOB_LEASE_MS);
  const leaseUntil = new Date(normalizedNow.getTime() + boundedLeaseMs);

  for (let attempt = 1; attempt <= CLAIM_DEADLOCK_ATTEMPTS; attempt++) {
    try {
      return await sequelize.transaction({
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
      }, async transaction => {
        const jobs = await ProcessingJob.findAll({
          where: buildClaimableProcessingJobWhere({ userId, now: normalizedNow }),
          // Newer work wins within a priority band so freshly ingested articles are
          // enriched before an older backlog. availableAt remains an eligibility gate.
          order: [['priority', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
          limit: boundedLimit,
          ...lockOptions(transaction)
        });

        for (const job of jobs) {
          await job.update({
            status: 'running',
            attempts: Number(job.attempts || 0) + 1,
            leaseOwner: normalizedLeaseOwner,
            leaseUntil,
            startedAt: job.startedAt || normalizedNow,
            completedAt: null
          }, { transaction, hooks: false });
        }

        return jobs;
      });
    } catch (error) {
      if (attempt === CLAIM_DEADLOCK_ATTEMPTS || !isClaimDeadlock(error)) throw error;
    }
  }

  return [];
};

// Extends only a live lease still owned by the same user and worker.
export const renewProcessingJobLease = async ({ jobId, userId, leaseOwner }, {
  now = new Date(),
  leaseMs = DEFAULT_PROCESSING_JOB_LEASE_MS
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');
  const leaseUntil = new Date(
    normalizedNow.getTime() + positiveInteger(leaseMs, DEFAULT_PROCESSING_JOB_LEASE_MS)
  );
  const [updatedCount] = await ProcessingJob.update({ leaseUntil }, {
    where: {
      id: requiredString(jobId, 'jobId', 36),
      userId: requiredId(userId, 'userId'),
      leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
      status: 'running',
      leaseUntil: { [Op.gt]: normalizedNow }
    }
  });
  if (updatedCount === 1) return true;

  // MySQL may report zero changed rows when two renewals land in the same DATETIME tick.
  const stillOwned = await ProcessingJob.findOne({
    attributes: ['id'],
    where: {
      id: requiredString(jobId, 'jobId', 36),
      userId: requiredId(userId, 'userId'),
      leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
      status: 'running',
      leaseUntil: { [Op.gt]: normalizedNow }
    }
  });
  return Boolean(stillOwned);
};

// Marks one live, owned job successful and releases its lease.
export const completeProcessingJob = async ({ jobId, userId, leaseOwner }, {
  now = new Date()
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');
  const [updatedCount] = await ProcessingJob.update({
    status: 'succeeded',
    leaseOwner: null,
    leaseUntil: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    completedAt: normalizedNow
  }, {
    where: {
      id: requiredString(jobId, 'jobId', 36),
      userId: requiredId(userId, 'userId'),
      leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
      status: 'running',
      leaseUntil: { [Op.gt]: normalizedNow }
    }
  });
  return updatedCount === 1;
};

// Calculates bounded exponential retry delay with positive jitter.
export const processingJobRetryDelayMs = (attempts, {
  baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
  jitterRatio = 0.25,
  random = Math.random
} = {}) => {
  const boundedBase = positiveInteger(baseDelayMs, DEFAULT_RETRY_BASE_DELAY_MS);
  const boundedMaximum = positiveInteger(maxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS);
  const exponent = Math.max(0, positiveInteger(attempts, 1) - 1);
  const exponential = Math.min(boundedMaximum, boundedBase * (2 ** exponent));
  const normalizedJitterRatio = Number.isFinite(jitterRatio)
    ? Math.max(0, jitterRatio)
    : 0.25;
  const jitter = Math.floor(exponential * normalizedJitterRatio * random());
  return Math.min(boundedMaximum, exponential + jitter);
};

const errorDetails = error => ({
  lastErrorCode: String(error?.code || error?.name || 'PROCESSING_JOB_FAILED')
    .slice(0, MAX_ERROR_CODE_LENGTH),
  lastErrorMessage: String(error?.message || error || 'Processing job failed')
    .slice(0, MAX_ERROR_MESSAGE_LENGTH)
});

// Requeues one live owned job, or dead-letters it after its final claimed attempt.
export const retryProcessingJob = async ({ jobId, userId, leaseOwner }, error, options = {}) => {
  const normalizedNow = normalizedDate(options.now || new Date(), 'now');

  return sequelize.transaction(async transaction => {
    const job = await ProcessingJob.findOne({
      where: {
        id: requiredString(jobId, 'jobId', 36),
        userId: requiredId(userId, 'userId'),
        leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
        status: 'running',
        leaseUntil: { [Op.gt]: normalizedNow }
      },
      ...lockOptions(transaction)
    });
    if (!job) return { updated: false };

    const terminal = Number(job.attempts) >= Number(job.maxAttempts);
    const availableAt = terminal
      ? null
      : new Date(normalizedNow.getTime() + processingJobRetryDelayMs(job.attempts, options));
    const updates = {
      status: terminal ? 'dead' : 'pending',
      leaseOwner: null,
      leaseUntil: null,
      ...errorDetails(error),
      availableAt: availableAt || job.availableAt,
      completedAt: terminal ? normalizedNow : null
    };
    await job.update(updates, { transaction, hooks: false });

    return {
      updated: true,
      status: updates.status,
      availableAt,
      attempts: Number(job.attempts)
    };
  });
};

// Immediately dead-letters one live owned job for a non-retryable failure.
export const deadLetterProcessingJob = async ({ jobId, userId, leaseOwner }, error, {
  now = new Date()
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');
  const [updatedCount] = await ProcessingJob.update({
    status: 'dead',
    leaseOwner: null,
    leaseUntil: null,
    ...errorDetails(error),
    completedAt: normalizedNow
  }, {
    where: {
      id: requiredString(jobId, 'jobId', 36),
      userId: requiredId(userId, 'userId'),
      leaseOwner: requiredString(leaseOwner, 'leaseOwner', 64),
      status: 'running',
      leaseUntil: { [Op.gt]: normalizedNow }
    }
  });
  return updatedCount === 1;
};

// Releases a bounded batch of expired running jobs for explicit recovery passes.
export const recoverExpiredProcessingJobs = async ({
  limit = 100,
  now = new Date()
} = {}) => {
  const normalizedNow = normalizedDate(now, 'now');

  return sequelize.transaction({
    isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
  }, async transaction => {
    const jobs = await ProcessingJob.findAll({
      where: {
        status: 'running',
        leaseUntil: { [Op.lte]: normalizedNow }
      },
      order: [['leaseUntil', 'ASC'], ['id', 'ASC']],
      limit: claimLimit(limit),
      ...lockOptions(transaction)
    });

    for (const job of jobs) {
      await job.update({
        status: 'pending',
        leaseOwner: null,
        leaseUntil: null,
        availableAt: normalizedNow,
        completedAt: null
      }, { transaction, hooks: false });
    }

    return jobs;
  });
};

export default {
  claimProcessingJobs,
  completeProcessingJob,
  deadLetterProcessingJob,
  enqueueProcessingJob,
  recoverExpiredProcessingJobs,
  renewProcessingJobLease,
  retryProcessingJob
};
