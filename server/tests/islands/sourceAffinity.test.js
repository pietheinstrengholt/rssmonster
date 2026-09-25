import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { refreshSourceAffinityForUser } from '../../services/islands/sourceAffinity.js';

async function createFeeds() {
  const user = await db.User.create({ username: `source-affinity-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Affinity' });
  const feed = async name => db.Feed.create({ userId: user.id, categoryId: category.id,
    feedName: name, url: `https://${randomUUID()}.example/rss` });
  return { user, feed };
}

describe('feed source affinity', () => {
  it('uses eligible recent articles, positive Island confidence and owned feeds only', async () => {
    const { user, feed: createFeed } = await createFeeds();
    const matching = await createFeed('matching');
    const unmatched = await createFeed('unmatched');
    const empty = await createFeed('empty');
    const foreign = await createFeeds();
    const other = await foreign.feed('other');
    await db.Island.create({ userId: user.id, label: 'Technology', weight: 0.8,
      islandVector: [1, 0], embedding_model: 'test-model', lastBehaviorAt: new Date() });
    await db.Island.create({ userId: user.id, label: 'Negative', weight: -1,
      islandVector: [0, 1], embedding_model: 'test-model', lastBehaviorAt: new Date() });
    const article = (feed, vector, extra = {}) => db.Article.create({ userId: user.id, feedId: feed.id,
      title: 'Recent feed article', articleVector: vector, embedding_model: 'test-model', publishedAt: new Date(), ...extra });
    await article(matching, [1, 0]);
    await article(matching, [1, 0], { status: 'read' });
    await article(matching, [0, 1]);
    await article(matching, [1, 0], { filteredInd: true });
    await article(unmatched, [0, 1]);

    await refreshSourceAffinityForUser(user.id);
    await Promise.all([matching.reload(), unmatched.reload(), empty.reload(), other.reload()]);
    const expected = (2 / 3) * 0.1 * (1 - Math.exp(-2 / 10));
    expect(matching.sourceAffinity).toBeCloseTo(expected, 6);
    expect(unmatched.sourceAffinity).toBeNull();
    expect(empty.sourceAffinity).toBeNull();
    expect(other.sourceAffinity).toBeNull();
  });
});
