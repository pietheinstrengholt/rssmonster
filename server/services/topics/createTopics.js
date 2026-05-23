import db from '../../models/index.js';
import {
  MIN_EVENTS_FOR_TOPIC_CREATION,
  collectTopicSeedEvents,
  averageVector,
  generateTopicName,
  debugTopicGate,
  upsertTopicInCache
} from './topicHelpers.js';

const { Topic } = db;

export async function createTopic({
  semanticUnit,
  semanticVector,
  topicKey,
  now,
  currentEventId,
  topicsCache
}) {
  const topicSeedEvents = await collectTopicSeedEvents(semanticUnit.userId, semanticVector, currentEventId);
  const topSeedSimilarity = Number((topicSeedEvents[0]?.similarity || 0).toFixed(4));

  debugTopicGate('topic-creation-gate-evaluated', {
    userId: semanticUnit.userId,
    eventId: currentEventId,
    seedCount: topicSeedEvents.length,
    threshold: MIN_EVENTS_FOR_TOPIC_CREATION,
    topSimilarity: topSeedSimilarity
  });

  if (topicSeedEvents.length < MIN_EVENTS_FOR_TOPIC_CREATION) {
    console.log(
      `[TOPIC] Creation gated: event=${currentEventId} user=${semanticUnit.userId}` +
      ` seeds=${topicSeedEvents.length}/${MIN_EVENTS_FOR_TOPIC_CREATION}` +
      ` topSim=${topSeedSimilarity}`
    );
    debugTopicGate('topic-creation-gate-blocked', {
      userId: semanticUnit.userId,
      eventId: currentEventId,
      seedCount: topicSeedEvents.length,
      threshold: MIN_EVENTS_FOR_TOPIC_CREATION,
      topSimilarity: topSeedSimilarity
    });

    return [];
  }

  const topicVector = averageVector(topicSeedEvents.map(item => item.event.eventVector)) || semanticVector;
  const createdTopic = await Topic.create({
    userId: semanticUnit.userId,
    name: generateTopicName(semanticUnit),
    topicKey: topicKey || `topic-${semanticUnit.userId}-${semanticUnit.id}`,
    topicVector,
    articleCount: 0,
    eventCount: 0,
    lastActivityAt: now
  });

  upsertTopicInCache(topicsCache, createdTopic);

  debugTopicGate('topic-creation-gate-passed', {
    userId: semanticUnit.userId,
    eventId: currentEventId,
    topicId: createdTopic.id,
    seedCount: topicSeedEvents.length,
    threshold: MIN_EVENTS_FOR_TOPIC_CREATION,
    topSimilarity: topSeedSimilarity
  });

  return [{
    topicId: createdTopic.id,
    confidence: Number((topicSeedEvents[0]?.similarity || 1).toFixed(4)),
    rank: 1,
    primaryInd: true
  }];
}

export default createTopic;
