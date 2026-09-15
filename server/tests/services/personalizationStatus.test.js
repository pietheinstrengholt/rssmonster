import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { describePersonalizationRefresh, loadPersonalizationStatus } from '../../services/jobs/personalizationStatus.js';
import { requestPersonalizationRefresh, completePersonalizationRefresh } from '../../services/jobs/personalizationRefresh.js';
import { claimProcessingJobs } from '../../services/jobs/processingJobQueue.js';
import { buildRecommendationPresentation } from '../../services/recommendations/recommendedScore.js';

afterEach(() => vi.useRealTimers());
const now = new Date('2026-09-15T12:00:00Z');

describe('personalization age and latency', () => {
  it('keeps untouched or legacy zero scores distinct from evaluated neutral scores', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    expect(buildRecommendationPresentation({ interestScore: 0 }).interestEvaluation).toEqual({ state: 'untracked', scoredAt: null, ageMs: null });
    expect(buildRecommendationPresentation({ interestScore: 0, interestScoredAt: new Date(now - 60000) }).interestEvaluation)
      .toMatchObject({ state: 'evaluated', ageMs: 60000 });
  });

  it('does not substitute reusable-job creation time for missing request timing', () => {
    expect(describePersonalizationRefresh({ id: 'legacy', status: 'pending', createdAt: new Date('2020-01-01'), payload: {} }, now))
      .toMatchObject({ state: 'pending', requestAgeMs: null, refreshAgeMs: null,
        lastCompletedLatency: { queueWaitMs: null, processingMs: null, requestToCompletionMs: null } });
  });

  it('preserves completed-run timing across follow-up, terminal reuse and failure with user isolation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    const user = await db.User.create({ username: `refresh-status-${randomUUID()}` });
    const foreign = await db.User.create({ username: `refresh-status-other-${randomUUID()}` });
    const request = () => db.sequelize.transaction(async transaction => {
      await db.User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
      return requestPersonalizationRefresh(user.id, { transaction, triggerReasons: ['favorite'] });
    });
    const job = await request();
    expect((await loadPersonalizationStatus(user.id, now)).durable.state).toBe('pending');
    vi.setSystemTime(new Date(now.getTime() + 3000));
    const [claimed] = await claimProcessingJobs({ userId: user.id, limit: 1, leaseOwner: 'diagnostics-worker' });
    vi.setSystemTime(new Date(now.getTime() + 4000));
    await request(); // New behavior while the claimed run is still in flight.
    expect((await loadPersonalizationStatus(user.id, new Date())).durable).toMatchObject({ state: 'running', requestAgeMs: 0 });
    vi.setSystemTime(new Date(now.getTime() + 5000));
    expect(await completePersonalizationRefresh(claimed, claimed.leaseOwner, { candidatesRescored: 7, interestScoresChanged: 2 })).toBe('pending');
    const pending = (await loadPersonalizationStatus(user.id, new Date())).durable;
    expect(pending).toMatchObject({ state: 'pending', requestAgeMs: 1000, refreshAgeMs: 0,
      lastCompletedLatency: { queueWaitMs: 3000, processingMs: 2000, requestToCompletionMs: 5000 },
      lastCompletedEvaluation: { candidatesRescored: 7, interestScoresChanged: 2 } });
    vi.setSystemTime(new Date(now.getTime() + 8000));
    const [followUp] = await claimProcessingJobs({ userId: user.id, limit: 1, leaseOwner: 'diagnostics-worker' });
    await completePersonalizationRefresh(followUp, followUp.leaseOwner, { candidatesRescored: 7, interestScoresChanged: 0 });
    expect((await loadPersonalizationStatus(user.id, new Date())).durable.state).toBe('completed');
    vi.setSystemTime(new Date(now.getTime() + 10000));
    await request();
    expect((await loadPersonalizationStatus(user.id, new Date())).durable).toMatchObject({ state: 'pending', refreshAgeMs: 2000 });
    await job.update({ status: 'dead', lastErrorCode: 'TEST_FAILURE' });
    expect((await loadPersonalizationStatus(user.id, new Date())).durable).toMatchObject({ state: 'failed', lastErrorCode: 'TEST_FAILURE', refreshAgeMs: 2000 });
    expect((await loadPersonalizationStatus(foreign.id, new Date())).durable.state).toBe('untracked');
  });
});
