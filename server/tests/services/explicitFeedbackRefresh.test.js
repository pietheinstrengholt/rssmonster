import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { updateArticleBehavior } from '../../services/articles/updateArticleBehavior.js';
import { claimProcessingJobs } from '../../services/jobs/processingJobQueue.js';
import { executeClaimedProcessingJob } from '../../services/jobs/processingJobHandlers.js';
import { EXPLICIT_FEEDBACK_REFRESH_TYPE, handleExplicitFeedbackRefresh } from '../../services/jobs/personalizationRefresh.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';

let app;
async function fixture() {
  const user = await db.User.create({ username: `explicit-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Explicit' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Explicit', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'PostgreSQL technical deployment guide', publishedAt: new Date(), articleVector: [1, 0] };
  const source = await db.Article.create({ ...values, status: 'read' });
  const candidate = await db.Article.create({ ...values, status: 'unread' });
  const authorization = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
  return { user, source, candidate, values, post: action => request(app).post(`/api/articles/${action}/${source.id}`).set('Authorization', authorization).send({}) };
}
const claimFast = async userId => {
  const [job] = await claimProcessingJobs({ userId, limit: 1 });
  expect(job.type).toBe(EXPLICIT_FEEDBACK_REFRESH_TYPE);
  return job;
};

describe('fast explicit feedback scoring', () => {
  beforeAll(async () => {
    if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync();
    process.env.DISABLE_LISTENER = 'true'; app = (await import('../../app.js')).default;
  }, 50000);

  it('persists positive then negative related scores through HTTP before rebuilding any Islands', async () => {
    const { user, source, candidate, values, post } = await fixture();
    const other = await fixture();
    const excluded = await Promise.all([
      db.Article.create({ ...values, status: 'unread', articleVector: [0, 1], interestScore: 0.123 }),
      db.Article.create({ ...values, status: 'read', interestScore: 0.123 }),
      db.Article.create({ ...values, status: 'unread', filteredInd: true, interestScore: 0.123 }),
      db.Article.create({ ...values, status: 'unread', duplicateOfArticleId: source.id, interestScore: 0.123 })
    ]);
    const neutral = computeRecommended(candidate);
    expect((await post('markmorelikethis')).status).toBe(200);
    await candidate.reload(); expect(Number(candidate.interestScore)).toBe(0);
    expect((await executeClaimedProcessingJob(await claimFast(user.id))).status).toBe('succeeded');
    await candidate.reload(); expect(candidate.interestScore).toBeGreaterThan(0);
    expect(computeRecommended(candidate)).toBeGreaterThan(neutral);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(0);
    expect((await post('marknotinterested')).status).toBe(200);
    expect((await executeClaimedProcessingJob(await claimFast(user.id))).status).toBe('succeeded');
    await candidate.reload(); expect(candidate.interestScore).toBeLessThan(0);
    expect(computeRecommended(candidate)).toBeLessThan(neutral);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(0);
    for (const article of excluded) { await article.reload(); expect(article.interestScore).toBeCloseTo(0.123); }
    await other.candidate.reload(); expect(Number(other.candidate.interestScore)).toBe(0);
    const durable = await db.ProcessingJob.findOne({ where: { userId: user.id, type: 'personalization_refresh' } });
    expect(durable.status).toBe('pending');
  });

  it('uses current feedback after rapid sign changes and deduplicates work for the source', async () => {
    const { user, source, candidate } = await fixture();
    await updateArticleBehavior(source, { positiveInd: 1, negativeInd: 0, positiveFeedbackAt: new Date() });
    const job = await claimFast(user.id);
    await updateArticleBehavior(source, { positiveInd: 0, negativeInd: 1, positiveFeedbackAt: null, negativeFeedbackAt: new Date() });
    expect(await executeClaimedProcessingJob(job)).toMatchObject({ status: 'succeeded', refreshPending: true });
    await candidate.reload(); expect(candidate.interestScore).toBeLessThan(0);
    expect((await executeClaimedProcessingJob(await claimFast(user.id))).status).toBe('succeeded');
    expect(await db.ProcessingJob.count({ where: { userId: user.id, type: EXPLICIT_FEEDBACK_REFRESH_TYPE } })).toBe(1);
  });

  it('preserves promotion dislike scope from HTTP feedback through fast and durable refresh', async () => {
    const { user, source, candidate, values, post } = await fixture();
    await source.update({ title: 'Save €500 on a gaming laptop deal' });
    await candidate.update({ title: 'Another gaming laptop promotion' });
    const review = await db.Article.create({ ...values, title: 'Gaming laptop technical review', status: 'unread' });
    const unrelated = await db.Article.create({ ...values, title: 'Kernel debugging guide', articleVector: [0, 1], status: 'unread' });
    expect((await post('marknotinterested')).status).toBe(200);
    expect((await executeClaimedProcessingJob(await claimFast(user.id))).status).toBe('succeeded');
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(0);

    const assertScope = async matchType => {
      await Promise.all([candidate.reload(), review.reload(), unrelated.reload()]);
      expect(candidate.interestScore).toBeLessThan(0);
      expect(review.interestScore).toBeLessThan(0);
      expect(Math.abs(candidate.interestScore)).toBeGreaterThan(Math.abs(review.interestScore) * 10);
      expect(Number(unrelated.interestScore)).toBe(0);
      const { results } = await explainArticleInterests(user.id, [candidate, review]);
      expect(results.get(String(candidate.id)).paths[0]).toMatchObject({ matchType, intentCompatibility: 1 });
      expect(results.get(String(review.id)).paths[0]).toMatchObject({ matchType, intentCompatibility: 0.05 });
    };
    await assertScope('behavioral-fallback');
    const [durable] = await claimProcessingJobs({ userId: user.id, limit: 1, now: new Date(Date.now() + 3000) });
    expect(durable.type).toBe('personalization_refresh');
    expect((await executeClaimedProcessingJob(durable)).status).toBe('succeeded');
    expect(await db.Island.count({ where: { userId: user.id, weight: { [db.Sequelize.Op.lt]: 0 } } })).toBe(1);
    await assertScope('vector-fallback');
    expect(await db.Event.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.ProcessingJob.count({ where: { userId: user.id } })).toBe(2);
  });

  it('includes the source’s matching Island scope and preserves existing positive/negative aggregation', async () => {
    const { user, source, candidate, values } = await fixture();
    const island = await db.Island.create({ userId: user.id, label: 'Database systems', islandVector: [0.7, Math.sqrt(0.51)], weight: 0.8 });
    const islandCandidate = await db.Article.create({ ...values, status: 'unread', articleVector: [0, 1] });
    await updateArticleBehavior(source, { positiveInd: 1, positiveFeedbackAt: new Date() });
    await executeClaimedProcessingJob(await claimFast(user.id));
    await candidate.reload(); const positive = candidate.interestScore;
    await islandCandidate.reload(); expect(islandCandidate.interestScore).toBeGreaterThan(0);
    await updateArticleBehavior(source, { positiveInd: 0, negativeInd: 1, positiveFeedbackAt: null, negativeFeedbackAt: new Date() });
    await executeClaimedProcessingJob(await claimFast(user.id));
    await candidate.reload(); expect(candidate.interestScore).toBeLessThan(positive);
    await island.reload(); expect(island.weight).toBe(0.8);
  });

  it('continues beyond an unrelated batch without rescoring it', async () => {
    const { user, source, candidate, values } = await fixture();
    await candidate.update({ articleVector: [0, 1], interestScore: 0.123 });
    await db.Article.bulkCreate(Array.from({ length: 200 }, () => ({
      ...values, status: 'unread', articleVector: [0, 1], interestScore: 0.123
    })));
    const related = await db.Article.create({ ...values, status: 'unread' });
    await updateArticleBehavior(source, { positiveInd: 1, positiveFeedbackAt: new Date() });
    await executeClaimedProcessingJob(await claimFast(user.id));
    await related.reload(); expect(related.interestScore).toBeGreaterThan(0);
    const untouched = await db.Article.findAll({ where: { userId: user.id,
      id: { [db.Sequelize.Op.notIn]: [source.id, related.id] } }, attributes: ['interestScore'] });
    expect(untouched).toHaveLength(201);
    for (const article of untouched) expect(article.interestScore).toBeCloseTo(0.123);
  });

  it('does not broaden scope for missing vectors or an unowned source', async () => {
    const { user, source, candidate } = await fixture();
    const other = await fixture();
    const assertLease = async () => {};
    await handleExplicitFeedbackRefresh({ userId: other.user.id, articleId: source.id }, { assertLease });
    await source.update({ articleVector: null });
    await updateArticleBehavior(source, { positiveInd: 1, positiveFeedbackAt: new Date() });
    await executeClaimedProcessingJob(await claimFast(user.id));
    await candidate.reload(); expect(Number(candidate.interestScore)).toBe(0);
    await other.candidate.reload(); expect(Number(other.candidate.interestScore)).toBe(0);
  });
});
