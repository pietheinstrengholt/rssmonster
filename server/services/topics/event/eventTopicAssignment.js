import db from '../../../models/index.js';
import { Op } from 'sequelize';

import {
  MAX_TOPICS_PER_ARTICLE,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD
} from '../../config/semanticConfig.js';
import { assignSemanticUnitToTopic } from './assignEventToTopic.js';
import { syncEventTopicsToArticles } from '../../events/eventArticleTopicSync.js';

const { EventTopic } = db;

export const EVENT_TOPIC_TYPES = ['event', 'hybrid'];

// This function deduplicates, ranks, and thresholds topic assignments before persistence.
export function normalizeTopicAssignments(assignments = []) {
  const byTopic = new Map();

  for (const assignment of assignments) {
    const topicId = Number(assignment?.topicId);
    const confidence = Number(assignment?.confidence ?? 0);

    if (!Number.isFinite(topicId) || topicId <= 0) continue;
    if (!Number.isFinite(confidence) || confidence <= 0) continue;

    const existing = byTopic.get(topicId);
    if (!existing || confidence > existing.confidence) {
      byTopic.set(topicId, {
        topicId,
        confidence,
        primaryInd: Boolean(assignment?.primaryInd)
      });
    }
  }

  const ranked = [...byTopic.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_TOPICS_PER_ARTICLE);

  const withThreshold = ranked.filter(topic => topic.confidence >= SECONDARY_TOPIC_THRESHOLD);
  const finalList = withThreshold.length ? withThreshold : ranked.slice(0, 1);

  const explicitPrimary = finalList.find(topic => topic.primaryInd) ?? null;
  const thresholdPrimary = finalList.find(topic => topic.confidence >= PRIMARY_TOPIC_THRESHOLD) ?? null;
  const primaryTopic = explicitPrimary && explicitPrimary.confidence >= PRIMARY_TOPIC_THRESHOLD
    ? explicitPrimary
    : thresholdPrimary;

  return finalList.map((topic, index) => ({
    topicId: topic.topicId,
    confidence: Number(topic.confidence.toFixed(4)),
    rank: index + 1,
    primaryInd: Boolean(primaryTopic && primaryTopic.topicId === topic.topicId)
  }));
}

// This function returns the primary topic id from normalized topic assignments.
export function primaryTopicId(topicAssignments = []) {
  return topicAssignments.find(topic => topic.primaryInd)?.topicId ?? null;
}

// This function replaces the EventTopic rows for one event and updates the event primary topic.
export async function persistEventTopicAssignments(event, topicAssignments) {
  const normalizedAssignments = normalizeTopicAssignments(topicAssignments);
  const primaryId = primaryTopicId(normalizedAssignments);

  await EventTopic.destroy({ where: { eventId: event.id } });

  if (normalizedAssignments.length) {
    await EventTopic.bulkCreate(
      normalizedAssignments.map(assignment => ({
        eventId: event.id,
        topicId: assignment.topicId,
        confidence: assignment.confidence,
        rank: assignment.rank,
        primaryInd: assignment.primaryInd
      }))
    );
  }

  await event.update({ topicId: primaryId });

  return normalizedAssignments;
}

// This function assigns topics to a set of existing events during replay or rebuild.
export async function assignTopicsForEvents(userId, events, { assignmentContext = 'replay' } = {}) {
  if (!events.length) {
    return {
      eventCount: 0,
      touchedTopicIds: [],
      stats: { eventsSkipped: 0, eventsMatched: 0, eventsUnmatched: 0, newTopicsCreated: 0 }
    };
  }

  const topicsCache = await db.Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    order: [['updatedAt', 'DESC']]
  });

  const touchedTopicIds = new Set();
  const initialTopicCount = topicsCache.length;
  let eventsSkipped = 0;
  let eventsMatched = 0;
  let eventsUnmatched = 0;

  for (const event of events) {
    if (!Array.isArray(event.eventVector) || !event.eventVector.length) {
      eventsSkipped++;
      await EventTopic.destroy({ where: { eventId: event.id } });
      await event.update({ topicId: null });
      await syncEventTopicsToArticles(event.id, []);
      continue;
    }

    const eventTopicAssignments = await assignSemanticUnitToTopic({
      semanticUnit: {
        id: event.id,
        userId: event.userId,
        title: event.name || `Event ${event.id}`,
        name: event.name,
        articleCount: event.articleCount,
        sourceCount: event.sourceCount,
        eventStrength: event.eventStrength,
        status: event.status,
        published: event.eventWindowEndAt || event.updatedAt || new Date()
      },
      semanticVector: event.eventVector,
      topicsCache,
      assignmentContext
    });

    const persistedAssignments = await persistEventTopicAssignments(event, eventTopicAssignments);
    await syncEventTopicsToArticles(event.id, persistedAssignments);

    if (persistedAssignments.length) {
      eventsMatched++;
    } else {
      eventsUnmatched++;
    }

    for (const assignment of persistedAssignments) {
      touchedTopicIds.add(Number(assignment.topicId));
    }
  }

  const newTopicsCreated = topicsCache.length - initialTopicCount;

  return {
    eventCount: events.length,
    touchedTopicIds: [...touchedTopicIds],
    stats: { eventsSkipped, eventsMatched, eventsUnmatched, newTopicsCreated }
  };
}
