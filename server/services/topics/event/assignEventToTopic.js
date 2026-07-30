import db from '../../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_IDENTITY_THRESHOLD,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD,
  MAX_TOPICS_PER_ARTICLE
} from '../../config/semanticConfig.js';
import {
  cosineSimilarity,
  generateTopicKey
} from '../shared/topicHelpers.js';
import {
  updateMatchedTopics,
  updateIdentityTopic,
  updateTopicByKey
} from './updateTopic.js';
import { createTopic } from './createTopics.js';

// Provides the shared dependencies used by this service.
const { Topic } = db;

// This service assigns event-shaped semantic units to event or hybrid topics.
// Pure behavioral topics are excluded here so preference clusters do not steal event ownership.

// Defines the max topic candidates enforced by this service.
const MAX_TOPIC_CANDIDATES = MAX_TOPICS_PER_ARTICLE;
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
  console.log(
    `[TOPIC] event=${semanticUnit.id} → topic=${assignment.topicId} ` +
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

  console.log(
    `[TOPIC] event=${semanticUnit.id} → topics=${topicIds} ` +
    `primary=${primaryTopicId} bestSim=${formatTopicMetric(bestSim)} ` +
    `matched=${assignments.length}`
  );
}

// This function logs that an event could not be assigned to a topic.
function logNoTopic(semanticUnit, bestTopicSim, gate = 'blocked') {
  console.log(
    `[TOPIC] event=${semanticUnit.id} → no-topic ` +
    `bestSim=${formatTopicMetric(bestTopicSim)} gate=${gate}`
  );
}

// Assigns the semantic unit to topic.
export async function assignSemanticUnitToTopic({
  semanticUnit,
  semanticVector,
  topicsCache = null,
  assignmentContext = 'incremental'
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

  // Collects the matched candidates while assigning semantic unit to topic.
  const matchedCandidates = [];
  let bestTopic = null;
  let bestTopicSim = 0;

  // Selects the topics based on whether topics cache is available.
  const topics = topicsCache
    ? topicsCache.filter(topic => topic.topicType !== 'behavioral')
    : await Topic.findAll({
      where: {
        userId: semanticUnit.userId,
        topicType: { [db.Sequelize.Op.in]: ['event', 'hybrid'] }
      },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

  // Processes each topics entry in turn.
  for (const topic of topics) {
    // Skips the current entry when topic topic vector is unavailable.
    if (!topic.topicVector) continue;

    // Derives the sim through cosine similarity while assigning semantic unit to topic.
    const sim = cosineSimilarity(
      semanticVector,
      topic.topicVector
    );

    // Handles the case where sim exceeds best topic sim.
    if (sim > bestTopicSim) {
      bestTopicSim = sim;
      bestTopic = topic;
    }

    // Handles the case where sim reaches secondary threshold.
    if (sim >= secondaryThreshold) {
      matchedCandidates.push({ topic, sim });
    }
  }

  // Derives the now required while assigning semantic unit to topic.
  const now = semanticUnit.publishedAt || new Date();

  // Handles the case where matched candidates is non-empty.
  if (matchedCandidates.length) {
    // Derives the ranked candidates through slice while assigning semantic unit to topic.
    const rankedCandidates = matchedCandidates
      .sort((a, b) => (b.sim - a.sim) || (a.topic.id - b.topic.id))
      .slice(0, MAX_TOPIC_CANDIDATES);

    // Collects primary candidate for the selection made while assigning semantic unit to topic.
    const primaryCandidate = rankedCandidates.find(candidate =>
      candidate.sim >= primaryThreshold
    ) ?? null;

    await updateMatchedTopics({
      rankedCandidates,
      primaryCandidate,
      semanticVector,
      semanticUnit,
      assignmentContext,
      now,
      topicsCache
    });

    // Transforms source values into the assignments required while assigning semantic unit to topic.
    const assignments = rankedCandidates.map((candidate, index) => ({
      topicId: candidate.topic.id,
      confidence: Number(candidate.sim.toFixed(4)),
      rank: index + 1,
      primaryInd: Boolean(primaryCandidate && candidate.topic.id === primaryCandidate.topic.id)
    }));

    // Processes each assignments entry in turn.
    for (const assignment of assignments) {
      logTopicAssignment(semanticUnit, assignment);
    }
    logMultiTopicAssignment(semanticUnit, assignments);

    return assignments;
  }

  // Derives the topic key through generate topic key while assigning semantic unit to topic.
  const topicKey = generateTopicKey(semanticVector);
  // Derives the current event id required while assigning semantic unit to topic.
  const currentEventId = Number(semanticUnit.id) || null;

  // Returns early when best topic is available and best topic sim reaches topic identity threshold.
  if (bestTopic && bestTopicSim >= TOPIC_IDENTITY_THRESHOLD) {
    // Maps source values into the result produced while assigning semantic unit to topic.
    return [await updateIdentityTopic({
      bestTopic,
      bestTopicSim,
      semanticVector,
      semanticUnit,
      assignmentContext,
      now,
      topicsCache
    })].map(assignment => {
      logTopicAssignment(semanticUnit, assignment);
      return assignment;
    });
  }

  // Handles the case where topic key is available.
  if (topicKey) {
    // Derives the cached key match required while assigning semantic unit to topic.
    const cachedKeyMatch = topicsCache?.find(topic => topic.topicKey === topicKey) ?? null;
    // Returns early when cached key match is available.
    if (cachedKeyMatch) {
      // Maps source values into the result produced while assigning semantic unit to topic.
      return [await updateTopicByKey({
        topic: cachedKeyMatch,
        now,
        topicsCache
      })].map(assignment => {
        logTopicAssignment(semanticUnit, assignment);
        return assignment;
      });
    }

    // Loads the persisted key match needed while assigning semantic unit to topic.
    const persistedKeyMatch = await Topic.findOne({
      where: {
        userId: semanticUnit.userId,
        topicKey,
        topicType: { [db.Sequelize.Op.in]: ['event', 'hybrid'] }
      }
    });

    // Returns early when persisted key match is available.
    if (persistedKeyMatch) {
      // Maps source values into the result produced while assigning semantic unit to topic.
      return [await updateTopicByKey({
        topic: persistedKeyMatch,
        now,
        topicsCache
      })].map(assignment => {
        logTopicAssignment(semanticUnit, assignment);
        return assignment;
      });
    }
  }

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
    logNoTopic(semanticUnit, bestTopicSim);
    return [];
  }

  // Processes each created assignments entry in turn.
  for (const assignment of createdAssignments) {
    logTopicAssignment(semanticUnit, assignment);
  }

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
