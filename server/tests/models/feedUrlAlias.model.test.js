import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { FEED_URL_ALIAS_TYPES } from '../../models/feedUrlAlias.js';

const { FeedUrlAlias } = db;

describe('FeedUrlAlias model', () => {
  it('declares user-scoped normalized identity and lookup indexes', () => {
    expect(FeedUrlAlias.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'feed_url_aliases_user_hash_unique',
        unique: true,
        fields: ['userId', 'normalizedUrlHash']
      }),
      expect.objectContaining({
        name: 'feed_url_aliases_user_feed_idx',
        fields: ['userId', 'feedId']
      })
    ]));
  });

  it('requires ownership, provenance, observation times, and generous URLs', async () => {
    expect(FeedUrlAlias.rawAttributes.userId.allowNull).toBe(false);
    expect(FeedUrlAlias.rawAttributes.feedId.allowNull).toBe(false);
    expect(FeedUrlAlias.rawAttributes.originalUrl.validate.len).toEqual([1, 8192]);
    expect(FeedUrlAlias.rawAttributes.normalizedUrl.validate.len).toEqual([1, 8192]);
    expect(FeedUrlAlias.rawAttributes.firstSeenAt).toMatchObject({
      allowNull: false
    });
    expect(FeedUrlAlias.rawAttributes.lastSeenAt).toMatchObject({
      allowNull: false
    });

    const alias = FeedUrlAlias.build({
      userId: 1,
      feedId: 1,
      originalUrl: `https://example.com/${'a'.repeat(3000)}`,
      normalizedUrl: `https://example.com/${'a'.repeat(3000)}`,
      normalizedUrlHash: 'a'.repeat(64),
      aliasType: 'publisher_self'
    });
    await expect(alias.validate()).resolves.toBeDefined();
    expect(FEED_URL_ALIAS_TYPES).toEqual(expect.arrayContaining([
      'input',
      'discovered_alternate',
      'redirect',
      'final',
      'publisher_self',
      'manual',
      'historical'
    ]));
  });
});
