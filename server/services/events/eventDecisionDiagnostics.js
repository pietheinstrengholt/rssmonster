import { channel } from 'node:diagnostics_channel';
import { EVENT_MAX_GAP_HOURS } from '../config/semanticConfig.js';

export const eventDiagnosticChannel = channel('rssmonster.events.decisions');
export function eventDiagnosticsEnabled(env = process.env) {
  return eventDiagnosticChannel.hasSubscribers ||
    ['EVENT_DEBUG', 'EVENT_RECLUSTER_DEBUG'].some(key => /^(1|true|yes)$/i.test(env[key] || '')) ||
    ['trace', 'report'].includes(env.SEMANTIC_REPORT_LEVEL);
}

// Only copy scalar evidence: never serialize ORM records, descriptions or vectors.
export function candidateDiagnostic(result, selection = null) {
  const evidence = result.evidence;
  const reasons = new Set(result.reasons);
  if (evidence.meetsSemantic) reasons.add('semantic_match');
  if (evidence.temporal > 0) reasons.add('temporal_match');
  const features = {};
  for (const feature of ['version', 'location', 'action', 'object']) {
    features[`${feature}Match`] = Boolean(evidence[`${feature}Agreement`]);
    features[`${feature}Conflict`] = Boolean(evidence[`${feature}Conflict`]);
    if (features[`${feature}Match`]) reasons.add(`${feature}_match`);
    if (features[`${feature}Conflict`]) reasons.add(`${feature}_conflict`);
  }
  const ambiguous = result.eligible && selection?.decision === 'ambiguous';
  const notSelected = result.eligible && selection?.candidate && selection.candidate !== result;
  if (ambiguous) reasons.add('ambiguous_candidates');
  if (notSelected) reasons.add('lower_ranked_candidate');
  return {
    eventId: result.event?.id ?? null,
    eventName: String(result.event?.name || '').replace(/[\r\n\t]/g, ' ').slice(0, 160),
    similarity: evidence.semantic, headlineSimilarity: evidence.headline,
    temporalCompatibility: evidence.temporal > 0, temporalScore: evidence.temporal,
    eventSpanCompatibility: evidence.spanHours != null && evidence.spanHours < EVENT_MAX_GAP_HOURS,
    spanHours: evidence.spanHours, sharedEntities: evidence.overlap,
    ...features, score: result.score, evidenceScore: result.evidenceScore,
    eligible: result.eligible, accepted: result.eligible,
    decision: ambiguous ? 'ambiguous' : notSelected ? 'reject' : result.decision,
    reasons: [...reasons]
  };
}

export function emitEventDiagnostic(article, stage, details) {
  if (!eventDiagnosticsEnabled()) return;
  const payload = {
    articleId: article.id, userId: article.userId,
    articleTitle: String(article.title || '').replace(/[\r\n\t]/g, ' ').slice(0, 160),
    stage, ...details
  };
  eventDiagnosticChannel.publish(payload);
  if (['trace', 'report'].includes(process.env.SEMANTIC_REPORT_LEVEL) ||
      /^(1|true|yes)$/i.test(process.env.EVENT_DEBUG || process.env.EVENT_RECLUSTER_DEBUG || '')) {
    console.log(`[EVENT TRACE] ${JSON.stringify(payload)}`);
  }
}
