import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { islandArchiveState, summarizeIslandLifecycle } from '../../services/islands/islandLifecycle.js';
import { loadIslandEvidence } from '../../services/islands/islandInterestConfidence.js';
import { isStaleIsland } from '../../services/islands/islandVectorUtils.js';

const start = Date.parse('2026-09-14T12:00:00Z');
const at = days => new Date(start + days * 86400000);
const advance = days => vi.setSystemTime(at(days));
const calibrate = userId => runIslandCalibrationForUser(userId, { generateLabels: false });
async function fixture(behavior = { clickedAmount: 1, lastClickedAt: at(0) }) {
  const user = await db.User.create({ username: `lifecycle-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Lifecycle' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Lifecycle', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'Kubernetes technical deployment', publishedAt: new Date('2022-01-01'), articleVector: [1, 0] };
  const source = await db.Article.create({ ...values, status: 'read', ...behavior });
  const candidate = await db.Article.create({ ...values, status: 'unread' });
  return { user, source, candidate, values };
}
const ownedIsland = userId => db.Island.findOne({ where: { userId } });

describe('behavior-driven Island lifecycle', () => {
  beforeAll(async () => { if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync(); });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); advance(0); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps persistent recent engagement active while separating technical and behavioral timestamps', async () => {
    const { user, source } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    for (const day of [90, 180, 365]) {
      advance(day);
      await source.update({ lastClickedAt: at(day), clickedAmount: 2 });
      await calibrate(user.id);
      await island.reload();
      expect(island.archivedInd).toBe(false);
      expect(summarizeIslandLifecycle([source], island.islandVector).lastBehaviorAt).toEqual(at(day));
    }
    advance(366);
    await calibrate(user.id);
    await island.reload();
    expect(island.updatedAt).toEqual(at(366));
    expect(summarizeIslandLifecycle([source], island.islandVector).lastBehaviorAt).toEqual(at(365));
  });

  it('archives old matched click evidence despite repeated calibration and reactivates the same ID on new Kubernetes behavior', async () => {
    const { user, source, candidate } = await fixture();
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(90);
    expect(await buildInterestIslandProfilesForUser(user.id)).toHaveLength(1);
    await calibrate(user.id);
    await island.reload(); await candidate.reload();
    expect(island.archivedInd).toBe(true);
    expect(island.archivedAt).toEqual(at(90));
    expect(Number(candidate.interestScore)).toBe(0);
    expect((await loadIslandEvidence(user.id)).islands).toHaveLength(0);
    const activity = summarizeIslandLifecycle([source], island.islandVector);
    expect(activity.lastBehaviorAt).toEqual(at(0));
    expect(isStaleIsland(activity)).toBe(true);
    expect(activity.confidence).toBeLessThan(0.12);

    advance(91);
    await calibrate(user.id);
    await island.reload();
    expect(island.updatedAt).toEqual(at(91));
    expect(island.archivedInd).toBe(true);
    expect(island.archivedAt).toEqual(at(90));
    await source.reload(); expect(source.lastClickedAt).toEqual(at(0));

    advance(92);
    await source.update({ favoriteInd: 1, favoritedAt: at(92) });
    await calibrate(user.id);
    await island.reload(); await candidate.reload();
    expect(island.archivedInd).toBe(false);
    expect(island.archivedAt).toBeNull();
    expect((await ownedIsland(user.id)).id).toBe(island.id);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
    expect(Number(candidate.interestScore)).toBeGreaterThan(0);
    expect(await db.Event.count({ where: { userId: user.id } })).toBe(0);
  });

  it('lets strong historical interest remain active while supported, then archive after decay weakens it', async () => {
    const { user, source, values } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await db.Article.bulkCreate([1, 2, 3, 4].map(() => ({ ...values, status: 'read', favoriteInd: 1, favoritedAt: at(0) })));
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(365);
    await calibrate(user.id); await island.reload();
    expect(island.archivedInd).toBe(false);
    advance(365 * 4);
    expect(await buildInterestIslandProfilesForUser(user.id)).toHaveLength(1);
    await calibrate(user.id); await island.reload();
    expect(island.archivedInd).toBe(true);
    await source.reload(); expect(source.favoritedAt).toEqual(at(0));
  });

  it('archives an unmatched exhausted click even when its row was just updated, without touching another user', async () => {
    const { user } = await fixture();
    const other = await fixture();
    await calibrate(user.id); await calibrate(other.user.id);
    const island = await ownedIsland(user.id);
    const untouched = await ownedIsland(other.user.id);
    advance(1000);
    await island.update({ label: 'Recently renamed Kubernetes' });
    expect(await buildInterestIslandProfilesForUser(user.id)).toHaveLength(0);
    await calibrate(user.id); await island.reload(); await untouched.reload();
    expect(island.archivedInd).toBe(true);
    expect(untouched.archivedInd).toBe(false);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });

  it('does not reactivate archived strong old support without an interaction newer than archival', async () => {
    const { user } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(1);
    await island.update({ archivedInd: true, archivedAt: at(1) });
    advance(2);
    await calibrate(user.id); await island.reload();
    expect(island.archivedInd).toBe(true);
    expect(island.archivedAt).toEqual(at(1));
  });

  it('uses legacy publication as activity and ignores exhausted, contradictory or future clocks', () => {
    const base = { id: 1, articleVector: [1, 0], publishedAt: at(-10), favoriteInd: 1 };
    expect(summarizeIslandLifecycle([base], [1, 0]).lastBehaviorAt).toEqual(at(-10));
    const mixed = { ...base, favoritedAt: at(-365), clickedAmount: 1, lastClickedAt: at(-180), positiveInd: 1,
      positiveFeedbackAt: at(0), negativeInd: 1, negativeFeedbackAt: at(-365) };
    expect(summarizeIslandLifecycle([mixed], [1, 0]).lastBehaviorAt).toEqual(at(-365));
    expect(summarizeIslandLifecycle([{ ...base, favoritedAt: at(1) }], [1, 0]).lastBehaviorAt).toBeNull();
    expect(isStaleIsland({ updatedAt: at(0) })).toBe(true);
  });

  it('requires both staleness and weakness, and requires recent support for legacy archives without an archive time', () => {
    expect(islandArchiveState(null, { confidence: 0.01, lastBehaviorAt: at(-44) }).archivedInd).toBe(false);
    expect(islandArchiveState(null, { confidence: 0.01, lastBehaviorAt: at(-45) }).archivedInd).toBe(true);
    expect(islandArchiveState(null, { confidence: 0.8, lastBehaviorAt: at(-90) }).archivedInd).toBe(false);
    const legacy = { archivedInd: true, archivedAt: null };
    expect(islandArchiveState(legacy, { confidence: 0.8, lastBehaviorAt: at(-90) }).archivedInd).toBe(true);
    expect(islandArchiveState(legacy, { confidence: 0.8, lastBehaviorAt: at(-1) }).archivedInd).toBe(false);
  });

  it('does not let many old weak clicks dilute a surviving explicit preference', () => {
    const oldClicks = Array.from({ length: 50 }, (_, id) => ({ id, articleVector: [1, 0], clickedAmount: 1, lastClickedAt: at(-150) }));
    expect(islandArchiveState(null, summarizeIslandLifecycle(oldClicks, [1, 0])).archivedInd).toBe(true);
    const support = summarizeIslandLifecycle([...oldClicks, { id: 51, articleVector: [1, 0], favoriteInd: 1, favoritedAt: at(-60) }], [1, 0]);
    expect(isStaleIsland(support)).toBe(true);
    expect(support.confidence).toBeGreaterThan(0.12);
    expect(islandArchiveState(null, support).archivedInd).toBe(false);
  });
});
