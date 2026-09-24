import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { searchArticles } from '../../services/articleSearch/articleSearch.service.js';

async function fixture() {
  const user = await db.User.create({ username: `search-funnel-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Funnel' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Funnel', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'Article', status: 'unread', publishedAt: new Date(), interestScoredAt: new Date() };
  const [neutral, positive, negative, representative, member] = await db.Article.bulkCreate([
    values, { ...values, interestScore: 0.5 }, { ...values, interestScore: -0.2 }, values, values
  ]);
  await db.Article.create({ ...values, filteredInd: true });
  const event = await db.Event.create({ userId: user.id, name: 'Event', articleCount: 2, sourceCount: 1, representativeArticleId: representative.id });
  await db.Article.update({ eventId: event.id }, { where: { id: [representative.id, member.id] } });
  await db.BriefingPreference.create({ userId: user.id, selectionPeriod: '24h', includeOnlyUnreadArticles: false });
  return { user, neutral, positive, negative, representative, member };
}
const stage = (result, name) => [...result.diagnostics.databaseStages, ...result.diagnostics.runtimeStages].find(row => row.stage === name);
const options = userId => ({ userId, sort: 'recommended', status: '%', minAdvertisementScore: 0, minSentimentScore: 0, minQualityScore: 0 });

describe('Recommended and Briefing funnels', () => {
  beforeEach(() => {
    // Keep freshness scores identical across queries and tied articles.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('separates Briefing eligibility and grouping from scoring without changing selected IDs', async () => {
    const { user, neutral, positive, negative, representative } = await fixture();
    await fixture(); // Foreign articles never enter any stage count.
    const plain = await searchArticles(options(user.id));
    const recommended = await searchArticles({ ...options(user.id), includeDiagnostics: true });
    expect(recommended.itemIds).toEqual(plain.itemIds);
    expect(plain.diagnostics).toBeUndefined();
    expect(stage(recommended, 'owned_articles').articles).toBe(6);
    expect(stage(recommended, 'canonical_source_scope')).toMatchObject({ articles: 5, excludedFromPrevious: 1, recordedEvaluationsExcluded: 1 });
    expect(stage(recommended, 'recommended_scored')).toMatchObject({ articles: 5, finiteRecommended: 5 });

    const briefing = await searchArticles({ ...options(user.id), status: 'briefing', includeDiagnostics: true });
    expect(briefing.diagnostics).toMatchObject({ view: 'briefing', sort: 'recommended' });
    expect(stage(briefing, 'briefing_eligibility')).toMatchObject({ articles: 4, excludedFromPrevious: 1 });
    expect(stage(briefing, 'event_grouping')).toMatchObject({ articles: 3, excludedFromPrevious: 1 });
    expect(stage(briefing, 'recommended_scored')).toMatchObject({ articles: 3, finiteRecommended: 3 });
    expect(new Set(briefing.itemIds)).toEqual(new Set([positive.id, negative.id, representative.id]));
    expect(briefing.itemIds).not.toContain(neutral.id);
  });

  it('explains result limits separately from candidate ceilings and keeps negative interest eligible', async () => {
    const { user, negative } = await fixture();
    await db.BriefingPreference.update({ showOnlyInterestMatchedArticles: true }, { where: { userId: user.id } });
    const briefing = await searchArticles({ ...options(user.id), status: 'briefing', includeDiagnostics: true });
    expect(briefing.itemIds).toContain(negative.id);
    expect(stage(briefing, 'briefing_eligibility').articles).toBe(2);
    const limited = await searchArticles({ ...options(user.id), search: 'limit:1', includeDiagnostics: true });
    expect(stage(limited, 'result_limit')).toMatchObject({ articles: 1, excludedFromPrevious: 4 });
    expect(stage(limited, 'result_limit').excludedArticleIdSample).toHaveLength(4);
    const bounded = await searchArticles({ ...options(user.id), includeDiagnostics: true, executionBounds: { maxCandidates: 2, maxResults: 1 } });
    expect(stage(bounded, 'candidate_execution_limit')).toMatchObject({ articles: 2, excludedFromPrevious: 3 });
    expect(stage(bounded, 'result_limit')).toMatchObject({ articles: 1, excludedFromPrevious: 1 });
    const freshness = await searchArticles({ ...options(user.id), search: 'freshness:>1', includeDiagnostics: true });
    expect(stage(freshness, 'freshness_filter')).toMatchObject({ articles: 0, excludedFromPrevious: 5 });
    expect(stage(freshness, 'recommended_scored').finiteRecommended).toBe(0);
  });
});
