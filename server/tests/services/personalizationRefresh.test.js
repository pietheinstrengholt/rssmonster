import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { updateArticleBehavior } from '../../services/articles/updateArticleBehavior.js';
import { claimProcessingJobs } from '../../services/jobs/processingJobQueue.js';
import { executeClaimedProcessingJob } from '../../services/jobs/processingJobHandlers.js';
import { PERSONALIZATION_REFRESH_TYPE, completePersonalizationRefresh } from '../../services/jobs/personalizationRefresh.js';
import * as calibration from '../../services/islands/runIslandCalibration.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';

async function fixture() {
  const user = await db.User.create({ username: `refresh-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Refresh' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Refresh', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'PostgreSQL database technical release', articleVector: [1, 0], publishedAt: new Date() };
  const source = await db.Article.create({ ...values, status: 'read' });
  const candidate = await db.Article.create({ ...values, status: 'unread' });
  return { user, source, candidate, values };
}
const jobs = userId => db.ProcessingJob.findAll({ where: { userId, type: PERSONALIZATION_REFRESH_TYPE } });
const claim = async userId => {
  // Fast jobs precede durable work, including on SQLite's single-job claims.
  while (true) {
    const [job] = await claimProcessingJobs({ userId, limit: 1, now: new Date(Date.now() + 3000), leaseOwner: randomUUID() });
    if (!job || job.type === PERSONALIZATION_REFRESH_TYPE) return job;
    expect(job.type).toBe('explicit_feedback_refresh');
    await executeClaimedProcessingJob(job);
  }
};
afterEach(() => vi.restoreAllMocks());

describe('durable personalization refresh', () => {
  beforeAll(async () => {
    if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync();
  });
  it('coalesces rapid feedback, calibrates Islands and refreshes only eligible owned candidates', async () => {
    const { user, source, candidate, values } = await fixture();
    const other = await fixture();
    const filtered = await db.Article.create({ ...values, status: 'unread', filteredInd: true, interestScore: 0.123 });
    const duplicate = await db.Article.create({ ...values, status: 'unread', duplicateOfArticleId: source.id, interestScore: 0.123 });
    const read = await db.Article.create({ ...values, status: 'read', interestScore: 0.123 });
    const before = computeRecommended(candidate);
    await updateArticleBehavior(source, { positiveInd: 1, positiveFeedbackAt: new Date() });
    const deadline = (await jobs(user.id))[0].availableAt;
    await Promise.all(Array.from({ length: 5 }, () => updateArticleBehavior(db.Article, {
      clickedAmount: db.sequelize.literal('clickedAmount + 1'), lastClickedAt: new Date()
    }, { where: { id: source.id, userId: user.id } })));
    expect(await jobs(user.id)).toHaveLength(1);
    expect((await jobs(user.id))[0].availableAt).toEqual(deadline);
    await source.reload(); expect(source.clickedAmount).toBe(5);
    expect((await claimProcessingJobs({ userId: user.id, now: new Date(deadline.getTime() - 1) })).filter(job => job.type === PERSONALIZATION_REFRESH_TYPE)).toHaveLength(0);
    const job = await claim(user.id);
    expect((await executeClaimedProcessingJob(job)).status).toBe('succeeded');
    expect(await db.Island.count({ where: { userId: user.id } })).toBeGreaterThan(0);
    await candidate.reload();
    expect(candidate.interestScore).toBeGreaterThan(0);
    expect(computeRecommended(candidate)).toBeGreaterThan(before);
    for (const article of [filtered, duplicate, read]) {
      await article.reload(); expect(article.interestScore).toBeCloseTo(0.123);
    }
    await other.candidate.reload(); expect(Number(other.candidate.interestScore)).toBe(0);
    expect((await jobs(user.id))[0].status).toBe('succeeded');
    expect((await claimProcessingJobs({ userId: user.id })).some(job => job.type === PERSONALIZATION_REFRESH_TYPE)).toBe(false);
  });

  it('refreshes interest after unfavoriting and applies explicit negative feedback without a crawl', async () => {
    const { user, source, candidate } = await fixture();
    await updateArticleBehavior(source, { favoriteInd: 1, favoritedAt: new Date() });
    await executeClaimedProcessingJob(await claim(user.id));
    await candidate.reload(); expect(candidate.interestScore).toBeGreaterThan(0);
    const favoriteScore = candidate.interestScore;
    await updateArticleBehavior(source, { favoriteInd: 0, favoritedAt: null });
    await executeClaimedProcessingJob(await claim(user.id));
    // Existing durable Island memory remains; removing support reduces its authority.
    await candidate.reload(); expect(candidate.interestScore).toBeLessThan(favoriteScore);
    await updateArticleBehavior(source, { negativeInd: 1, negativeFeedbackAt: new Date() });
    await executeClaimedProcessingJob(await claim(user.id));
    await candidate.reload(); expect(candidate.interestScore).toBeLessThan(0);
  });

  it('weakens aged negative evidence when the existing refresh recalibrates and rescores', async () => {
    const { user, source, candidate } = await fixture();
    await updateArticleBehavior(source, { negativeInd: 1, negativeFeedbackAt: new Date() });
    expect((await executeClaimedProcessingJob(await claim(user.id))).status).toBe('succeeded');
    await candidate.reload();
    const freshScore = Number(candidate.interestScore);
    expect(freshScore).toBeLessThan(0);
    const island = await db.Island.findOne({ where: { userId: user.id } });
    const freshWeight = Number(island.weight);

    // Reconstruct a year-old interaction; HTTP actions still always stamp the actual interaction time.
    await updateArticleBehavior(source, { negativeInd: 1, negativeFeedbackAt: new Date(Date.now() - 365 * 86400000) });
    expect((await executeClaimedProcessingJob(await claim(user.id))).status).toBe('succeeded');
    await candidate.reload();
    await island.reload();
    expect(Number(island.weight)).toBeGreaterThan(freshWeight);
    expect(Number(island.weight)).toBeLessThan(0);
    expect(Number(candidate.interestScore)).toBeGreaterThan(freshScore);
    expect(Number(candidate.interestScore)).toBeLessThan(0);
    expect(island.positiveSignals.negatives).toBe(1);
  });

  it('retains actions arriving during a run as one follow-up and reactivates completed work', async () => {
    const { user, source } = await fixture();
    await updateArticleBehavior(source, { favoriteInd: 1, favoritedAt: new Date() });
    const job = await claim(user.id);
    expect(await claimProcessingJobs({ userId: user.id })).toHaveLength(0);
    expect(await completePersonalizationRefresh(job, 'another-worker')).toBeNull();
    expect((await jobs(user.id))[0].status).toBe('running');
    const run = vi.spyOn(calibration, 'runIslandCalibrationForUser').mockImplementationOnce(async () => {
      await updateArticleBehavior(source, { favoriteInd: 0, favoritedAt: null });
      await updateArticleBehavior(source, { clickedAmount: 2, lastClickedAt: new Date() });
    }).mockResolvedValue({});
    expect(await executeClaimedProcessingJob(job)).toMatchObject({ status: 'succeeded', refreshPending: true });
    expect(await jobs(user.id)).toHaveLength(1);
    expect((await executeClaimedProcessingJob(await claim(user.id))).status).toBe('succeeded');
    expect(run).toHaveBeenCalledTimes(2);
    await updateArticleBehavior(source, { negativeInd: 1, negativeFeedbackAt: new Date() });
    expect((await jobs(user.id))[0].status).toBe('pending');
    expect(await jobs(user.id)).toHaveLength(1);
  });

  it('rolls back refresh requests with behavior and ignores non-behavior or unmatched updates', async () => {
    const { user, source } = await fixture();
    await expect(db.sequelize.transaction(async transaction => {
      await updateArticleBehavior(source, { favoriteInd: 1, favoritedAt: new Date() }, { transaction });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    await source.reload(); expect(Number(source.favoriteInd)).toBe(0);
    await updateArticleBehavior(source, { status: 'unread' });
    await updateArticleBehavior(db.Article, { favoriteInd: 1, favoritedAt: new Date() }, { where: { id: -1, userId: user.id } });
    expect(await jobs(user.id)).toHaveLength(0);
  });


  // SQLite's immediate transaction serializes writers before this race can occur.
  it.skipIf(db.sequelize.getDialect() === 'sqlite')('does not lose a request racing terminal completion', async () => {
    const { user, source } = await fixture();
    await updateArticleBehavior(source, { favoriteInd: 1, favoritedAt: new Date() });
    const job = await claim(user.id);
    const findOne = db.ProcessingJob.findOne.bind(db.ProcessingJob);
    let completed = false;
    vi.spyOn(db.ProcessingJob, 'findOne').mockImplementation(async options => {
      const row = await findOne(options);
      if (!completed && options.where.dedupeKey === 'current') {
        completed = true;
        expect(await completePersonalizationRefresh(job, job.leaseOwner)).toBe('succeeded');
      }
      return row;
    });
    await updateArticleBehavior(source, { favoriteInd: 0, favoritedAt: null });
    expect(completed).toBe(true);
    expect((await jobs(user.id))[0].status).toBe('pending');
  });

  it('uses the existing retry lifecycle when calibration fails', async () => {
    const { user, source } = await fixture();
    await updateArticleBehavior(source, { attentionBucket: 3, lastMeaningfulReadAt: new Date() });
    vi.spyOn(calibration, 'runIslandCalibrationForUser').mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue({});
    expect((await executeClaimedProcessingJob(await claim(user.id))).status).toBe('pending');
    const [job] = await jobs(user.id);
    expect(job.attempts).toBe(1);
    expect(job.lastErrorCode).toBe('PROCESSING_JOB_FAILED');
    const [retry] = await claimProcessingJobs({ userId: user.id, now: new Date(Date.now() + 60000) });
    expect((await executeClaimedProcessingJob(retry)).status).toBe('succeeded');
  });
});
