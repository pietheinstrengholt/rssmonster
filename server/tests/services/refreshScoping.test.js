import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { updateArticleBehavior } from '../../services/articles/updateArticleBehavior.js';
import { claimProcessingJobs } from '../../services/jobs/processingJobQueue.js';
import { executeClaimedProcessingJob } from '../../services/jobs/processingJobHandlers.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import * as profiles from '../../services/islands/islandArticleProfiles.js';
import * as scoring from '../../services/score/scoreArticlesFromIslands.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';

async function fixture(now) {
  const user = await db.User.create({ username: `scoping-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Scope' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Scope', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'PostgreSQL technical deployment', publishedAt: new Date(now), embedding_model: 'test-model', articleVector: [1, 0] };
  const source = await db.Article.create({ ...values, status: 'read' });
  const related = await db.Article.create({ ...values, status: 'unread' });
  const unrelated = await db.Article.create({ ...values, status: 'unread', articleVector: [0, 1] });
  const island = await db.Island.create({ userId: user.id, label: 'Database', weight: 0.4, embedding_model: 'test-model', islandVector: [0.8, 0.6] });
  return { user, source, related, unrelated, island };
}
const claim = async (userId, now) => (await claimProcessingJobs({ userId, now: new Date(now + 60000), limit: 1 }))[0];
const scores = async graph => {
  await graph.related.reload(); await graph.unrelated.reload();
  return [graph.related, graph.unrelated].map(article => ({ interest: article.interestScore, recommended: computeRecommended(article) }));
};
afterEach(() => vi.restoreAllMocks());

describe('conservative refresh scoping and replay', () => {
  beforeAll(async () => { if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync(); });

  it('coalesces final behavior into one user refresh identical to complete calibration and logs actual work', async () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
    const reference = await fixture(now);
    const queued = await fixture(now);
    const untouched = await fixture(now);
    const finalBehavior = { favoriteInd: 1, favoritedAt: new Date(now), clickedAmount: 2, lastClickedAt: new Date(now) };
    await reference.source.update(finalBehavior);
    await updateArticleBehavior(queued.source, { favoriteInd: 1, favoritedAt: new Date(now) });
    for (const clicks of [1, 2]) await updateArticleBehavior(queued.source, { clickedAmount: clicks, lastClickedAt: new Date(now) });
    expect(await db.ProcessingJob.count({ where: { userId: queued.user.id } })).toBe(1);
    await runIslandCalibrationForUser(reference.user.id, { generateLabels: false });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await executeClaimedProcessingJob(await claim(queued.user.id, now));
    expect(result.status).toBe('succeeded');
    expect(await scores(queued)).toEqual(await scores(reference));
    await queued.island.reload(); await reference.island.reload();
    expect(queued.island.islandVector).toEqual(reference.island.islandVector);
    expect(queued.island.weight).toEqual(reference.island.weight);
    const metric = log.mock.calls.filter(([label]) => label === '[PERSONALIZATION REFRESH]').map(([, payload]) => JSON.parse(payload)).at(-1);
    expect(metric).toMatchObject({ userId: queued.user.id, islandsChanged: 1, candidatesRescored: 2, interestScoresChanged: 1 });
    expect(metric.triggerReasons).toEqual(['favorite', 'click']);
    expect(metric.calibrationDurationMs).toBeGreaterThanOrEqual(0);
    expect(await scores(untouched)).toEqual([{ interest: 0, recommended: computeRecommended(untouched.related) }, { interest: 0, recommended: computeRecommended(untouched.unrelated) }]);
    await untouched.island.reload(); expect(untouched.island.islandVector).toEqual([0.8, 0.6]);
    expect(await db.ProcessingJob.count({ where: { userId: untouched.user.id } })).toBe(0);
    expect(await db.ProcessingJob.count({ where: { userId: queued.user.id, type: 'semantic_label' } })).toBe(0);
  });

  it('retries scoring without reapplying committed calibration or drifting the Island vector', async () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
    const graph = await fixture(now);
    const reference = await fixture(now);
    const behavior = { favoriteInd: 1, favoritedAt: new Date(now) };
    await reference.source.update(behavior);
    await runIslandCalibrationForUser(reference.user.id, { generateLabels: false });
    await updateArticleBehavior(graph.source, behavior);
    vi.spyOn(scoring, 'default').mockRejectedValueOnce(new Error('scoring interrupted'));
    expect((await executeClaimedProcessingJob(await claim(graph.user.id, now))).status).toBe('pending');
    await graph.island.reload(); const vector = graph.island.islandVector;
    const job = await db.ProcessingJob.findOne({ where: { userId: graph.user.id } });
    expect(job.payload.calibration.requestId).toBe(job.payload.requestId);
    const build = vi.spyOn(profiles, 'buildInterestIslandProfilesForUser');
    expect((await executeClaimedProcessingJob(await claim(graph.user.id, now))).status).toBe('succeeded');
    expect(build).not.toHaveBeenCalled();
    await graph.island.reload(); expect(graph.island.islandVector).toEqual(vector);
    expect(await scores(graph)).toEqual(await scores(reference));
  });

  it('replays scoring after archival without reactivating or refreshing behavioral activity', async () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
    const graph = await fixture(now);
    const lastClickedAt = new Date(Math.floor(now / 1000) * 1000 - 90 * 86400000);
    await updateArticleBehavior(graph.source, { clickedAmount: 1, lastClickedAt });
    vi.spyOn(scoring, 'default').mockRejectedValueOnce(new Error('scoring interrupted after archive'));
    expect((await executeClaimedProcessingJob(await claim(graph.user.id, now))).status).toBe('pending');
    await graph.island.reload();
    expect(graph.island.archivedInd).toBe(true);
    const archivedAt = graph.island.archivedAt;
    const build = vi.spyOn(profiles, 'buildInterestIslandProfilesForUser');
    expect((await executeClaimedProcessingJob(await claim(graph.user.id, now))).status).toBe('succeeded');
    expect(build).not.toHaveBeenCalled();
    await graph.island.reload(); await graph.source.reload(); await graph.related.reload();
    expect(graph.island.archivedInd).toBe(true);
    expect(graph.island.archivedAt).toEqual(archivedAt);
    expect(graph.source.lastClickedAt).toEqual(lastClickedAt);
    expect(Number(graph.related.interestScore)).toBe(0);
  });

  it('rolls back Islands if the replay checkpoint cannot be committed', async () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
    const graph = await fixture(now);
    await updateArticleBehavior(graph.source, { favoriteInd: 1, favoritedAt: new Date(now) });
    const update = db.ProcessingJob.prototype.update;
    let failed = false;
    vi.spyOn(db.ProcessingJob.prototype, 'update').mockImplementation(function (values, options) {
      if (!failed && values.payload?.calibration) {
        failed = true;
        throw new Error('checkpoint interrupted');
      }
      return update.call(this, values, options);
    });
    expect((await executeClaimedProcessingJob(await claim(graph.user.id, now))).status).toBe('pending');
    await graph.island.reload(); expect(graph.island.islandVector).toEqual([0.8, 0.6]);
    const job = await db.ProcessingJob.findOne({ where: { userId: graph.user.id } });
    expect(job.payload.calibration).toBeUndefined();
    expect((await executeClaimedProcessingJob(await claim(graph.user.id, now))).status).toBe('succeeded');
    await graph.related.reload(); expect(graph.related.interestScore).toBeGreaterThan(0);
  });

  it('does not write unchanged persisted scores on repeated evaluation, including MySQL FLOAT round-trips', async () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
    const graph = await fixture(now);
    await graph.source.update({ favoriteInd: 1, favoritedAt: new Date(now) });
    await runIslandCalibrationForUser(graph.user.id, { generateLabels: false });
    const expected = await scores(graph);
    const writes = vi.spyOn(db.Article, 'update');
    const result = await scoring.scoreArticlesFromIslandsForUser(graph.user.id);
    expect(result).toMatchObject({ candidatesRescored: 2, interestScoresChanged: 0 });
    // Successful unchanged evaluations refresh their diagnostic clock, not the score.
    for (const [values] of writes.mock.calls) expect(values).not.toHaveProperty('interestScore');
    expect(writes).toHaveBeenCalledWith({ interestScoredAt: expect.any(Date) }, expect.objectContaining({ silent: true }));
    expect(await scores(graph)).toEqual(expected);
  });
});
