import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { persistIslandProfilesForUser, runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';

const now = new Date('2026-09-14T12:00:00Z');
const vector = index => Array.from({ length: 30 }, (_, i) => Number(i === index));
const calibrate = userId => runIslandCalibrationForUser(userId, { generateLabels: false });
const activeIds = async userId => (await db.Island.findAll({ where: { userId, archivedInd: false }, order: [['id', 'ASC']] })).map(row => row.id);
async function fixture(count) {
  const user = await db.User.create({ username: `capacity-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Capacity' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Capacity', url: `https://${user.id}.example/rss` });
  const sources = []; const islands = [];
  const add = async (index, behavior = { clickedAmount: 1, lastClickedAt: now }) => db.Article.create({
    userId: user.id, feedId: feed.id, title: `Distinct technical interest ${index}`, status: 'read', publishedAt: new Date('2022-01-01'), articleVector: vector(index), ...behavior
  });
  for (let i = 0; i < count; i++) {
    sources.push(await add(i));
    islands.push(await db.Island.create({ userId: user.id, label: `Interest ${i}`, weight: 0.3, islandVector: vector(i) }));
  }
  return { user, sources, islands, add };
}

describe('persisted active Island capacity', () => {
  beforeAll(async () => { if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync(); });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('reduces 25 qualifying existing Islands to 20 using current support, including strong negative evidence, without touching another user', async () => {
    const data = await fixture(25); const other = await fixture(2);
    await data.sources[24].update({ clickedAmount: 0, negativeInd: 1, negativeFeedbackAt: now });
    // Stored positive weight must not hide the stronger current negative evidence.
    const result = await persistIslandProfilesForUser(data.user.id, []);
    expect(result.persistenceSummary.activeIslandCount).toBe(20);
    const active = await activeIds(data.user.id);
    expect(active).toEqual([...data.islands.slice(0, 19), data.islands[24]].map(row => row.id));
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(25);
    expect(await activeIds(other.user.id)).toEqual(other.islands.map(row => row.id));
    const archived = await db.Island.findAll({ where: { userId: data.user.id, archivedInd: true } });
    expect(archived).toHaveLength(5);
    const dates = archived.map(row => row.archivedAt);
    vi.setSystemTime(new Date(now.getTime() + 1000));
    await persistIslandProfilesForUser(data.user.id, []);
    expect(await activeIds(data.user.id)).toEqual(active);
    for (const [index, row] of archived.entries()) { await row.reload(); expect(row.archivedAt).toEqual(dates[index]); }
  });

  it('creates a strong distinct profile at capacity and archives weaker support without exceeding 20', async () => {
    const data = await fixture(20);
    const source = await data.add(20, { positiveInd: 1, positiveFeedbackAt: now });
    await calibrate(data.user.id);
    const created = await db.Island.findOne({ where: { userId: data.user.id, label: source.title } });
    expect(created).not.toBeNull();
    expect(created.archivedInd).toBe(false);
    expect(await activeIds(data.user.id)).toHaveLength(20);
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(21);
    const first = await activeIds(data.user.id);
    await calibrate(data.user.id);
    expect(await activeIds(data.user.id)).toEqual(first);
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(21);
  });

  it('reactivates a strong archived match under the same cap, preserving its ID and audit', async () => {
    const data = await fixture(20);
    await data.add(20, { negativeInd: 1, negativeFeedbackAt: now });
    const dormant = await db.Island.create({ userId: data.user.id, label: 'Dormant negative', weight: -0.8, islandVector: vector(20), archivedInd: true,
      archivedAt: new Date(now.getTime() - 86400000), populationAudit: [{ historical: true }] });
    await calibrate(data.user.id); await dormant.reload();
    expect(dormant.archivedInd).toBe(false);
    expect(dormant.weight).toBeLessThan(0);
    expect(dormant.populationAudit).toContainEqual({ historical: true });
    expect(await activeIds(data.user.id)).toHaveLength(20);
    expect(await activeIds(data.user.id)).toContain(dormant.id);
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(21);
    const first = await activeIds(data.user.id);
    await calibrate(data.user.id);
    expect(await activeIds(data.user.id)).toEqual(first);
  });

  it('allows a new profile below capacity', async () => {
    const data = await fixture(15);
    await data.add(15, { favoriteInd: 1, favoritedAt: now });
    await calibrate(data.user.id);
    expect(await activeIds(data.user.id)).toHaveLength(16);
  });

  it('keeps a weaker reactivation dormant at capacity and does not duplicate it on replay', async () => {
    const data = await fixture(21);
    for (const row of data.sources.slice(0, 20)) await row.update({ favoriteInd: 1, favoritedAt: now });
    await data.islands[20].update({ archivedInd: true, archivedAt: new Date(now.getTime() - 86400000) });
    // Supply the eligible weak profile explicitly so this tests persistence competition, not formation's bound.
    const all = await buildInterestIslandProfilesForUser(data.user.id);
    const weak = { label: 'Weak return', vector: vector(20), weight: 0.3157, positiveSignals: { clicks: 1 }, articles: [{ articleId: data.sources[20].id, score: 2 }] };
    all.push(weak);
    await persistIslandProfilesForUser(data.user.id, all);
    await data.islands[20].reload();
    expect(data.islands[20].archivedInd).toBe(true);
    const first = await activeIds(data.user.id);
    await persistIslandProfilesForUser(data.user.id, all);
    expect(await activeIds(data.user.id)).toEqual(first);
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(21);
  });

  it('serializes concurrent persistence for the same user and applies a smaller requested cap consistently', async () => {
    const data = await fixture(1);
    await data.add(1, { favoriteInd: 1, favoritedAt: now });
    const profiles = await buildInterestIslandProfilesForUser(data.user.id, { maxIslands: 2 });
    await Promise.all([1, 2].map(() => persistIslandProfilesForUser(data.user.id, profiles, { maxIslands: 2 })));
    expect(await activeIds(data.user.id)).toHaveLength(2);
    expect(await activeIds(data.user.id)).toContain(data.islands[0].id);
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(2);
  });
});
