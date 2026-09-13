import { emitTopicDecision } from './topicDecisionDiagnostics.js';
import { loadTopicSubjectEvidence } from '../shared/topicSubjectEvidence.js';
import { evaluateTopicCandidates, topicDecisionDiagnostic } from './topicDecisionPolicy.js';
import db from '../../../models/index.js';
import {
  MAX_CANDIDATES,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD
} from '../../config/semanticConfig.js';
import {
  cosineSimilarity,
  generateTopicKey
} from '../shared/topicHelpers.js';
import { debugSemanticLog } from '../../observability/semanticLogging.js';
import {
  updateMatchedTopics,
  updateIdentityTopic
} from './updateTopic.js';
import { createTopic } from './createTopics.js';

// Provides the shared dependencies used by this service.
const { Topic } = db;

// This service assigns event-shaped semantic units to event or hybrid topics.
// Pure behavioral topics are excluded here so preference clusters do not steal event ownership.

// Defines the non incremental primary hysteresis enforced by this service.
const NON_INCREMENTAL_PRIMARY_HYSTERESIS = 0.01;
// Defines the non incremental secondary hysteresis enforced by this service.
const NON_INCREMENTAL_SECONDARY_HYSTERESIS = 0.02;

// This function formats topic similarity values for concise logs.
function formatTopicMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format topic metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function logs a single event-to-topic assignment.
function logTopicAssignment(semanticUnit, assignment) {
  debugSemanticLog('topic',
    `event=${semanticUnit.id} → topic=${assignment.topicId} ` +
    `sim=${formatTopicMetric(assignment.confidence)} ` +
    `rank=${assignment.rank} primary=${Boolean(assignment.primaryInd)} matched`
  );
}

// This function logs a compact summary when an event gets multiple topic assignments.
function logMultiTopicAssignment(semanticUnit, assignments) {
  // Returns early when assignments count is at most 1.
  if (assignments.length <= 1) return;

  // Derives the topic id through join while performing log multi topic assignment.
  const topicIds = assignments.map(assignment => assignment.topicId).join(',');
  // Derives the primary topic id required while performing log multi topic assignment.
  const primaryTopicId = assignments.find(assignment => assignment.primaryInd)?.topicId ?? assignments[0]?.topicId;
  // Derives the best sim through max while performing log multi topic assignment.
  const bestSim = Math.max(...assignments.map(assignment => Number(assignment.confidence || 0)));

  debugSemanticLog('topic',
    `event=${semanticUnit.id} → topics=${topicIds} ` +
    `primary=${primaryTopicId} bestSim=${formatTopicMetric(bestSim)} ` +
    `matched=${assignments.length}`
  );
}

// This function logs that an event could not be assigned to a topic.
function logNoTopic(semanticUnit, bestTopicSim, gate = 'blocked') {
  debugSemanticLog('topic',
    `event=${semanticUnit.id} → no-topic ` +
    `bestSim=${formatTopicMetric(bestTopicSim)} gate=${gate}`
  );
}

// Assigns the semantic unit to topic.
export async function assignSemanticUnitToTopic({
  semanticUnit,
  semanticVector,
  topicsCache = null,
  assignmentContext = 'incremental',
  onDecision = null,
  subjectEvidence = null
}) {
  // This function finds matching event/hybrid topics for a semantic vector, or creates a gated event topic.
  // It updates matched topic activity and returns ranked assignments for EventTopic and ArticleTopic rows.
  if (!semanticVector) return [];

  // Derives the is incremental required while assigning semantic unit to topic.
  const isIncremental = assignmentContext === 'incremental';
  // Selects the primary threshold based on whether is incremental is unavailable.
  const primaryThreshold = !isIncremental
    ? Math.min(PRIMARY_TOPIC_THRESHOLD + NON_INCREMENTAL_PRIMARY_HYSTERESIS, 0.999)
    : PRIMARY_TOPIC_THRESHOLD;
  // Selects the secondary threshold based on whether is incremental is unavailable.
  const secondaryThreshold = !isIncremental
    ? Math.min(SECONDARY_TOPIC_THRESHOLD + NON_INCREMENTAL_SECONDARY_HYSTERESIS, 0.999)
    : SECONDARY_TOPIC_THRESHOLD;

  const topics = topicsCache
    ? topicsCache.filter(topic => topic.topicType !== 'behavioral' && (topic.userId == null || Number(topic.userId) === Number(semanticUnit.userId))).slice(0, MAX_CANDIDATES)
    : await Topic.findAll({ where: { userId: semanticUnit.userId, topicType: { [db.Sequelize.Op.in]: ['event', 'hybrid'] } },
      order: [['updatedAt', 'DESC'], ['id', 'ASC']], limit: MAX_CANDIDATES });
  const subjects = await loadTopicSubjectEvidence(topics, semanticUnit.userId);
  for (const [id, evidence] of subjectEvidence || []) subjects.set(id, evidence);
  const decision = evaluateTopicCandidates({ semanticUnit, subjects, primaryThreshold, secondaryThreshold,
    candidates: topics.filter(topic => topic.topicVector).map(topic => ({ topic, sim: cosineSimilarity(semanticVector, topic.topicVector) })) });
  const emit = outcome => {
    const diagnostic = topicDecisionDiagnostic(semanticUnit, decision, outcome);
    onDecision?.(diagnostic);
    emitTopicDecision({ userId: semanticUnit.userId, ...diagnostic });
  };
  const now = semanticUnit.publishedAt || new Date();
  if (decision.ambiguous) { emit('ambiguous'); return []; }
  if (decision.selected.length) {
    const strong = decision.selected.filter(c => !c.identityFallback);
    if (strong.length) await updateMatchedTopics({ rankedCandidates: strong,
      primaryCandidate: strong.find(c => c.relationshipType === 'primary') || null,
      semanticVector, semanticUnit, assignmentContext, now, topicsCache });
    for (const candidate of decision.selected.filter(c => c.identityFallback)) {
      // Weak fallback preserves continuity but cannot move the anchor centroid.
      await updateIdentityTopic({ bestTopic: candidate.topic, bestTopicSim: candidate.sim,
        semanticVector, semanticUnit, assignmentContext: 'identity-fallback', now, topicsCache });
    }
    const assignments = decision.selected.map((c, index) => ({ topicId: c.topic.id, confidence: c.confidence,
      rank: index + 1, primaryInd: c.relationshipType === 'primary' }));
    assignments.forEach(a => logTopicAssignment(semanticUnit, a));
    logMultiTopicAssignment(semanticUnit, assignments);
    emit(decision.selected.some(c => c.identityFallback) ? 'weak-fallback-reuse' : assignments.some(a => a.primaryInd) ? 'strong-reuse' : 'secondary-reuse');
    return assignments;
  }
  // A vector-prefix hash is not proof of subject identity; it cannot bypass this policy.
  const topicKey = generateTopicKey(semanticVector);
  const currentEventId = Number(semanticUnit.id) || null;
  const bestTopicSim = decision.ranked[0]?.sim || 0;

  // Creates the topic while assigning semantic unit to topic.
  const createdAssignments = await createTopic({
    semanticUnit,
    semanticVector,
    topicKey,
    now,
    currentEventId,
    topicsCache
  });

  // Handles the case where created assignments is empty.
  if (!createdAssignments.length) {
    emit('unassigned');
    logNoTopic(semanticUnit, bestTopicSim);
    return [];
  }

  // Processes each created assignments entry in turn.
  for (const assignment of createdAssignments) {
    logTopicAssignment(semanticUnit, assignment);
  }

  emit('new-topic');
  return createdAssignments;
}

// Assigns the event to topic.
export async function assignEventToTopic({
  article,
  articleTopicVector,
  topicsCache = null,
  assignmentContext = 'incremental'
}) {
  // This function adapts article-style event assignment calls to the generic semantic unit assignment flow.
  return assignSemanticUnitToTopic({
    semanticUnit: article,
    semanticVector: articleTopicVector,
    topicsCache,
    assignmentContext
  });
}

export default assignEventToTopic;
