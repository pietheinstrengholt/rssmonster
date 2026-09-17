import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { persistIslandProfilesForUser, runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
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
  const values = { userId: user.id, feedId: feed.id, title: 'Kubernetes technical deployment', publishedAt: new Date('2022-01-01'), embedding_model: 'test-model', articleVector: [1, 0] };
  const source = await db.Article.create({ ...values, status: 'read', ...behavior });
  const candidate = await db.Article.create({ ...values, status: 'unread' });
  return { user, source, candidate, values };
}
const ownedIsland = userId => db.Island.findOne({ where: { userId } });

describe('behavior-driven Island lifecycle', () => {
  beforeAll(async () => { if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync(); });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); advance(0); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('persists explicit renewal, expiry and reactivation explanations under the same identity', async () => {
    const { user, source } = await fixture({ positiveInd: 1, positiveFeedbackAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    expect(island.populationAudit.at(-1).lifecycle[0].reason).toBe('created');
    advance(10); await source.update({ positiveFeedbackAt: at(10) });
    await calibrate(user.id); await island.reload();
    expect(island.populationAudit.at(-1).lifecycle[0].reason).toBe('renewed');
    advance(101); await calibrate(user.id); await island.reload();
    expect(island.populationAudit.at(-1).lifecycle[0]).toMatchObject({ reason: 'inactivity_expired', boundaryAt: at(100).toISOString() });
    advance(102); await source.update({ positiveFeedbackAt: at(102) });
    await calibrate(user.id); await island.reload();
    expect(island.populationAudit.at(-1).lifecycle[0]).toMatchObject({ reason: 'reactivated', boundaryAt: at(100).toISOString() });
    expect(island.populationAudit.at(-1).sourceArticles.articles[0]).toMatchObject({ positiveInd: 1, positiveFeedbackAt: at(102).toISOString() });
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });

  it.each(['matched', 'unmatched'])('does not renew a %s negative preference from a fresh opposing click', async mode => {
    const { user, source } = await fixture({ negativeInd: 1, negativeFeedbackAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    const refresh = () => mode === 'matched' ? calibrate(user.id) : persistIslandProfilesForUser(user.id, []);
    for (const day of [60, 100]) {
      advance(day);
      await source.update({ clickedAmount: 2, lastClickedAt: at(day) });
      await refresh(); await island.reload();
      expect(Number(island.weight)).toBeLessThan(0);
      expect(island.lastBehaviorAt).toEqual(at(0));
      expect(island.archivedInd).toBe(day >= 90);
    }
    expect(island.archivedAt).toEqual(at(90));
    advance(101);
    await source.update({ negativeFeedbackAt: at(101) });
    await calibrate(user.id); await island.reload();
    expect(island).toMatchObject({ archivedInd: false, lastBehaviorAt: at(101) });
    expect(Number(island.weight)).toBeLessThan(0);
    advance(102);
    await calibrate(user.id); await island.reload();
    expect(island.lastBehaviorAt).toEqual(at(101));
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });

  it('does not renew a positive aggregate from a newer negative Article, then reactivates when the result turns negative', async () => {
    const { user, values } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await db.Article.bulkCreate([1, 2].map(() => ({ ...values, status: 'read', favoriteInd: 1, favoritedAt: at(0) })));
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(60);
    const opposing = await db.Article.create({ ...values, status: 'read', negativeInd: 1, negativeFeedbackAt: at(60) });
    await calibrate(user.id); await island.reload();
    expect(Number(island.weight)).toBeGreaterThan(0);
    expect(island.lastBehaviorAt).toEqual(at(0));
    advance(100);
    await opposing.update({ negativeFeedbackAt: at(100) });
    await calibrate(user.id); await island.reload();
    expect(Number(island.weight)).toBeGreaterThan(0);
    expect(island).toMatchObject({ archivedInd: true, archivedAt: at(90), lastBehaviorAt: at(0) });
    advance(101);
    await db.Article.create({ ...values, status: 'read', negativeInd: 1, negativeFeedbackAt: at(101) });
    await calibrate(user.id); await island.reload();
    expect(Number(island.weight)).toBeLessThan(0);
    expect(island).toMatchObject({ archivedInd: false, lastBehaviorAt: at(101) });
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });

  it('preserves early archival against opposing clicks but allows an explicit preference reversal', async () => {
    const { user, source } = await fixture({ negativeInd: 1, negativeFeedbackAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(20);
    await island.update({ archivedInd: true, archivedAt: at(20) });
    advance(30);
    await source.update({ clickedAmount: 2, lastClickedAt: at(30) });
    await calibrate(user.id); await island.reload();
    expect(Number(island.weight)).toBeLessThan(0);
    expect(island).toMatchObject({ archivedInd: true, archivedAt: at(20), lastBehaviorAt: at(0) });
    advance(31);
    await source.update({ negativeInd: 0, negativeFeedbackAt: null, positiveInd: 1, positiveFeedbackAt: at(31) });
    await calibrate(user.id); await island.reload();
    expect(Number(island.weight)).toBeGreaterThan(0);
    expect(island).toMatchObject({ archivedInd: false, lastBehaviorAt: at(31) });
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });

  it('gives a cancelled aggregate no renewal clock', () => {
    const base = { embedding_model: 'test-model', articleVector: [1, 0] };
    const support = summarizeIslandLifecycle([
      { ...base, id: 1, positiveInd: 1, positiveFeedbackAt: at(0) },
      { ...base, id: 2, negativeInd: 1, negativeFeedbackAt: at(0) }
    ], [1, 0], 'test-model');
    expect(support.lastBehaviorAt).toBeNull();
    expect(islandArchiveState(null, support).archivedInd).toBe(true);
  });

  it('keeps persistent recent engagement active while separating technical and behavioral timestamps', async () => {
    const { user, source } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    for (const day of [89, 178, 365]) {
      advance(day);
      await source.update({ lastClickedAt: at(day), clickedAmount: 2 });
      await calibrate(user.id);
      await island.reload();
      expect(island.archivedInd).toBe(false);
      expect(summarizeIslandLifecycle([source], island.islandVector, 'test-model').lastBehaviorAt).toEqual(at(day));
    }
    advance(366);
    await calibrate(user.id);
    await island.reload();
    expect(island.updatedAt).toEqual(at(366));
    expect(summarizeIslandLifecycle([source], island.islandVector, 'test-model').lastBehaviorAt).toEqual(at(365));
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
    const activity = summarizeIslandLifecycle([source], island.islandVector, 'test-model');
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

  it('expires strong historical interest at its deadline independently of remaining strength', async () => {
    const { user, source, values } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await db.Article.bulkCreate([1, 2, 3, 4].map(() => ({ ...values, status: 'read', favoriteInd: 1, favoritedAt: at(0) })));
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(365);
    await calibrate(user.id); await island.reload();
    expect(island.archivedInd).toBe(true);
    expect(island.archivedAt).toEqual(at(90));
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
    const base = { id: 1, embedding_model: 'test-model', articleVector: [1, 0], publishedAt: at(-10), favoriteInd: 1 };
    expect(summarizeIslandLifecycle([base], [1, 0], 'test-model').lastBehaviorAt).toEqual(at(-10));
    const mixed = { ...base, favoritedAt: at(-365), clickedAmount: 1, lastClickedAt: at(-180), positiveInd: 1,
      positiveFeedbackAt: at(0), negativeInd: 1, negativeFeedbackAt: at(-365) };
    expect(summarizeIslandLifecycle([mixed], [1, 0], 'test-model').lastBehaviorAt).toEqual(at(-365));
    expect(summarizeIslandLifecycle([{ ...base, favoritedAt: at(1) }], [1, 0], 'test-model').lastBehaviorAt).toEqual(at(-10));
    expect(isStaleIsland({ updatedAt: at(0) })).toBe(true);
  });

  it('expires at the exact deadline regardless of confidence and never invents legacy activity', () => {
    expect(islandArchiveState(null, { confidence: 0.01, lastBehaviorAt: at(-89) }).archivedInd).toBe(false);
    expect(islandArchiveState(null, { confidence: 1, lastBehaviorAt: at(-90) })).toMatchObject({ archivedInd: true, archivedAt: at(0) });
    expect(islandArchiveState(null, { confidence: 1, lastBehaviorAt: null }).archivedInd).toBe(true);
    const legacy = { archivedInd: true, archivedAt: null };
    expect(islandArchiveState(legacy, { confidence: 1, lastBehaviorAt: at(-1) }).archivedInd).toBe(true);
  });

  it('does not let many old weak clicks dilute a surviving explicit preference', () => {
    const oldClicks = Array.from({ length: 50 }, (_, id) => ({ id, embedding_model: 'test-model', articleVector: [1, 0], clickedAmount: 1, lastClickedAt: at(-150) }));
    expect(islandArchiveState(null, summarizeIslandLifecycle(oldClicks, [1, 0], 'test-model')).archivedInd).toBe(true);
    const support = summarizeIslandLifecycle([...oldClicks, { id: 51, embedding_model: 'test-model', articleVector: [1, 0], favoriteInd: 1, favoritedAt: at(-60) }], [1, 0], 'test-model');
    expect(isStaleIsland(support)).toBe(false);
    expect(support.confidence).toBeGreaterThan(0.12);
    expect(islandArchiveState(null, support).archivedInd).toBe(false);
  });

  it.each([1, 3, 20])('does not dilute a surviving favorite with %i exhausted clicks on the same Article', clickedAmount => {
    const favorite = { id: 1, embedding_model: 'test-model', articleVector: [1, 0], favoriteInd: 1, favoritedAt: at(-365), publishedAt: at(-2000) };
    const alone = summarizeIslandLifecycle([favorite], [1, 0], 'test-model');
    const mixed = summarizeIslandLifecycle([{ ...favorite, clickedAmount, lastClickedAt: at(-365) }], [1, 0], 'test-model');
    expect(mixed.confidence).toBeGreaterThanOrEqual(alone.confidence);
    expect(mixed.lastBehaviorAt).toEqual(alone.lastBehaviorAt);
    expect(islandArchiveState(null, mixed).archivedInd).toBe(true);
  });

  it('expires favorite and click history at the same deadline regardless of their different half-lives', async () => {
    const data = await fixture({ favoriteInd: 1, favoritedAt: at(0), clickedAmount: 3, lastClickedAt: at(0) });
    await calibrate(data.user.id);
    const island = await ownedIsland(data.user.id);
    for (const day of [90, 130, 180, 210, 365]) {
      advance(day);
      await calibrate(data.user.id); await island.reload();
      const alone = summarizeIslandLifecycle([{ ...data.source.get({ plain: true }), clickedAmount: 0 }], island.islandVector, 'test-model');
      expect(islandArchiveState(null, alone).archivedInd).toBe(true);
      expect(island.archivedInd).toBe(true);
      expect(island.archivedAt).toEqual(at(90));
    }
  });

  it('keeps expired mixed favorite history inactive on repeated calibration', async () => {
    const data = await fixture({ favoriteInd: 1, favoritedAt: at(0), clickedAmount: 1, lastClickedAt: at(0) });
    await calibrate(data.user.id);
    const island = await ownedIsland(data.user.id);
    advance(365);
    for (let replay = 0; replay < 2; replay++) {
      await calibrate(data.user.id); await island.reload(); await data.candidate.reload();
      expect(island.archivedInd).toBe(true);
      expect(Number(data.candidate.interestScore)).toBe(0);
      expect(summarizeIslandLifecycle([data.source], island.islandVector, 'test-model').lastBehaviorAt).toEqual(at(0));
    }
    advance(365 * 4);
    await calibrate(data.user.id); await island.reload(); await data.candidate.reload();
    expect(island.archivedInd).toBe(true);
    expect(Number(data.candidate.interestScore)).toBe(0);
    expect(await db.Island.count({ where: { userId: data.user.id } })).toBe(1);
  });

  it.each([
    { favoriteInd: 1, favoritedAt: at(0) },
    { negativeInd: 1, negativeFeedbackAt: at(0) },
    { clickedAmount: 1, lastClickedAt: at(0) }
  ])('excludes expired Islands during scoring before archival is persisted: %j', async behavior => {
    const { user } = await fixture(behavior);
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    expect(island.lastBehaviorAt).toEqual(at(0));
    advance(90 - 1 / 86400);
    expect((await loadIslandEvidence(user.id)).islands.map(row => row.id)).toContain(island.id);
    advance(90);
    expect((await loadIslandEvidence(user.id)).islands).toHaveLength(0);
    await island.reload();
    expect(island.archivedInd).toBe(false);
    advance(100);
    await calibrate(user.id); await island.reload();
    expect(island).toMatchObject({ archivedInd: true, archivedAt: at(90), lastBehaviorAt: at(0) });
  });

  it('reactivates from evidence after expiry but before delayed archival, preserving its ID', async () => {
    const { user, source } = await fixture({ favoriteInd: 1, favoritedAt: at(0) });
    await calibrate(user.id);
    const island = await ownedIsland(user.id);
    advance(100);
    await source.update({ favoritedAt: at(95) });
    await calibrate(user.id); await island.reload();
    expect(island).toMatchObject({ archivedInd: false, lastBehaviorAt: at(95) });
    advance(185);
    expect((await loadIslandEvidence(user.id)).islands).toHaveLength(0);
    await calibrate(user.id); await island.reload();
    expect(island.archivedAt).toEqual(at(185));
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
  });

  it('requires evidence strictly newer than expiry or an early archival boundary', () => {
    for (const island of [
      { archivedInd: false, lastBehaviorAt: at(-100) },
      { archivedInd: true, archivedAt: at(-5), lastBehaviorAt: at(-100) },
      { archivedInd: true, archivedAt: at(-10), lastBehaviorAt: at(-20) }
    ]) {
      expect(islandArchiveState(island, { lastBehaviorAt: at(-10) }).archivedInd).toBe(true);
      expect(islandArchiveState(island, { lastBehaviorAt: at(-9) })).toMatchObject({ archivedInd: false, lastBehaviorAt: at(-9) });
    }
  });

  it('does not renew from undated or future evidence or technical timestamps', () => {
    for (const lastBehaviorAt of [null, new Date('invalid'), at(1)]) {
      expect(islandArchiveState({ updatedAt: at(0), lastBehaviorAt: at(-100) }, { lastBehaviorAt, confidence: 1 }))
        .toMatchObject({ archivedInd: true, archivedAt: at(-10) });
    }
  });

  it('continues to account for meaningful negative evidence when normalizing mixed support', () => {
    const favorite = { id: 1, embedding_model: 'test-model', articleVector: [1, 0], favoriteInd: 1, favoritedAt: at(-365) };
    const opposed = { ...favorite, negativeInd: 1, negativeFeedbackAt: at(-365) };
    expect(summarizeIslandLifecycle([opposed], [1, 0], 'test-model').retainedSupport).toBeCloseTo(2 / 12, 10);
    expect(summarizeIslandLifecycle([opposed], [1, 0], 'test-model').confidence)
      .toBeLessThan(summarizeIslandLifecycle([favorite], [1, 0], 'test-model').confidence);
    const cancelled = { ...favorite, negativeInd: 1, negativeFeedbackAt: at(-730) };
    expect(summarizeIslandLifecycle([cancelled], [1, 0], 'test-model').confidence).toBe(0);
  });
});
