import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';

const { sequelize, User, Category, Feed } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('Feed model', () => {
  let user;
  let category;

  beforeAll(async () => {
    // Ensure DB connection is alive
    await sequelize.authenticate();

    // ---- Create user ----
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    const username = uniqueName('feedtestuser');

    user = await User.create({
      username,
      password,
      feverCredentialHash: `${username}-${hash}`,
      role: 'user'
    });

    // ---- Create category (required by Feed) ----
    category = await Category.create({
      userId: user.id,
      name: 'Test Category',
      categoryOrder: 0
    });
  });

  it('creates a feed with defaults', async () => {
    const feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Test Feed',
      url: 'https://example.com/rss.xml'
    });

    // ---- Identity ----
    expect(feed.id).toBeDefined();
    expect(feed.userId).toBe(user.id);
    expect(feed.categoryId).toBe(category.id);

    // ---- Fields ----
    expect(feed.feedName).toBe('Test Feed');
    expect(feed.url).toBe('https://example.com/rss.xml');

    // ---- Defaults ----
    expect(feed.status).toBe('active');
    expect(feed.feedTrust).toBe(0.75);
    expect(feed.feedDuplicationRate).toBe(0);
    expect(feed.errorCount).toBe(0);
    expect(feed.errorMessage).toBeNull();
    expect(feed.errorSince).toBeNull();
    expect(feed.itemFilter).toBeNull();
    expect(feed.lastFetched).toBeNull();
    expect(feed.etag).toBeNull();
    expect(feed.lastModified).toBeNull();
    expect(feed.contentHash).toBeNull();
    expect(feed.cacheFreshUntil).toBeNull();
    expect(feed.lastAttemptAt).toBeNull();
    expect(feed.lastSuccessAt).toBeNull();
    expect(feed.lastChangedAt).toBeNull();
    expect(feed.lastPublishedAt).toBeNull();
    expect(feed.observedEntryIntervalMs).toBeNull();
    expect(feed.consecutiveFailures).toBe(0);
    expect(feed.nextFetchAt).toBeInstanceOf(Date);
    expect(feed.leaseUntil).toBeNull();
    expect(feed.leaseOwner).toBeNull();
    expect(feed.lastFetchOutcome).toBeNull();
    expect(feed.publisherSelfUrl).toBeNull();
    expect(feed.publisherSelfStatus).toBeNull();
    expect(feed.publisherSelfCheckedAt).toBeNull();
    expect(feed.publisherSelfDiagnostic).toBeNull();
  });

  it('clears automatic scheduling when the interval is zero', async () => {
    const feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Disabled automatic feed',
      url: `https://example.com/${uniqueName('disabled-feed')}.xml`,
      updateIntervalMinutes: 0,
      nextFetchAt: new Date('2026-08-09T12:00:00.000Z')
    });

    expect(feed.updateIntervalMinutes).toBe(0);
    expect(feed.nextFetchAt).toBeNull();
  });

  it('accepts generous validator and hash lengths', async () => {
    const feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Long Fetch Metadata Feed',
      url: 'https://example.com/long-fetch-metadata.xml',
      etag: `"${'e'.repeat(1500)}"`,
      lastModified: 'm'.repeat(900),
      contentHash: 'h'.repeat(128),
      lastFetchOutcome: 'security_rejected'
    });

    expect(feed.etag).toHaveLength(1502);
    expect(feed.lastModified).toHaveLength(900);
    expect(feed.contentHash).toHaveLength(128);
    expect(feed.lastFetchOutcome).toBe('security_rejected');
  });

  it('rejects unsupported outcomes and oversized validators', async () => {
    const feed = Feed.build({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Invalid Fetch Metadata Feed',
      url: 'https://example.com/invalid-fetch-metadata.xml',
      etag: 'e'.repeat(2049),
      lastFetchOutcome: 'client_specific_exception'
    });

    await expect(feed.validate()).rejects.toMatchObject({
      name: 'SequelizeValidationError'
    });
  });

  it('accepts bounded publisher self diagnostics and rejects unknown states', async () => {
    const valid = Feed.build({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Publisher Self State Feed',
      url: 'https://example.com/publisher-self.xml',
      publisherSelfUrl: `https://example.com/${'s'.repeat(3000)}`,
      publisherSelfStatus: 'validated',
      publisherSelfDiagnostic: 'd'.repeat(4000)
    });
    await expect(valid.validate()).resolves.toBeDefined();

    valid.publisherSelfStatus = 'trusted_without_validation';
    await expect(valid.validate()).rejects.toMatchObject({
      name: 'SequelizeValidationError'
    });
  });
});
