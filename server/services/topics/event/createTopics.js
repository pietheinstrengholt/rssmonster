import db from '../../../models/index.js';
import {
  MIN_ARTICLES_FOR_TOPIC_CREATION,
  MIN_EVENTS_FOR_TOPIC_CREATION,
  collectTopicSeedEvents,
  collectEventArticleTitles,
  averageVector,
  evaluateTopicCreationGate,
  debugTopicGate,
  upsertTopicInCache
} from '../shared/topicHelpers.js';
import { generateTopicName } from '../shared/topicName.service.js';

const { Topic } = db;

// This service creates event topics after validating that an event has enough corroborating evidence.
// Behavioral topics are calibrated in calibrateBehavioralTopics.js and do not use these event-topic gates.

// This function formats topic creation similarity values for concise logs.
function formatTopicMetric(value, digits = 3) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function escapes topic names in single-line logs.
function logSafeTopicName(name = '') {
  return String(name || '').replace(/"/g, '\\"');
}

export async function createTopic({
  semanticUnit,
  semanticVector,
  topicKey,
  now,
  currentEventId,
  topicsCache
}) {
  // This function creates a new event topic when seed events and article evidence pass the topic gate.
  // It chooses a name, stores the averaged topic vector, and returns the primary assignment shape.
  const topicSeedEvents = await collectTopicSeedEvents(semanticUnit.userId, semanticVector, currentEventId);
  const topSeedSimilarity = Number((topicSeedEvents[0]?.similarity || 0).toFixed(4));
  const seedArticleCount = topicSeedEvents.reduce(
    (sum, item) => sum + Math.max(0, Number(item.event.articleCount || 0)),
    0
  );
  const currentEvent = topicSeedEvents.find(
    item => Number(item.event.id) === Number(currentEventId)
  )?.event ?? semanticUnit;
  const topicName = generateTopicName({ semanticUnit, seedEvents: topicSeedEvents });
  const currentArticleCount = Number(currentEvent?.articleCount || 0);
  const currentEventArticleTitles = currentArticleCount === 2
    ? await collectEventArticleTitles(semanticUnit.userId, currentEventId)
    : [];
  const creationGate = evaluateTopicCreationGate({
    semanticUnit,
    currentEvent,
    topicSeedEvents,
    seedArticleCount,
    topSeedSimilarity,
    topicName,
    currentEventArticleTitles
  });

  debugTopicGate('topic-creation-gate-evaluated', {
    userId: semanticUnit.userId,
    eventId: currentEventId,
    seedCount: topicSeedEvents.length,
    eventThreshold: MIN_EVENTS_FOR_TOPIC_CREATION,
    seedArticleCount,
    articleThreshold: MIN_ARTICLES_FOR_TOPIC_CREATION,
    topSimilarity: topSeedSimilarity,
    currentArticleCount,
    sourceCount: currentEvent?.sourceCount ?? null,
    eventStrength: currentEvent?.eventStrength ?? null,
    status: currentEvent?.status ?? null
  });

  if (!creationGate.passed) {
    console.log(
      `[TOPIC] gated event=${currentEventId}` +
      ` seeds=${topicSeedEvents.length}/${MIN_EVENTS_FOR_TOPIC_CREATION}` +
      ` articles=${seedArticleCount}/${MIN_ARTICLES_FOR_TOPIC_CREATION}` +
      ` topSim=${formatTopicMetric(topSeedSimilarity)}` +
      ` reason=insufficient-evidence`
    );
    debugTopicGate('topic-creation-gate-blocked', {
      userId: semanticUnit.userId,
      eventId: currentEventId,
      seedCount: topicSeedEvents.length,
      eventThreshold: MIN_EVENTS_FOR_TOPIC_CREATION,
      seedArticleCount,
      articleThreshold: MIN_ARTICLES_FOR_TOPIC_CREATION,
      topSimilarity: topSeedSimilarity,
      currentArticleCount,
      sourceCount: currentEvent?.sourceCount ?? null,
      eventStrength: currentEvent?.eventStrength ?? null,
      status: currentEvent?.status ?? null
    });

    return [];
  }

  const topicVector = averageVector(topicSeedEvents.map(item => item.event.eventVector)) || semanticVector;
  const createdTopic = await Topic.create({
    userId: semanticUnit.userId,
    name: topicName,
    topicKey: topicKey || `topic-${semanticUnit.userId}-${semanticUnit.id}`,
    topicType: 'event',
    topicVector,
    articleCount: 0,
    eventCount: 0,
    lastActivityAt: now
  });

  upsertTopicInCache(topicsCache, createdTopic);

  console.log(
    `[TOPIC] new-topic=${createdTopic.id} event=${currentEventId} ` +
    `name="${logSafeTopicName(topicName)}" ` +
    `seeds=${topicSeedEvents.length} articles=${seedArticleCount} ` +
    `topSim=${formatTopicMetric(topSeedSimilarity)} gate=${creationGate.reason}`
  );

  debugTopicGate(`topic-creation-gate-passed: ${creationGate.reason}`, {
    userId: semanticUnit.userId,
    eventId: currentEventId,
    topicId: createdTopic.id,
    seedCount: topicSeedEvents.length,
    eventThreshold: MIN_EVENTS_FOR_TOPIC_CREATION,
    seedArticleCount,
    articleThreshold: MIN_ARTICLES_FOR_TOPIC_CREATION,
    topSimilarity: topSeedSimilarity,
    currentArticleCount,
    sourceCount: currentEvent?.sourceCount ?? null,
    eventStrength: currentEvent?.eventStrength ?? null,
    status: currentEvent?.status ?? null,
    gate: creationGate.reason
  });

  return [{
    topicId: createdTopic.id,
    confidence: Number((topicSeedEvents[0]?.similarity || 1).toFixed(4)),
    rank: 1,
    primaryInd: true
  }];
}

export default createTopic;

