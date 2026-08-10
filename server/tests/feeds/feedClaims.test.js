import { beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import {
  claimDueFeeds,
  claimFeedById,
  completeFeedLease
} from '../../services/feeds/feedClaims.js';

const { Category, Feed, User } = db;
const NOW = new Date('2026-08-09T12:00:00.000Z');

let user;
let category;

// Produces a collision-resistant test identity.
const uniqueName = prefix =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Creates one feed eligible at the fixed claim clock unless overridden.
const createFeed = (suffix, overrides = {}) => Feed.create({
  userId: user.id,
  categoryId: category.id,
  feedName: `Claim feed ${suffix}`,
  url: `https://example.com/${uniqueName(suffix)}.xml`,
  nextFetchAt: new Date(NOW.getTime() - 60 * 1000),
  ...overrides
});

describe('atomic due-feed claims', () => {
  beforeEach(async () => {
    const username = uniqueName('claim-user');
    user = await User.create({
      username,
      password: 'secret',
      feverCredentialHash: uniqueName('claim-hash'),
      role: 'user'
    });
    category = await Category.create({
      userId: user.id,
      name: uniqueName('claim-category'),
      categoryOrder: 0
    });
  });

  it('claims only due active feeds in deadline and stable ID order', async () => {
    const first = await createFeed('first', {
      nextFetchAt: new Date(NOW.getTime() - 2 * 60 * 1000)
    });
    const second = await createFeed('second');
    await createFeed('future', {
      nextFetchAt: new Date(NOW.getTime() + 60 * 1000)
    });
    await createFeed('disabled', { status: 'disabled' });
    await createFeed('automatic-crawling-disabled', {
      updateIntervalMinutes: 0,
      nextFetchAt: null
    });
    await createFeed('leased', {
      leaseUntil: new Date(NOW.getTime() + 60 * 1000),
      leaseOwner: 'other-worker'
    });

    const claimed = await claimDueFeeds({
      userId: user.id,
      limit: 2,
      now: NOW,
      leaseMs: 60000,
      leaseOwner: 'worker-a'
    });

    expect(claimed.map(feed => feed.id)).toEqual([first.id, second.id]);
    expect(claimed.every(feed => feed.leaseOwner === 'worker-a')).toBe(true);
  });

  it('recovers an expired lease without accepting the old owner completion', async () => {
    const feed = await createFeed('expired', {
      leaseUntil: new Date(NOW.getTime() - 1),
      leaseOwner: 'expired-worker'
    });
    const staleWorkerView = Feed.build(feed.get({ plain: true }), {
      isNewRecord: false
    });

    const [reclaimed] = await claimDueFeeds({
      userId: user.id,
      now: NOW,
      leaseMs: 60000,
      leaseOwner: 'recovery-worker'
    });

    expect(reclaimed.id).toBe(feed.id);
    expect(reclaimed.leaseOwner).toBe('recovery-worker');
    await expect(completeFeedLease(staleWorkerView, {
      lastFetchOutcome: 'timed_out'
    }, { now: NOW })).resolves.toBe(false);
    await feed.reload();
    expect(feed.leaseOwner).toBe('recovery-worker');
  });

  it('gives simultaneous workers disjoint bounded batches', async () => {
    const feeds = await Promise.all([
      createFeed('one'),
      createFeed('two'),
      createFeed('three'),
      createFeed('four')
    ]);

    const [workerA, workerB] = await Promise.all([
      claimDueFeeds({
        userId: user.id,
        limit: 3,
        now: NOW,
        leaseOwner: 'worker-a'
      }),
      claimDueFeeds({
        userId: user.id,
        limit: 3,
        now: NOW,
        leaseOwner: 'worker-b'
      })
    ]);
    const allClaimedIds = [...workerA, ...workerB].map(feed => feed.id);

    expect(new Set(allClaimedIds).size).toBe(feeds.length);
    expect(allClaimedIds).toHaveLength(feeds.length);
  });

  it('arbitrates a global scheduled worker against a user-triggered worker', async () => {
    const feed = await createFeed('trigger-overlap');

    const [scheduled, apiTriggered] = await Promise.all([
      claimDueFeeds({ limit: 1, now: NOW, leaseOwner: 'scheduled-worker' }),
      claimDueFeeds({
        userId: user.id,
        limit: 1,
        now: NOW,
        leaseOwner: 'api-worker'
      })
    ]);
    const claimed = [...scheduled, ...apiTriggered];

    expect(claimed.filter(candidate => candidate.id === feed.id)).toHaveLength(1);
  });

  it('claims an explicitly selected owned feed without requiring it to be due', async () => {
    const feed = await createFeed('manual', {
      nextFetchAt: new Date(NOW.getTime() + 60 * 60 * 1000)
    });

    const claimed = await claimFeedById({
      feedId: feed.id,
      userId: user.id,
      now: NOW,
      leaseOwner: 'manual-worker'
    });
    const duplicateClaim = await claimFeedById({
      feedId: feed.id,
      userId: user.id,
      now: NOW,
      leaseOwner: 'other-worker'
    });

    expect(claimed).toMatchObject({ id: feed.id, leaseOwner: 'manual-worker' });
    expect(duplicateClaim).toBeNull();
  });

  it('retries the complete claim after MySQL chooses it as a deadlock victim', async () => {
    const feed = await createFeed('deadlock-retry');
    const originalTransaction = db.sequelize.transaction.bind(db.sequelize);
    const deadlock = Object.assign(new Error(
      'Deadlock found when trying to get lock; try restarting transaction'
    ), {
      original: { code: 'ER_LOCK_DEADLOCK' }
    });
    const transactionSpy = vi.spyOn(db.sequelize, 'transaction')
      .mockRejectedValueOnce(deadlock)
      .mockImplementation(originalTransaction);

    try {
      const [claimed] = await claimDueFeeds({
        userId: user.id,
        limit: 1,
        now: NOW,
        leaseOwner: 'retry-worker'
      });

      expect(claimed.id).toBe(feed.id);
      expect(transactionSpy).toHaveBeenCalledTimes(2);
    } finally {
      transactionSpy.mockRestore();
    }
  });

  it('atomically commits terminal state while releasing the owned lease', async () => {
    const feed = await createFeed('complete');
    const [claimed] = await claimDueFeeds({
      userId: user.id,
      now: NOW,
      leaseOwner: 'completing-worker'
    });
    const nextFetchAt = new Date(NOW.getTime() + 60 * 60 * 1000);

    await expect(completeFeedLease(claimed, {
      lastFetchOutcome: 'transient_failure',
      consecutiveFailures: 1,
      errorCount: 1,
      errorMessage: 'Network unavailable',
      nextFetchAt
    }, { now: NOW })).resolves.toBe(true);

    await feed.reload();
    expect(feed).toMatchObject({
      leaseUntil: null,
      leaseOwner: null,
      lastFetchOutcome: 'transient_failure',
      consecutiveFailures: 1,
      errorCount: 1,
      errorMessage: 'Network unavailable',
      nextFetchAt
    });
  });

  it('does not restore a deadline when automatic crawling was disabled mid-claim', async () => {
    const feed = await createFeed('disabled-mid-claim');
    const [claimed] = await claimDueFeeds({
      userId: user.id,
      now: NOW,
      leaseOwner: 'disabling-worker'
    });
    await Feed.update({
      updateIntervalMinutes: 0,
      nextFetchAt: null
    }, {
      where: { id: feed.id }
    });

    await expect(completeFeedLease(claimed, {
      lastFetchOutcome: 'changed',
      nextFetchAt: new Date(NOW.getTime() + 60 * 60 * 1000)
    }, { now: NOW })).resolves.toBe(true);

    await feed.reload();
    expect(feed.updateIntervalMinutes).toBe(0);
    expect(feed.nextFetchAt).toBeNull();
    expect(feed.leaseOwner).toBeNull();
  });
});
