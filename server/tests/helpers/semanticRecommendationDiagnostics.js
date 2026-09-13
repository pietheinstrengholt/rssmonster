import db from '../../models/index.js';
import { loadIslandEvidence } from '../../services/islands/islandInterestConfidence.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
export { islandCohesion } from '../../services/islands/islandInterestConfidence.js';

export function recommendationCoverage(rows) {
  const eligible = rows.filter(row => row.recommendedEligible !== false);
  const scored = eligible.filter(row => Number.isFinite(row.recommended));
  return {
    'Articles eligible for Recommended': eligible.length,
    'Articles with Recommended score': scored.length,
    'Recommended coverage (%)': eligible.length ? 100 * scored.length / eligible.length : 0,
    'Articles with non-zero interest': eligible.filter(row => Number(row.interestScore ?? 0) !== 0).length,
    'Articles with neutral interest': eligible.filter(row => Number(row.interestScore ?? 0) === 0).length,
    'Articles with negative interest': eligible.filter(row => Number(row.interestScore ?? 0) < 0).length
  };
}

export async function collectIslandDiagnostics(userId) {
  const [context, profiles] = await Promise.all([loadIslandEvidence(userId), buildInterestIslandProfilesForUser(userId)]);
  return { activeIslands: context.islands.length, unassignedBehavioralProfiles: profiles.summary.unassignedBehavioralProfiles,
    islands: context.islands.map(i => ({ islandId: i.id, label: i.label, preferenceStrength: i.preferenceStrength,
      islandConfidence: i.islandConfidence, basis: 'current bounded behavioral support; publication days are a proxy', ...i.diagnostics })) };
}

export function interestPathMetrics(rows) {
  const matched = rows.filter(r => r.interestScore !== 0);
  const has = type => matched.filter(r => r.interestDiagnostics?.paths.some(p => p.matchType === type)).length;
  const held = rows.filter(r => r.interestDiagnostics && !r.interestDiagnostics.seedSelf);
  return {
    'Positive-interest articles': rows.filter(r => r.interestScore > 0).length,
    'Topic-based matches': has('topic-island'), 'Direct Island matches': has('vector-fallback'),
    'Behavioral fallback matches': has('behavioral-fallback'),
    'Singleton-derived matches': matched.filter(r => r.interestDiagnostics?.paths.some(p => p.singleton)).length,
    'Seed/self matches': matched.filter(r => r.interestDiagnostics?.seedSelf).length,
    'Held-out positive matches': held.filter(r => r.interestScore > 0).length,
    'Held-out negative matches': held.filter(r => r.interestScore < 0).length,
    'Neutral held-out articles': held.filter(r => r.interestScore === 0).length,
    'Same-intent fallback paths': rows.flatMap(r => r.interestDiagnostics?.paths || []).filter(p => p.intentMatchType === 'same-intent').length,
    'Cross-intent attenuated paths': rows.flatMap(r => r.interestDiagnostics?.paths || []).filter(p => p.intentMatchType === 'cross-intent-attenuated').length,
    'Missing-intent fallback paths': rows.flatMap(r => r.interestDiagnostics?.paths || []).filter(p => p.intentMatchType === 'missing-intent').length,
    'Maximum path contribution': Math.max(0, ...rows.flatMap(r => (r.interestDiagnostics?.paths || []).map(p => p.contribution))),
    'Minimum path contribution': Math.min(0, ...rows.flatMap(r => (r.interestDiagnostics?.paths || []).map(p => p.contribution))),
    'Maximum interest': Math.max(0, ...rows.map(r => r.interestScore)),
    'Minimum interest': Math.min(0, ...rows.map(r => r.interestScore))
  };
}

export async function collectTopicQuality(userId, decisions = []) {
  const [topics, events] = await Promise.all([
    db.Topic.findAll({ where: { userId }, attributes: ['id'], raw: true }),
    db.Event.findAll({ where: { userId }, attributes: ['id'], raw: true })
  ]);
  const links = events.length ? await db.EventTopic.findAll({ where: { eventId: events.map(e => e.id) }, raw: true }) : [];
  const latest = [...new Map(decisions.map(d => [d.eventId, d])).values()];
  return { Topics: topics.length, 'Events linked to Topics': new Set(links.map(l => l.eventId)).size,
    'Single-Event Topics': topics.filter(t => new Set(links.filter(l => l.topicId === t.id).map(l => l.eventId)).size === 1).length,
    'Unassigned Event→Topic cases': events.filter(e => !links.some(l => l.eventId === e.id)).length,
    ...Object.fromEntries(['strong-reuse', 'secondary-reuse', 'weak-fallback-reuse', 'new-topic', 'ambiguous', 'unassigned']
      .map(outcome => [`Topic decisions: ${outcome}`, latest.filter(d => d.outcome === outcome).length])) };
}
