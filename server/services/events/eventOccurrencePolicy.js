import {
  EVENT_SIM_THRESHOLD, EVENT_MAX_GAP_HOURS, EVENT_RECENCY_HALF_LIFE_HOURS,
  EVENT_MIN_HEADLINE_SIM, EVENT_MIN_SHARED_ENTITY_OVERLAP, EVENT_MIN_WINNER_MARGIN
} from '../config/semanticConfig.js';
import {
  HOUR_MS, articleEventTimestamp, eventTimestamp, eventWindowScore
} from './articleEventTime.js';
import {
  extractOccurrenceFeatures, aggregateOccurrenceFeatures, compareOccurrenceFeatures
} from './occurrenceFeatures.js';

export const MAX_OCCURRENCE_MEMBERS = 16;

const DUPLICATE_HEADLINE_SIM = 0.92;
const DUPLICATE_HEADLINE_MIN_SEMANTIC = 0.75;

// Defines the stopwords enforced by this service.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'from', 'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with'
]);

// This function normalizes a headline into lowercase searchable tokens.
function normalizeHeadline(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function builds a meaningful token set while removing small words and stopwords.
export function tokenSet(text = '') {
  // Maps source values into the result produced while performing token set.
  return new Set(
    normalizeHeadline(text)
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 2 && !STOPWORDS.has(token))
  );
}

// This function returns a precomputed token set when the candidate cache already has one.
function resolveTokenSet(record = {}) {
  // Selects the result based on whether record is available.
  return record.tokenSet instanceof Set
    ? record.tokenSet
    : tokenSet(record.title || '');
}

// This function estimates lexical overlap between two precomputed headline token sets.
function headlineSimilarityFromSets(a = new Set(), b = new Set()) {
  // Returns early when a size is unavailable or b size is unavailable.
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  // Processes each a entry in turn.
  for (const token of a) {
    // Handles the case where b contains token.
    if (b.has(token)) intersection++;
  }

  // Derives the union required while performing headline similarity from sets.
  const union = a.size + b.size - intersection;
  // Returns early when union is unavailable.
  if (!union) return 0;

  return intersection / union;
}

// This function extracts lightweight entity hints from title and description text.
export function extractEntitySet(article = {}) {
  // Derives the text required while extracting entity set.
  const text = `${article.title || ''} ${article.description || ''}`;
  // Collects matches for the selection made while extracting entity set.
  const matches = text.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || [];
  // Maps source values into the result produced while extracting entity set.
  return new Set(matches.map(value => value.toLowerCase()));
}

// This function counts shared entity hints between two extracted entity sets.
function entityOverlapCount(a = new Set(), b = new Set()) {
  // Returns early when a size is unavailable or b size is unavailable.
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  // Processes each a entry in turn.
  for (const value of a) {
    // Handles the case where b contains value.
    if (b.has(value)) overlap++;
  }
  return overlap;
}

// This function returns a precomputed entity set when the candidate cache already has one.
function resolveEntitySet(record = {}) {
  // Selects the result based on whether record is available.
  return record.entitySet instanceof Set
    ? record.entitySet
    : extractEntitySet(record);
}

// This function gradually discounts older events during candidate matching.
function recencyDecayMultiplier(lastSeenAt, now = Date.now()) {
  // Derives the last seen ts through event timestamp while performing recency decay multiplier.
  const lastSeenTs = eventTimestamp(lastSeenAt);
  // Returns early when last seen ts is not finite.
  if (!Number.isFinite(lastSeenTs)) return 0.2;

  // Derives the age hours through max while performing recency decay multiplier.
  const ageHours = Math.max(0, (now - lastSeenTs) / HOUR_MS);
  // Derives the half life through max while performing recency decay multiplier.
  const halfLife = Math.max(EVENT_RECENCY_HALF_LIFE_HOURS, 1);
  return Math.pow(0.5, ageHours / halfLife);
}

// This function compares two embedding vectors with cosine similarity.
function cosineSimilarity(a, b) {
  // Returns early when a is not an array or b is not an array.
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  // Returns early when a is empty or b is empty.
  if (!a.length || !b.length) return 0;
  // Returns early when a count is not b count.
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  // Repeats this processing step while eligible work remains.
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // Returns early when norm a is unavailable or norm b is unavailable.
  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// This function compares normalized vectors with a fast dot product.
function dotProductSimilarity(a, b) {
  // Returns early when a is not an array or b is not an array.
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  // Returns early when a is empty or b is empty.
  if (!a.length || !b.length) return 0;
  // Returns early when a count is not b count.
  if (a.length !== b.length) return 0;

  let dot = 0;
  // Repeats this processing step while eligible work remains.
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  return dot;
}

// This function normalizes the incoming vector once when a cache lookup can reuse it.
export function normalizeVector(vector) {
  // Returns no result when vector is not an array or vector is empty.
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  // Processes each vector entry in turn.
  for (const value of vector) {
    norm += value * value;
  }

  // Returns no result when norm is unavailable.
  if (!norm) return null;

  // Derives the divisor through sqrt while normalizing vector.
  const divisor = Math.sqrt(norm);
  // Maps source values into the result produced while normalizing vector.
  return vector.map(value => value / divisor);
}

// The same witness must supply semantic and lexical/entity support. Member count
// never increases a score, and discovery source is diagnostic only.
function signalEligibility(signal) {
  const meetsSemantic = signal.semantic >= EVENT_SIM_THRESHOLD;
  const nearDuplicate = signal.headline >= DUPLICATE_HEADLINE_SIM &&
    signal.semantic >= DUPLICATE_HEADLINE_MIN_SEMANTIC;
  const meetsAuxiliary = signal.headline >= EVENT_MIN_HEADLINE_SIM ||
    signal.overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ||
    signal.semantic >= Math.max(EVENT_SIM_THRESHOLD, DUPLICATE_HEADLINE_SIM);
  return {
    meetsSemantic, nearDuplicate, meetsAuxiliary,
    supported: (meetsSemantic && meetsAuxiliary) || nearDuplicate
  };
}

function witnessSignal(article, target, vector, normalizedArticleVector) {
  return {
    semantic: normalizedArticleVector && target.normalizedEventVector
      ? dotProductSimilarity(normalizedArticleVector, target.normalizedEventVector)
      : cosineSimilarity(vector, target.eventVector ?? target.articleVector),
    headline: headlineSimilarityFromSets(resolveTokenSet(article), resolveTokenSet(target)),
    overlap: entityOverlapCount(resolveEntitySet(article), resolveEntitySet(target))
  };
}

export function buildEventEvidence(article, event, {
  articleEventVector = article.eventVector ?? article.articleVector,
  normalizedArticleEventVector = null,
  memberSignals = [],
  eventOccurrenceFeatures = null,
  compareOccurrence = true,
  candidateSources = [],
  now = Date.now()
} = {}) {
  const centroid = witnessSignal(article, {
    title: event.name || '',
    description: event.description || '',
    eventVector: event.eventVector,
    normalizedEventVector: event.normalizedEventVector
  }, articleEventVector, normalizedArticleEventVector);
  const temporal = eventWindowScore(article, event);
  const times = [
    articleEventTimestamp(article),
    eventTimestamp(event.eventWindowStartAt ?? event.eventWindowEndAt ?? event.updatedAt),
    eventTimestamp(event.eventWindowEndAt ?? event.eventWindowStartAt ?? event.updatedAt)
  ];
  const spanHours = times.every(Number.isFinite)
    ? (Math.max(...times) - Math.min(...times)) / HOUR_MS
    : null;
  const recency = recencyDecayMultiplier(event.eventWindowEndAt || event.updatedAt, now);
  const scoreWitness = signal => {
    const eligibility = signalEligibility(signal);
    const baseScore = signal.semantic * 0.75 + signal.headline * 0.15 + temporal * 0.1;
    const entityBonus = signal.overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ? 0.03 : 0;
    return {
      ...signal, ...eligibility,
      evidenceScore: baseScore + entityBonus,
      score: baseScore * recency + entityBonus
    };
  };
  const witnesses = [centroid, ...memberSignals.filter(signal => signal.accepted)]
    .map(scoreWitness);
  const supported = witnesses.filter(signal => signal.supported);
  const strongest = (supported.length ? supported : witnesses)
    .sort((left, right) => right.score - left.score || right.evidenceScore - left.evidenceScore)[0];
  const members = [...new Map(memberSignals.filter(signal => signal.occurrenceFeatures)
    .map(signal => [signal.candidateId, signal])).values()]
    .sort((left, right) => Number(left.candidateId) - Number(right.candidateId))
    .slice(0, MAX_OCCURRENCE_MEMBERS);
  const occurrence = compareOccurrence ? compareOccurrenceFeatures(
    extractOccurrenceFeatures(article),
    eventOccurrenceFeatures || (members.length || event.articleCount >= 2
      ? aggregateOccurrenceFeatures(members.map(member => member.occurrenceFeatures), {
        minimumSupport: event.articleCount >= 2 ? 2 : 1
      })
      : extractOccurrenceFeatures(event))
  ) : {};
  // Soft differences only rank otherwise eligible occurrences. They cannot replace
  // semantic support; explicit identity contradictions are checked below.
  const penalty = (occurrence.actionConflict ? 0.02 : 0) + (occurrence.objectConflict ? 0.02 : 0);
  return {
    ...strongest, ...occurrence,
    score: strongest.score - penalty * recency,
    evidenceScore: strongest.evidenceScore - penalty,
    centroidSemantic: centroid.semantic, temporal, spanHours, recency,
    memberSupport: Math.max(0, ...memberSignals.filter(signal => signal.accepted).map(signal => signal.semantic)),
    candidateSources
  };
}

export function evaluateArticleAgainstEvent(article, event, evidenceOptions = {}) {
  const evidence = buildEventEvidence(article, event, evidenceOptions);
  const reasons = [];
  if (event.userId != null && Number(article.userId) !== Number(event.userId)) reasons.push('ownership_mismatch');
  if (article.filteredInd || article.duplicateOfArticleId != null || article.status === 'duplicate') {
    reasons.push('noncanonical_article');
  }
  if (!(evidence.temporal > 0)) {
    reasons.push(evidence.spanHours != null && evidence.spanHours >= EVENT_MAX_GAP_HOURS
      ? 'event_span_exceeded' : 'invalid_event_time');
  }
  if (!evidence.meetsSemantic && !evidence.nearDuplicate) reasons.push('insufficient_semantic_match');
  if (!evidence.meetsAuxiliary && !evidence.nearDuplicate) reasons.push('insufficient_support');
  if (evidence.versionConflict) reasons.push('version_conflict');
  if (evidence.locationConflict) reasons.push('location_conflict');
  if (evidence.strongActionConflict) reasons.push('action_conflict', 'object_conflict');
  const eligible = reasons.length === 0;
  if (eligible) {
    if (evidence.meetsSemantic) reasons.push('semantic_match');
    if (evidence.headline >= EVENT_MIN_HEADLINE_SIM) reasons.push('headline_overlap');
    if (evidence.overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP) reasons.push('shared_entities');
    if (evidence.nearDuplicate) reasons.push('near_identical_headline');
    if (evidence.semantic >= Math.max(EVENT_SIM_THRESHOLD, DUPLICATE_HEADLINE_SIM)) reasons.push('strong_semantic_support');
    reasons.push('temporal_match');
    for (const feature of ['version', 'location', 'action', 'object']) {
      if (evidence[`${feature}Agreement`]) reasons.push(`${feature}_match`);
      if (evidence[`${feature}Conflict`]) reasons.push(`${feature}_conflict`);
    }
  }
  return {
    eligible, score: evidence.score, evidenceScore: evidence.evidenceScore,
    decision: eligible ? 'join' : 'reject', reasons, evidence
  };
}

// Pair matching discovers candidates; it does not authorize joining their Event.
export function evaluateCandidateSignal({ article, candidate, articleEventVector, normalizedArticleEventVector = null, enforceOccurrence = false }) {
  const at = articleEventTimestamp(candidate);
  const result = evaluateArticleAgainstEvent(article, {
    userId: candidate.userId,
    name: candidate.title,
    description: candidate.description,
    eventVector: candidate.eventVector ?? candidate.articleVector,
    normalizedEventVector: candidate.normalizedEventVector,
    eventWindowStartAt: at == null ? null : new Date(at),
    eventWindowEndAt: at == null ? null : new Date(at)
  }, {
    articleEventVector, normalizedArticleEventVector,
    compareOccurrence: enforceOccurrence,
    eventOccurrenceFeatures: extractOccurrenceFeatures(candidate)
  });
  const canonical = !candidate.filteredInd && candidate.duplicateOfArticleId == null && candidate.status !== 'duplicate';
  return {
    ...result.evidence,
    candidateId: candidate.id, eventId: candidate.eventId ?? null,
    occurrenceFeatures: canonical ? extractOccurrenceFeatures(candidate) : null,
    accepted: canonical && result.eligible, meetsTemporal: result.evidence.temporal > 0,
    reasons: canonical ? result.reasons : ['noncanonical_article']
  };
}

// Recency still ranks eligible Events. A winner must also beat every alternative
// on undecayed evidence, so age alone cannot resolve an uncertain occurrence.
export function selectEventDecision(candidates, minimumMargin = EVENT_MIN_WINNER_MARGIN) {
  const qualified = candidates.filter(candidate => candidate.eligible)
    .sort((left, right) => right.score - left.score || Number(left.event.id) - Number(right.event.id));
  if (!qualified.length) return { decision: 'reject', reasons: ['no_qualifying_event'], candidate: null };
  const winner = qualified[0];
  const runnerUpEvidence = Math.max(...qualified.slice(1).map(candidate => candidate.evidenceScore));
  const margin = winner.evidenceScore - runnerUpEvidence;
  if (qualified.length > 1 && (margin <= 0 || margin < minimumMargin)) {
    return { decision: 'ambiguous', reasons: ['ambiguous_candidates'], candidate: null, margin };
  }
  return { decision: 'join', reasons: winner.reasons, candidate: winner, margin: qualified.length > 1 ? margin : null };
}

// Validate the entire proposal without letting an Article corroborate itself.
// A leave-one-out centroid and one stable member witness keep this O(n * dimensions).
export function evaluateEventCreation(articles, event) {
  if (articles.length < 2) return { decision: 'reject', reasons: ['insufficient_support'] };
  const dimension = event.eventVector?.length;
  if (!dimension || articles.some(article => !Array.isArray(article.articleVector) ||
      article.articleVector.length !== dimension || !article.articleVector.every(Number.isFinite))) {
    return { decision: 'reject', reasons: ['insufficient_semantic_match'] };
  }
  const prepared = articles.map(article => ({
    ...(article.get?.({ plain: true }) || article),
    tokenSet: resolveTokenSet(article), entitySet: resolveEntitySet(article)
  })).sort((left, right) => Number(left.id) - Number(right.id));
  const now = Date.now();
  for (const article of prepared) {
    const witness = prepared[0].id === article.id ? prepared[1] : prepared[0];
    const vector = article.articleVector;
    const normalizedArticleEventVector = normalizeVector(vector);
    const withoutArticle = event.eventVector.map((mean, index) =>
      (mean * prepared.length - vector[index]) / (prepared.length - 1));
    const memberSignal = evaluateCandidateSignal({ article, candidate: witness, articleEventVector: vector, normalizedArticleEventVector });
    const result = evaluateArticleAgainstEvent(article, {
      ...event, eventVector: withoutArticle
    }, {
      memberSignals: [memberSignal], normalizedArticleEventVector, now,
      eventOccurrenceFeatures: aggregateOccurrenceFeatures(prepared.slice(0, MAX_OCCURRENCE_MEMBERS + 1)
        .filter(member => member.id !== article.id).slice(0, MAX_OCCURRENCE_MEMBERS)
        .map(extractOccurrenceFeatures))
    });
    if (!result.eligible) return result;
  }
  return { decision: 'join', reasons: ['compatible_seed_group'] };
}
