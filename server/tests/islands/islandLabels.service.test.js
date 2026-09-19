import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('evidence-grounded Island labels', () => {
  it('uses a supporting headline when taxonomy is weak and changes names without changing identity or scores', async () => {
    const user = await db.User.create({ username: `labels-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Concerts' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id,
      feedName: 'Concerts', url: `https://${user.id}.example/rss` });
    const model = 'label-test-model';
    const headline = 'Orchestra performs a benefit concert in Amsterdam';
    const values = { userId: user.id, feedId: feed.id, title: headline, status: 'read',
      articleVector: [1, 0], embedding_model: model, publishedAt: new Date(),
      favoriteInd: 1, favoritedAt: new Date() };
    await db.Article.bulkCreate([values, { ...values, title: 'Musicians return for a second benefit concert' }]);
    const held = await db.Article.create({ ...values, title: 'An independent review of the orchestra concert',
      status: 'unread', favoriteInd: 0, favoritedAt: null, articleVector: [0.8, 0.6] });
    const taxonomy = await db.IslandTaxonomy.create({ identity: `boxing-${randomUUID()}`,
      displayName: 'Boxing', categoryName: 'Sport', vector: [0.28, 0.96], embedding_model: model });
    await db.IslandTaxonomy.create({ identity: `hidden-${randomUUID()}`, displayName: 'Hidden label',
      categoryName: 'Music', vector: [1, 0], embedding_model: model, status: 'hidden' });
    const calibrate = () => runIslandCalibrationForUser(user.id, { generateLabels: false });
    await calibrate();
    const island = await db.Island.findOne({ where: { userId: user.id, archivedInd: false } });
    expect(island.label).toBe(headline);
    const score = Number((await held.reload()).interestScore);
    expect(score).toBeGreaterThan(0);
    const memory = { id: island.id, islandVector: island.islandVector,
      weight: island.weight, supportArticleIds: island.supportArticleIds };

    await taxonomy.update({ displayName: 'Orchestral concerts', vector: [0.8, 0.6] });
    await calibrate();
    expect(await island.reload()).toMatchObject({ ...memory, label: 'Orchestral concerts' });
    expect(Number((await held.reload()).interestScore)).toBe(score);

    await taxonomy.update({ displayName: 'Boxing', vector: [0.28, 0.96] });
    await calibrate();
    expect(await island.reload()).toMatchObject({ ...memory, label: headline });
    expect(Number((await held.reload()).interestScore)).toBe(score);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });
});
