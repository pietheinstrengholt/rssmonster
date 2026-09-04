import { Op } from 'sequelize';
import db from '../../models/index.js';
import { enqueueDailyBriefingEmail } from './dailyBriefingEmail.service.js';

const { BriefingPreference, EmailDelivery, User } = db;
export const DAILY_BRIEFING_SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;
export const DAILY_BRIEFING_SCHEDULER_BATCH_SIZE = 500;

const positiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const valueOf = (row, field) => row?.get ? row.get(field) : row?.[field];

const safeErrorCode = error => String(
  error?.original?.code || error?.parent?.code || error?.code || error?.name || 'UNKNOWN_ERROR'
).replace(/[^A-Z0-9_\-]/gi, '_').slice(0, 100);

const parseDigestTime = value => {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? (hour * 60) + minute : null;
};

// Resolves one instant into the user's calendar date and minute of day.
export const digestLocalSchedule = (date, timezone) => {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value]));
    return {
      localDate: `${parts.year}-${parts.month}-${parts.day}`,
      minuteOfDay: (Number(parts.hour) * 60) + Number(parts.minute)
    };
  } catch {
    return null;
  }
};

// Loads one bounded page of enabled recipients, rotating by user id between scheduler ticks.
export const findDailyBriefingCandidates = async ({
  afterUserId = 0,
  limit = DAILY_BRIEFING_SCHEDULER_BATCH_SIZE
} = {}) => {
  const boundedLimit = positiveInteger(
    limit,
    DAILY_BRIEFING_SCHEDULER_BATCH_SIZE,
    DAILY_BRIEFING_SCHEDULER_BATCH_SIZE
  );
  const preferences = await BriefingPreference.findAll({
    where: {
      emailDigestEnabled: true,
      userId: { [Op.gt]: Math.max(0, Number(afterUserId) || 0) }
    },
    attributes: ['userId', 'emailDigestTime', 'emailDigestTimezone'],
    include: [{
      model: User,
      as: 'user',
      required: true,
      attributes: ['id', 'email', 'emailVerifiedAt'],
      where: {
        email: { [Op.ne]: null },
        emailVerifiedAt: { [Op.ne]: null }
      }
    }],
    order: [['userId', 'ASC']],
    limit: boundedLimit
  });

  return preferences.map(preference => ({
    userId: Number(valueOf(preference, 'userId')),
    emailDigestTime: valueOf(preference, 'emailDigestTime'),
    emailDigestTimezone: valueOf(preference, 'emailDigestTimezone'),
    user: valueOf(preference, 'user')
  }));
};

const findExistingDigestKeys = async dueCandidates => {
  if (!dueCandidates.length) return new Set();
  const deliveries = await EmailDelivery.findAll({
    where: {
      messageType: 'daily_digest',
      [Op.or]: dueCandidates.map(candidate => ({
        userId: candidate.userId,
        dedupeKey: candidate.dedupeKey
      }))
    },
    attributes: ['userId', 'dedupeKey'],
    raw: true
  });
  return new Set(deliveries.map(delivery => `${delivery.userId}:${delivery.dedupeKey}`));
};

// Evaluates and enqueues one bounded page without allowing one user failure to stop the batch.
export const produceDueDailyBriefings = async ({
  afterUserId = 0,
  batchSize = DAILY_BRIEFING_SCHEDULER_BATCH_SIZE,
  now = new Date(),
  listCandidates = findDailyBriefingCandidates,
  findExisting = findExistingDigestKeys,
  enqueueDigest = enqueueDailyBriefingEmail,
  logger = console
} = {}) => {
  const boundedBatchSize = positiveInteger(
    batchSize,
    DAILY_BRIEFING_SCHEDULER_BATCH_SIZE,
    DAILY_BRIEFING_SCHEDULER_BATCH_SIZE
  );
  const candidates = (await listCandidates({
    afterUserId,
    limit: boundedBatchSize
  })).slice(0, boundedBatchSize);
  const nextCursor = candidates.length === boundedBatchSize
    ? candidates.at(-1).userId
    : 0;
  const dueCandidates = [];

  for (const candidate of candidates) {
    const schedule = digestLocalSchedule(now, candidate.emailDigestTimezone);
    const digestMinute = parseDigestTime(candidate.emailDigestTime);
    if (!schedule || digestMinute === null) {
      logger.error(
        `[DailyBriefingScheduler] candidate.invalid userId=${Number(candidate.userId)}`
      );
      continue;
    }
    if (schedule.minuteOfDay < digestMinute) continue;
    dueCandidates.push({
      ...candidate,
      localDate: schedule.localDate,
      dedupeKey: `daily-digest:${candidate.userId}:${schedule.localDate}`
    });
  }

  const existingKeys = await findExisting(dueCandidates);
  let queued = 0;
  let skipped = 0;
  let failed = 0;
  for (const candidate of dueCandidates) {
    const key = `${candidate.userId}:${candidate.dedupeKey}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      const result = await enqueueDigest(candidate.user, { now });
      if (result.queued) queued += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        '[DailyBriefingScheduler] enqueue.failed ' +
        `userId=${Number(candidate.userId)} errorCode=${JSON.stringify(safeErrorCode(error))}`
      );
    }
  }

  return {
    examined: candidates.length,
    due: dueCandidates.length,
    queued,
    skipped,
    failed,
    nextCursor
  };
};

// Runs the producer immediately and every five minutes without overlapping iterations.
export const createDailyBriefingScheduler = ({
  batchSize = DAILY_BRIEFING_SCHEDULER_BATCH_SIZE,
  intervalMs = DAILY_BRIEFING_SCHEDULER_INTERVAL_MS,
  logger = console,
  producer = produceDueDailyBriefings
} = {}) => {
  let afterUserId = 0;
  let intervalId = null;
  let runPromise = null;

  const runOnce = () => {
    if (runPromise) return runPromise;
    runPromise = producer({ afterUserId, batchSize, logger }).then(result => {
      afterUserId = result.nextCursor;
      if (result.queued || result.failed) {
        logger.log(
          '[DailyBriefingScheduler] iteration.complete ' +
          `examined=${result.examined} due=${result.due} queued=${result.queued} ` +
          `skipped=${result.skipped} failed=${result.failed}`
        );
      }
      return result;
    }).catch(error => {
      logger.error(
        `[DailyBriefingScheduler] iteration.failed errorCode=${JSON.stringify(safeErrorCode(error))}`
      );
      return null;
    }).finally(() => {
      runPromise = null;
    });
    return runPromise;
  };

  const start = async () => {
    if (intervalId) return;
    logger.log(
      `[DailyBriefingScheduler] starting intervalMs=${intervalMs} batchSize=${batchSize}`
    );
    await runOnce();
    intervalId = setInterval(() => void runOnce(), intervalMs);
    intervalId.unref?.();
  };

  const stop = async () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    await runPromise;
    logger.log('[DailyBriefingScheduler] stopped');
  };

  return { runOnce, start, stop };
};

export default { createDailyBriefingScheduler, produceDueDailyBriefings };
