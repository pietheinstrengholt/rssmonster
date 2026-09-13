import { compareTopicSubjects, topicSubject } from '../shared/topicSubjectEvidence.js';
import { TOPIC_IDENTITY_THRESHOLD, MAX_TOPICS_PER_ARTICLE } from '../../config/semanticConfig.js';

export const TOPIC_WINNER_MARGIN = 0.04;
export function evaluateTopicCandidates({ semanticUnit, candidates, subjects, primaryThreshold, secondaryThreshold }) {
  const ranked = candidates.map(({ topic, sim }) => {
    const anchor = subjects.get(Number(topic.id)) || {};
    const subject = compareTopicSubjects(semanticUnit.title || semanticUnit.name, anchor.title);
    const selfAnchor = Number(semanticUnit.id) === anchor.anchorEventId;
    if (selfAnchor) subject.durableMatch = true;
    const primaryPass = sim >= primaryThreshold;
    const secondaryPass = sim >= secondaryThreshold;
    const identityFallback = !secondaryPass && sim >= TOPIC_IDENTITY_THRESHOLD && subject.durableMatch;
    const reasons = [];
    if (subject.durableMatch) reasons.push(selfAnchor ? 'existing_event_membership' : 'durable_entity_match');
    else reasons.push(subject.incidentLocationConflict ? 'different_incident_subject' : 'insufficient_subject_identity');
    if (!subject.durableMatch && sim >= TOPIC_IDENTITY_THRESHOLD) reasons.push('weak_generic_similarity');
    if (primaryPass) reasons.push('semantic_primary_match');
    else if (secondaryPass) reasons.push('semantic_secondary_match');
    return { topic, sim, ...subject, primaryPass, secondaryPass, identityFallback, memberEventCount: anchor.memberEventCount || 0,
      eligible: subject.durableMatch && (secondaryPass || identityFallback), reasons, relationshipType: 'rejected', confidence: 0 };
  }).sort((a, b) => b.sim - a.sim || a.topic.id - b.topic.id);
  const eligible = ranked.filter(c => c.eligible);
  const contenders = eligible.length ? eligible : ranked.filter(c => c.secondaryPass);
  const margin = contenders.length > 1 ? contenders[0].sim - contenders[1].sim : null;
  const ambiguous = contenders.length > 1 && margin < TOPIC_WINNER_MARGIN
    && (eligible.length > 1 || !topicSubject(semanticUnit.title || semanticUnit.name).entities.length);
  // Persistence keeps ordinary relationships when present, otherwise only the best weak fallback.
  const assignable = eligible.some(c => c.secondaryPass) ? eligible.filter(c => c.secondaryPass) : eligible.slice(0, 1);
  const selected = ambiguous ? [] : assignable.slice(0, MAX_TOPICS_PER_ARTICLE);
  selected.forEach((c, index) => {
    c.relationshipType = index === 0 && c.primaryPass ? 'primary' : 'secondary';
    c.confidence = Number((c.sim * (c.identityFallback ? 0.5 : 1)).toFixed(4));
    if (c.identityFallback) c.reasons.push('identity_fallback');
  });
  ranked.forEach((c, index) => { c.rank = index + 1; if (ambiguous && contenders.includes(c)) { c.relationshipType = 'ambiguous'; c.reasons.push('ambiguous_topic_candidates'); } });
  return { ranked, selected, margin, ambiguous };
}

export function topicDecisionDiagnostic(semanticUnit, decision, outcome) {
  return { eventId: semanticUnit.id, eventName: semanticUnit.title || semanticUnit.name, outcome,
    winnerMargin: decision.margin, candidates: decision.ranked.filter((c, index) => index < 8 || c.relationshipType !== 'rejected').map(c => ({
      topicId: c.topic.id, topicName: c.topic.name, semanticSimilarity: c.sim, primaryThresholdResult: c.primaryPass,
      secondaryThresholdResult: c.secondaryPass, identityFallback: c.identityFallback && c.confidence > 0, entityOverlap: c.entityOverlap,
      memberEventCount: c.memberEventCount, rank: c.rank, relationshipType: c.relationshipType,
      confidence: c.confidence, reasons: c.reasons
    })), omittedCandidates: decision.ranked.filter((c, index) => index >= 8 && c.relationshipType === 'rejected').length };
}
