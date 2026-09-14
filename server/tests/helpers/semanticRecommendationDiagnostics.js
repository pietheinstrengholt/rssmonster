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
    'Direct Island matches': has('vector-fallback'),
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
