import { beforeEach, describe, expect, it } from 'vitest';

import db from '../../models/index.js';
import { updateFeedSubscription } from '../../services/feeds/feedManagement.js';
import {
  HOUR_MS,
  deterministicJitterMs
} from '../../services/feeds/feedScheduling.js';

const { Category, Feed, User } = db;
const NOW = new Date('2026-08-09T12:00:00.000Z');
const clock = () => NOW;

let category;
let feed;
let user;

// Produces a collision-resistant database identity for each integration case.
const uniqueName = prefix =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Changes only the scheduling control through the production subscription service.
const changeInterval = updateIntervalMinutes => updateFeedSubscription({
  userId: user.id,
  feedId: feed.id,
  updates: { updateIntervalMinutes },
  clock
});

// Matches the database's whole-second DATE precision for durable deadlines.
const persistedTimestamp = value => Math.floor(value / 1000) * 1000;

describe('feed interval setting transitions', () => {
  beforeEach(async () => {
    user = await User.create({
      username: uniqueName('interval-user'),
      password: 'secret',
      feverCredentialHash: uniqueName('interval-hash'),
      role: 'user'
    });
    category = await Category.create({
      userId: user.id,
      name: uniqueName('interval-category'),
      categoryOrder: 0
    });
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Interval feed',
      url: `https://example.com/${uniqueName('interval-feed')}.xml`,
      updateIntervalMinutes: null,
      nextFetchAt: new Date(NOW.getTime() + HOUR_MS),
      lastFetchOutcome: 'changed',
      lastPublishedAt: new Date(NOW.getTime() - 24 * HOUR_MS),
      observedEntryIntervalMs: 30 * 60 * 1000
    });
  });

  it('disables automatic crawling by clearing the due deadline', async () => {
    await changeInterval(0);
    await feed.reload();

    expect(feed.updateIntervalMinutes).toBe(0);
    expect(feed.nextFetchAt).toBeNull();
  });

  it.each([null, 60])(
    're-enables a disabled feed with %s and makes one immediate jittered fetch due',
    async updateIntervalMinutes => {
      await changeInterval(0);
      await changeInterval(updateIntervalMinutes);
      await feed.reload();

      expect(feed.updateIntervalMinutes).toBe(updateIntervalMinutes);
      expect(feed.nextFetchAt.getTime()).toBe(persistedTimestamp(
        NOW.getTime() + deterministicJitterMs(feed.id)
      ));
    }
  );

  it('switches from a positive override back to adaptive activity cadence', async () => {
    feed.updateIntervalMinutes = 60;
    await feed.save();

    await changeInterval(null);
    await feed.reload();

    expect(feed.nextFetchAt.getTime()).toBe(persistedTimestamp(
      NOW.getTime() + 15 * 60 * 1000 + deterministicJitterMs(feed.id)
    ));
  });

  it('uses a positive override while retaining a later cache freshness deadline', async () => {
    feed.cacheFreshUntil = new Date(NOW.getTime() + 3 * HOUR_MS);
    await feed.save();

    await changeInterval(5);
    await feed.reload();

    expect(feed.nextFetchAt.getTime()).toBe(persistedTimestamp(
      feed.cacheFreshUntil.getTime() + deterministicJitterMs(feed.id)
    ));
  });

  it('retains the aggregate deadline from a rate-limited terminal outcome', async () => {
    const rateLimitDeadline = new Date(NOW.getTime() + 6 * HOUR_MS);
    feed.updateIntervalMinutes = 60;
    feed.nextFetchAt = rateLimitDeadline;
    feed.lastFetchOutcome = 'rate_limited';
    await feed.save();

    await changeInterval(5);
    await feed.reload();

    expect(feed.nextFetchAt).toEqual(rateLimitDeadline);
  });
});
