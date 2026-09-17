import { articleRecords } from '../../services/articles/articleRecords.js';
import db from '../../models/index.js';
import { explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';
import { collectIslandDiagnostics, interestPathMetrics, recommendationCoverage } from './semanticRecommendationDiagnostics.js';

// All rows are loaded once per snapshot. No corpus-wide pairwise diagnostic comparisons.
export async function longitudinalSnapshot(userId, name) {
  const articles = await articleRecords.findAll({ where: { userId }, include: [
    { model: db.Event, as: 'event', required: false }, { model: db.Feed, required: false }
  ], order: [['id', 'ASC']] });
  const { results } = await explainArticleInterests(userId, articles);
  const rows = articles.map(a => ({ id: a.id, url: a.url, title: a.title, eventId: a.eventId,
    status: a.status, duplicateOfArticleId: a.duplicateOfArticleId, favoriteInd: a.favoriteInd,
    negativeInd: a.negativeInd, clickedAmount: a.clickedAmount,
    interestScore: Number(a.interestScore || 0), recommended: computeRecommended(a),
    neutralRecommended: computeRecommended({ ...a.get({ plain: true }), interestScore: 0 }),
    corroboration: computeRecommendedBreakdown(a).corroboration,
    recommendedEligible: a.status !== 'duplicate' && !a.filteredInd,
    interestDiagnostics: results.get(String(a.id)) }));
  const [islands, events] = await Promise.all([
    collectIslandDiagnostics(userId),
    db.Event.findAll({ where: { userId }, attributes: ['id', 'name', 'articleCount', 'sourceCount', 'eventWindowStartAt', 'eventWindowEndAt'], raw: true })
  ]);
  const metrics = { phase: name, articles: rows.length, Events: events.length,
    Eventless: rows.filter(a => !a.eventId && a.status !== 'duplicate').length,
    duplicates: rows.filter(a => a.status === 'duplicate').length,
    Islands: islands.activeIslands, 'Singleton Islands': islands.islands.filter(i => i.singleton).length,
    'Unassigned behavioral profiles': islands.unassignedBehavioralProfiles,
    ...recommendationCoverage(rows), ...interestPathMetrics(rows) };
  console.log('[LONGITUDINAL PHASE]', JSON.stringify(metrics));
  return { metrics, rows, events, islands };
}
