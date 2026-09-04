import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import {
  createDailyBriefingScheduler,
  DAILY_BRIEFING_SCHEDULER_BATCH_SIZE,
  DAILY_BRIEFING_SCHEDULER_INTERVAL_MS,
  digestLocalSchedule,
  findDailyBriefingCandidates,
  produceDueDailyBriefings
} from '../../services/dailyBriefing/dailyBriefingScheduler.js';

const candidate = ({
  userId,
  time = '08:00',
  timezone = 'Europe/Amsterdam'
}) => ({
  userId,
  emailDigestTime: time,
  emailDigestTimezone: timezone,
  user: {
    id: userId,
    email: `reader-${userId}@example.com`,
    emailVerifiedAt: new Date('2026-09-04T06:00:00.000Z')
  }
});

const logger = () => ({ error: vi.fn(), log: vi.fn() });

describe('daily briefing scheduler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves local dates and times across configured IANA timezones', () => {
    const now = new Date('2026-09-04T06:05:00.000Z');

    expect(digestLocalSchedule(now, 'Europe/Amsterdam')).toEqual({
      localDate: '2026-09-04',
      minuteOfDay: 485
    });
    expect(digestLocalSchedule(now, 'America/New_York')).toEqual({
      localDate: '2026-09-04',
      minuteOfDay: 125
    });
    expect(digestLocalSchedule(now, 'Not/A-Timezone')).toBeNull();
  });

  it('queues only due users without an existing local-date digest', async () => {
    const enqueueDigest = vi.fn().mockResolvedValue({ queued: true, articleCount: 2 });
    const findExisting = vi.fn().mockResolvedValue(new Set([
      '2:daily-digest:2:2026-09-04'
    ]));
    const result = await produceDueDailyBriefings({
      now: new Date('2026-09-04T06:05:00.000Z'),
      listCandidates: vi.fn().mockResolvedValue([
        candidate({ userId: 1, time: '08:00' }),
        candidate({ userId: 2, time: '07:00' }),
        candidate({ userId: 3, time: '08:10' })
      ]),
      findExisting,
      enqueueDigest,
      logger: logger()
    });

    expect(findExisting).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 1,
        localDate: '2026-09-04',
        dedupeKey: 'daily-digest:1:2026-09-04'
      }),
      expect.objectContaining({
        userId: 2,
        dedupeKey: 'daily-digest:2:2026-09-04'
      })
    ]);
    expect(enqueueDigest).toHaveBeenCalledOnce();
    expect(enqueueDigest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      { now: new Date('2026-09-04T06:05:00.000Z') }
    );
    expect(result).toEqual({
      examined: 3,
      due: 2,
      queued: 1,
      skipped: 1,
      failed: 0,
      nextCursor: 0
    });
  });

  it('loads only enabled preferences with verified email owners in a bounded page', async () => {
    const user = candidate({ userId: 6 }).user;
    const findAll = vi.spyOn(db.BriefingPreference, 'findAll').mockResolvedValue([{
      userId: 6,
      emailDigestTime: '08:00',
      emailDigestTimezone: 'Europe/Amsterdam',
      user
    }]);

    await expect(findDailyBriefingCandidates({ afterUserId: 5, limit: 25 }))
      .resolves.toEqual([expect.objectContaining({ userId: 6, user })]);
    const query = findAll.mock.calls[0][0];
    expect(query.where.emailDigestEnabled).toBe(true);
    expect(query.include[0]).toMatchObject({
      model: db.User,
      as: 'user',
      required: true,
      attributes: ['id', 'email', 'emailVerifiedAt']
    });
    expect(query.limit).toBe(25);
    expect(query.order).toEqual([['userId', 'ASC']]);
  });

  it('bounds a producer page and advances its rotating cursor', async () => {
    const listCandidates = vi.fn().mockResolvedValue([
      candidate({ userId: 10 }),
      candidate({ userId: 11 }),
      candidate({ userId: 12 })
    ]);
    const result = await produceDueDailyBriefings({
      afterUserId: 9,
      batchSize: 2,
      now: new Date('2026-09-04T06:05:00.000Z'),
      listCandidates,
      findExisting: vi.fn().mockResolvedValue(new Set()),
      enqueueDigest: vi.fn().mockResolvedValue({ queued: true }),
      logger: logger()
    });

    expect(listCandidates).toHaveBeenCalledWith({ afterUserId: 9, limit: 2 });
    expect(result.examined).toBe(2);
    expect(result.nextCursor).toBe(11);
  });

  it('runs immediately, every five minutes, and prevents overlapping iterations', async () => {
    let resolveProducer;
    const producerResult = new Promise(resolve => {
      resolveProducer = resolve;
    });
    const producer = vi.fn().mockReturnValue(producerResult);
    const scheduler = createDailyBriefingScheduler({ producer, logger: logger() });

    const first = scheduler.runOnce();
    expect(scheduler.runOnce()).toBe(first);
    resolveProducer({
      examined: 0,
      due: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
      nextCursor: 0
    });
    await first;
    await scheduler.stop();

    expect(producer).toHaveBeenCalledOnce();
    expect(DAILY_BRIEFING_SCHEDULER_INTERVAL_MS).toBe(300_000);
    expect(DAILY_BRIEFING_SCHEDULER_BATCH_SIZE).toBe(500);
  });
});
