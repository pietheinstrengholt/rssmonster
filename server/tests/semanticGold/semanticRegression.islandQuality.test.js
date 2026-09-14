import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { persistIslandProfilesForUser } from '../../services/islands/runIslandCalibration.js';
import { scoreArticlesFromIslandsForUser } from '../../services/score/scoreArticlesFromIslands.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { collectIslandDiagnostics } from '../helpers/semanticRecommendationDiagnostics.js';

describe('semantic Island formation and neutral Recommended coverage', () => {
  it('preserves coherent evidence, leaves capped profiles out, and replays counters safely', async () => {
    const user = await db.User.create({ username: 'semantic-phase-a-islands' });
    const category = await db.Category.create({ userId: user.id, name: 'Regression' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Regression', url: 'https://phase-a.example.test/feed' });
    const articles = await db.Article.bulkCreate([
      { title: 'Local inference on home servers', articleVector: [1, 0, 0], favoriteInd: 1, clickedAmount: 1 },
      { title: 'Running local models at home', articleVector: [0.98, 0.02, 0], favoriteInd: 1, clickedAmount: 1 },
      { title: 'Photographing shore birds', articleVector: [0, 1, 0], clickedAmount: 1 },
      { title: 'Promotional power bank deal', articleVector: [0, 0, 1], negativeInd: 1 },
      { title: 'Municipal budget proceedings', articleVector: [1, 1, 1] }
    ].map((article, index) => ({ ...article, userId: user.id, feedId: feed.id,
      url: `https://phase-a.example.test/${index}`, status: 'unread', publishedAt: new Date() })));
    const capped = await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 });
    expect(capped).toHaveLength(1);
    expect(capped[0].articles.map(article => article.articleId).sort()).toEqual(articles.slice(0, 2).map(article => article.id).sort());
    expect(capped.summary.unassignedBehavioralProfiles).toBe(2);
    await persistIslandProfilesForUser(user.id, capped);
    await persistIslandProfilesForUser(user.id, await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 }));
    const replayed = await db.Island.findAll({ where: { userId: user.id }, raw: true });
    expect(replayed).toHaveLength(1);
    expect(replayed[0].positiveSignals.stars).toBe(2);
    // Cumulative click counts in a fresh full snapshot represent genuine new evidence.
    await articles[0].update({ clickedAmount: 2 });
    await persistIslandProfilesForUser(user.id, await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 }));
    const updated = await db.Island.findByPk(replayed[0].id);
    expect(updated.positiveSignals).toMatchObject({ stars: 2, clicks: 3 });

    const separate = await buildInterestIslandProfilesForUser(user.id, { maxIslands: 3 });
    expect(separate).toHaveLength(3);
    expect(separate.summary.unassignedBehavioralProfiles).toBe(0);
    await persistIslandProfilesForUser(user.id, separate);
    await scoreArticlesFromIslandsForUser(user.id);
    const stored = await db.Article.findAll({ where: { userId: user.id }, order: [['id', 'ASC']] });
    expect(stored[0].interestScore).toBeGreaterThan(0);
    expect(stored[3].interestScore).toBeLessThan(0);
    expect(stored[4].interestScore).toBe(0);
    expect(computeRecommended(stored[3])).toBeLessThan(computeRecommended({ ...stored[3].get({ plain: true }), interestScore: 0 }));
    for (const article of stored) {
      expect(article.topicId).toBeNull();
      expect(article.eventId).toBeNull();
      expect(Number.isFinite(computeRecommended(article))).toBe(true);
    }
    const diagnostics = await collectIslandDiagnostics(user.id);
    expect(diagnostics.islands.filter(island => island.singleton)).toHaveLength(2);
    expect(diagnostics.islands.some(island => island.lowCohesion)).toBe(false);
  }, 60000);
});
