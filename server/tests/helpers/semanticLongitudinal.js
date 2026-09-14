import db from '../../models/index.js';
import { explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';
import { collectIslandDiagnostics, collectTopicQuality, interestPathMetrics, recommendationCoverage } from './semanticRecommendationDiagnostics.js';

// All rows are loaded once per snapshot. No corpus-wide pairwise diagnostic comparisons.
export async function longitudinalSnapshot(userId, name, decisions = []) {
  const articles = await db.Article.findAll({ where: { userId }, include: [
    { model: db.Event, as: 'event', required: false }, { model: db.Feed, required: false }
  ], order: [['id', 'ASC']] });
  const { results } = await explainArticleInterests(userId, articles);
  const rows = articles.map(a => ({ id: a.id, url: a.url, title: a.title, eventId: a.eventId, topicId: a.topicId,
    status: a.status, duplicateOfArticleId: a.duplicateOfArticleId, favoriteInd: a.favoriteInd,
    negativeInd: a.negativeInd, clickedAmount: a.clickedAmount,
    interestScore: Number(a.interestScore || 0), recommended: computeRecommended(a),
    neutralRecommended: computeRecommended({ ...a.get({ plain: true }), interestScore: 0 }),
    corroboration: computeRecommendedBreakdown(a).corroboration,
    recommendedEligible: a.status !== 'duplicate' && !a.filteredInd,
    interestDiagnostics: results.get(String(a.id)) }));
  const [islands, topics, events] = await Promise.all([
    collectIslandDiagnostics(userId), collectTopicQuality(userId, decisions),
    db.Event.findAll({ where: { userId }, attributes: ['id', 'name', 'topicId', 'articleCount', 'sourceCount', 'eventWindowStartAt', 'eventWindowEndAt'], raw: true })
  ]);
  const links = await db.EventTopic.findAll({ where: { eventId: events.map(e => e.id) }, raw: true });
  const linksByEvent = new Map();
  for (const link of links) {
    if (!linksByEvent.has(link.eventId)) linksByEvent.set(link.eventId, []);
    linksByEvent.get(link.eventId).push({ topicId: link.topicId, confidence: link.confidence, primaryInd: link.primaryInd });
  }
  for (const row of rows) row.topicMemberships = linksByEvent.get(row.eventId) || [];
  if (!decisions.length) for (const key of Object.keys(topics).filter(k => k.startsWith('Topic decisions:'))) delete topics[key];
  const metrics = { phase: name, articles: rows.length, Events: events.length,
    'Events without primary Topic': events.filter(e => !e.topicId).length,
    Eventless: rows.filter(a => !a.eventId && a.status !== 'duplicate').length,
    duplicates: rows.filter(a => a.status === 'duplicate').length, ...topics,
    Islands: islands.activeIslands, 'Singleton Islands': islands.islands.filter(i => i.singleton).length,
    'Unassigned behavioral profiles': islands.unassignedBehavioralProfiles,
    ...recommendationCoverage(rows), ...interestPathMetrics(rows) };
  console.log('[LONGITUDINAL PHASE]', JSON.stringify(metrics));
  return { metrics, rows, events, islands };
}
