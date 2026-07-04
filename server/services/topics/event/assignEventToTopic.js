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

const { Topic } = db;

// This service assigns event-shaped semantic units to event or hybrid topics.
// Pure behavioral topics are excluded here so preference clusters do not steal event ownership.

const MAX_TOPIC_CANDIDATES = MAX_TOPICS_PER_ARTICLE;
const NON_INCREMENTAL_PRIMARY_HYSTERESIS = 0.01;
const NON_INCREMENTAL_SECONDARY_HYSTERESIS = 0.02;

// This function formats topic similarity values for concise logs.
function formatTopicMetric(value, digits = 3) {
  const numeric = Number(value);
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
  if (assignments.length <= 1) return;

  const topicIds = assignments.map(assignment => assignment.topicId).join(',');
  const primaryTopicId = assignments.find(assignment => assignment.primaryInd)?.topicId ?? assignments[0]?.topicId;
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

export async function assignSemanticUnitToTopic({
  semanticUnit,
  semanticVector,
  topicsCache = null,
  assignmentContext = 'incremental'
}) {
  // This function finds matching event/hybrid topics for a semantic vector, or creates a gated event topic.
  // It updates matched topic activity and returns ranked assignments for EventTopic and ArticleTopic rows.
  if (!semanticVector) return [];

  const isIncremental = assignmentContext === 'incremental';
  const primaryThreshold = !isIncremental
    ? Math.min(PRIMARY_TOPIC_THRESHOLD + NON_INCREMENTAL_PRIMARY_HYSTERESIS, 0.999)
    : PRIMARY_TOPIC_THRESHOLD;
  const secondaryThreshold = !isIncremental
    ? Math.min(SECONDARY_TOPIC_THRESHOLD + NON_INCREMENTAL_SECONDARY_HYSTERESIS, 0.999)
    : SECONDARY_TOPIC_THRESHOLD;

  const matchedCandidates = [];
  let bestTopic = null;
  let bestTopicSim = 0;

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

  for (const topic of topics) {
    if (!topic.topicVector) continue;

    const sim = cosineSimilarity(
      semanticVector,
      topic.topicVector
    );

    if (sim > bestTopicSim) {
      bestTopicSim = sim;
      bestTopic = topic;
    }

    if (sim >= secondaryThreshold) {
      matchedCandidates.push({ topic, sim });
    }
  }

  const now = semanticUnit.published || new Date();

  if (matchedCandidates.length) {
    const rankedCandidates = matchedCandidates
      .sort((a, b) => (b.sim - a.sim) || (a.topic.id - b.topic.id))
      .slice(0, MAX_TOPIC_CANDIDATES);

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

    const assignments = rankedCandidates.map((candidate, index) => ({
      topicId: candidate.topic.id,
      confidence: Number(candidate.sim.toFixed(4)),
      rank: index + 1,
      primaryInd: Boolean(primaryCandidate && candidate.topic.id === primaryCandidate.topic.id)
    }));

    for (const assignment of assignments) {
      logTopicAssignment(semanticUnit, assignment);
    }
    logMultiTopicAssignment(semanticUnit, assignments);

    return assignments;
  }

  const topicKey = generateTopicKey(semanticVector);
  const currentEventId = Number(semanticUnit.id) || null;

  if (bestTopic && bestTopicSim >= TOPIC_IDENTITY_THRESHOLD) {
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

  if (topicKey) {
    const cachedKeyMatch = topicsCache?.find(topic => topic.topicKey === topicKey) ?? null;
    if (cachedKeyMatch) {
      return [await updateTopicByKey({
        topic: cachedKeyMatch,
        now,
        topicsCache
      })].map(assignment => {
        logTopicAssignment(semanticUnit, assignment);
        return assignment;
      });
    }

    const persistedKeyMatch = await Topic.findOne({
      where: {
        userId: semanticUnit.userId,
        topicKey,
        topicType: { [db.Sequelize.Op.in]: ['event', 'hybrid'] }
      }
    });

    if (persistedKeyMatch) {
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

  const createdAssignments = await createTopic({
    semanticUnit,
    semanticVector,
    topicKey,
    now,
    currentEventId,
    topicsCache
  });

  if (!createdAssignments.length) {
    logNoTopic(semanticUnit, bestTopicSim);
    return [];
  }

  for (const assignment of createdAssignments) {
    logTopicAssignment(semanticUnit, assignment);
  }

  return createdAssignments;
}

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
