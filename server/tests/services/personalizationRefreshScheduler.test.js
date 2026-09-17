import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { enqueueDuePersonalizationRefreshes } from '../../services/jobs/personalizationRefreshScheduler.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { updateArticleBehavior } from '../../services/articles/updateArticleBehavior.js';
import { claimProcessingJobs } from '../../services/jobs/processingJobQueue.js';
import { executeClaimedProcessingJob } from '../../services/jobs/processingJobHandlers.js';

const DAY = 86400000;
const start = Date.parse('2026-09-15T12:00:00Z');
const at = days => new Date(start + days * DAY);
const advance = days => vi.setSystemTime(at(days));
const refreshJob = userId => db.ProcessingJob.findOne({ where: { userId, type: 'personalization_refresh', dedupeKey: 'current' } });
const execute = async userId => {
  const [job] = await claimProcessingJobs({ userId, now: new Date(Date.now() + 60000), limit: 1, leaseOwner: randomUUID() });
  expect(job).toBeDefined();
  return executeClaimedProcessingJob(job);
};
const ownedUsers = [];
let previousUsers = [];
async function fixture() {
  const user = await db.User.create({ username: `elapsed-${randomUUID()}` });
  ownedUsers.push(user);
  const category = await db.Category.create({ userId: user.id, name: 'Elapsed' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Elapsed', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'Kubernetes technical deployment',
    publishedAt: at(-10), embedding_model: 'test-model', articleVector: [1, 0] };
  const source = await db.Article.create({ ...values, status: 'read', clickedAmount: 1, lastClickedAt: at(0) });
  const candidate = await db.Article.create({ ...values, status: 'unread' });
  // Nonidentical centroid exposes accidental repeated blending on a timed refresh.
  const island = await db.Island.create({ userId: user.id, label: 'Kubernetes', weight: 0.8,
    islandVector: [0.8, 0.6], embedding_model: 'test-model' });
  return { user, source, candidate, island, values };
}

describe('elapsed-time personalization refresh', () => {
  beforeAll(async () => {
    if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync();
    // Other suites retain fixtures; isolate this global scheduler's due population and restore it.
    previousUsers = await db.User.findAll({ attributes: ['id', 'personalizationRefreshedAt'], raw: true });
    await db.User.update({ personalizationRefreshedAt: at(10000) }, { where: {}, silent: true });
  });
  afterAll(async () => {
    for (const user of previousUsers) await db.User.update({ personalizationRefreshedAt: user.personalizationRefreshedAt }, {
      where: { id: user.id }, silent: true
    });
  });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); advance(0); });
  afterEach(async () => {
    vi.useRealTimers(); vi.restoreAllMocks();
    for (const user of ownedUsers.splice(0)) await user.destroy();
  });

  it('decays idle preferences without centroid or clock drift and clears scores when memory archives', async () => {
    const graph = await fixture();
    const other = await fixture();
    await runIslandCalibrationForUser(graph.user.id, { generateLabels: false });
    await runIslandCalibrationForUser(other.user.id, { generateLabels: false });
    await graph.island.reload(); await graph.candidate.reload();
    const vector = graph.island.islandVector;
    const initialWeight = Number(graph.island.weight);
    const initialScore = Number(graph.candidate.interestScore);
    const filtered = await db.Article.create({ ...graph.values, status: 'unread', filteredInd: true, interestScore: 0.5 });
    const duplicate = await db.Article.create({ ...graph.values, status: 'unread', duplicateOfArticleId: graph.source.id, interestScore: 0.5 });
    advance(30);
    await other.user.update({ personalizationRefreshedAt: at(30) });
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([graph.user.id]);
    expect((await execute(graph.user.id)).status).toBe('succeeded');
    await graph.island.reload(); await graph.candidate.reload(); await graph.source.reload(); await graph.user.reload();
    expect(Number(graph.island.weight)).toBeLessThan(initialWeight);
    expect(Number(graph.candidate.interestScore)).toBeLessThan(initialScore);
    expect(graph.candidate.interestScoredAt).toEqual(at(30));
    expect(graph.user.personalizationRefreshedAt).toEqual(at(30));
    expect(graph.island.islandVector).toEqual(vector);
    expect(graph.source.lastClickedAt).toEqual(at(0));
    expect(graph.source.interestScoredAt).toBeNull();
    for (const article of [filtered, duplicate]) {
      await article.reload(); expect(Number(article.interestScore)).toBeCloseTo(0.5); expect(article.interestScoredAt).toBeNull();
    }
    await other.candidate.reload(); expect(other.candidate.interestScoredAt).toEqual(at(0));
    advance(90);
    await other.user.update({ personalizationRefreshedAt: at(90) });
    await enqueueDuePersonalizationRefreshes();
    expect((await execute(graph.user.id)).status).toBe('succeeded');
    await graph.island.reload(); await graph.candidate.reload();
    expect(graph.island.archivedInd).toBe(true);
    expect(graph.island.islandVector).toEqual(vector);
    expect(Number(graph.candidate.interestScore)).toBe(0);
    expect(await db.Event.count({ where: { userId: graph.user.id } })).toBe(0);
  });

  it('uses the successful full refresh clock, including the due boundary and after job cleanup', async () => {
    const { user, island } = await fixture();
    await runIslandCalibrationForUser(user.id, { generateLabels: false });
    vi.setSystemTime(new Date(at(1).getTime() - 1));
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([]);
    advance(1);
    await island.update({ label: 'Technical label change' });
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([user.id]);
    expect((await execute(user.id)).status).toBe('succeeded');
    await db.ProcessingJob.destroy({ where: { userId: user.id, status: 'succeeded' } });
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([]);
  });

  it('bounds and spreads work, skips outstanding jobs, and continues with later users', async () => {
    const graphs = [];
    for (let i = 0; i < 4; i++) graphs.push(await fixture());
    const empty = await db.User.create({ username: `elapsed-empty-${randomUUID()}` });
    ownedUsers.push(empty);
    expect((await enqueueDuePersonalizationRefreshes({ limit: 2 })).queuedUserIds)
      .toEqual(graphs.slice(0, 2).map(graph => graph.user.id));
    const first = await refreshJob(graphs[0].user.id);
    const second = await refreshJob(graphs[1].user.id);
    expect(first.availableAt).toEqual(at(0));
    expect(second.availableAt).toEqual(new Date(start + 1800000));
    await first.update({ status: 'dead', attempts: 5 });
    await second.update({ status: 'cancelled' });
    expect((await enqueueDuePersonalizationRefreshes({ limit: 2 })).queuedUserIds).toEqual(graphs.slice(2).map(graph => graph.user.id));
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([]);
    await first.reload(); expect(first.attempts).toBe(5);
    expect(await refreshJob(empty.id)).toBeNull();
  });

  it('deduplicates concurrent scheduler instances under the user lock', async () => {
    const { user } = await fixture();
    const results = await Promise.all([enqueueDuePersonalizationRefreshes(), enqueueDuePersonalizationRefreshes()]);
    expect(results.flatMap(result => result.queuedUserIds)).toEqual([user.id]);
    expect(await db.ProcessingJob.count({ where: { userId: user.id } })).toBe(1);
  });

  it('expedites new behavior behind a spread job and permits normal vector adaptation', async () => {
    await fixture();
    const graph = await fixture();
    await enqueueDuePersonalizationRefreshes({ limit: 2 });
    await updateArticleBehavior(graph.source, { favoriteInd: 1, favoritedAt: at(0) });
    const job = await refreshJob(graph.user.id);
    expect(job.availableAt.getTime()).toBeLessThanOrEqual(start + 2000);
    expect(job.payload.triggerReasons).toEqual(['elapsed_time', 'favorite']);
    expect((await execute(graph.user.id)).status).toBe('succeeded');
    await graph.island.reload(); expect(graph.island.islandVector).not.toEqual([0.8, 0.6]);
  });

  it.each([false, true])('does not mark failed scoring fresh or invent age on a delayed retry (legacy=%s)', async legacy => {
    const graph = await fixture();
    await enqueueDuePersonalizationRefreshes();
    const findAll = db.Article.findAll.bind(db.Article);
    let interrupted = false;
    vi.spyOn(db.Article, 'findAll').mockImplementation(options => {
      if (!interrupted && options.where?.status === 'unread') {
        interrupted = true;
        throw new Error('unread query unavailable');
      }
      return findAll(options);
    });
    expect((await execute(graph.user.id)).status).toBe('pending');
    await graph.user.reload(); expect(graph.user.personalizationRefreshedAt).toBeNull();
    const pending = await refreshJob(graph.user.id);
    const requestId = pending.payload.requestId;
    if (legacy) {
      const calibration = { ...pending.payload.calibration };
      delete calibration.refreshedAt;
      await pending.update({ payload: { ...pending.payload, calibration } });
    }
    advance(2);
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([]);
    await pending.reload(); expect(pending.payload.requestId).toBe(requestId);
    expect((await execute(graph.user.id)).status).toBe('succeeded');
    await graph.user.reload(); expect(graph.user.personalizationRefreshedAt).toEqual(legacy ? null : at(0));
    expect((await enqueueDuePersonalizationRefreshes()).queuedUserIds).toEqual([graph.user.id]);
  });

  it('decays negative memory without turning absence of new behavior into positive evidence', async () => {
    const graph = await fixture();
    await graph.source.update({ clickedAmount: 0, lastClickedAt: null, negativeInd: 1, negativeFeedbackAt: at(0) });
    await runIslandCalibrationForUser(graph.user.id, { generateLabels: false });
    await graph.candidate.reload();
    const original = Number(graph.candidate.interestScore);
    expect(original).toBeLessThan(0);
    advance(365);
    await enqueueDuePersonalizationRefreshes();
    expect((await execute(graph.user.id)).status).toBe('succeeded');
    await graph.candidate.reload(); await graph.source.reload();
    expect(Number(graph.candidate.interestScore)).toBeGreaterThan(original);
    expect(Number(graph.candidate.interestScore)).toBe(0);
    expect(graph.source.negativeFeedbackAt).toEqual(at(0));
  });
});
