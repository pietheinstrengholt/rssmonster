import db from '../../../models/index.js';
import { Op } from 'sequelize';

import {
  MAX_TOPICS_PER_ARTICLE,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD
} from '../../config/semanticConfig.js';
import { assignSemanticUnitToTopic } from './assignEventToTopic.js';
import { syncEventTopicsToArticles } from '../../events/eventArticleTopicSync.js';

// Provides the shared dependencies used by this service.
const { EventTopic } = db;

// Defines the event topic types enforced by this service.
export const EVENT_TOPIC_TYPES = ['event', 'hybrid'];

// This function deduplicates, ranks, and thresholds topic assignments before persistence.
export function normalizeTopicAssignments(assignments = []) {
  // Derives the by topic required while normalizing topic assignments.
  const byTopic = new Map();

  // Processes each assignments entry in turn.
  for (const assignment of assignments) {
    // Coerces the topic id into the representation required while normalizing topic assignments.
    const topicId = Number(assignment?.topicId);
    // Coerces the confidence into the representation required while normalizing topic assignments.
    const confidence = Number(assignment?.confidence ?? 0);

    // Skips the current entry when topic id is not finite or topic id is at most value.
    if (!Number.isFinite(topicId) || topicId <= 0) continue;
    // Skips the current entry when confidence is not finite or confidence is at most value.
    if (!Number.isFinite(confidence) || confidence <= 0) continue;

    // Derives the existing through get while normalizing topic assignments.
    const existing = byTopic.get(topicId);
    // Handles the case where existing is unavailable or confidence exceeds existing confidence.
    if (!existing || confidence > existing.confidence) {
      byTopic.set(topicId, {
        topicId,
        confidence,
        primaryInd: Boolean(assignment?.primaryInd)
      });
    }
  }

  // Derives the ranked through slice while normalizing topic assignments.
  const ranked = [...byTopic.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_TOPICS_PER_ARTICLE);

  // Keeps the with threshold entries eligible while normalizing topic assignments.
  const withThreshold = ranked.filter(topic => topic.confidence >= SECONDARY_TOPIC_THRESHOLD);
  // Selects the final list based on whether with threshold is non-empty.
  const finalList = withThreshold.length ? withThreshold : ranked.slice(0, 1);

  // Derives the explicit primary required while normalizing topic assignments.
  const explicitPrimary = finalList.find(topic => topic.primaryInd) ?? null;
  // Resolves the threshold primary that governs normalizing topic assignments.
  const thresholdPrimary = finalList.find(topic => topic.confidence >= PRIMARY_TOPIC_THRESHOLD) ?? null;
  // Selects the primary topic based on whether explicit primary is available and explicit primary confidence reaches primary topic threshold.
  const primaryTopic = explicitPrimary && explicitPrimary.confidence >= PRIMARY_TOPIC_THRESHOLD
    ? explicitPrimary
    : thresholdPrimary;

  // Maps source values into the result produced while normalizing topic assignments.
  return finalList.map((topic, index) => ({
    topicId: topic.topicId,
    confidence: Number(topic.confidence.toFixed(4)),
    rank: index + 1,
    primaryInd: Boolean(primaryTopic && primaryTopic.topicId === topic.topicId)
  }));
}

// This function returns the primary topic id from normalized topic assignments.
export function primaryTopicId(topicAssignments = []) {
  // Runs the callback required while performing primary topic id.
  return topicAssignments.find(topic => topic.primaryInd)?.topicId ?? null;
}

// This function replaces the EventTopic rows for one event and updates the event primary topic.
export async function persistEventTopicAssignments(event, topicAssignments) {
  // Normalizes the assignments before performing persist event topic assignments.
  const normalizedAssignments = normalizeTopicAssignments(topicAssignments);
  // Derives the primary id through primary topic id while performing persist event topic assignments.
  const primaryId = primaryTopicId(normalizedAssignments);

  await EventTopic.destroy({ where: { eventId: event.id } });

  // Handles the case where normalized assignments is non-empty.
  if (normalizedAssignments.length) {
    // Maps source values into the result produced while performing persist event topic assignments.
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

// This function assigns topics to a set of existing events for an explicit pipeline scope.
export async function assignTopicsForEvents(userId, events, { assignmentContext = 'recent-repair' } = {}) {
  // Returns early when events is empty.
  if (!events.length) {
    return {
      eventCount: 0,
      touchedTopicIds: [],
      stats: { eventsSkipped: 0, eventsMatched: 0, eventsUnmatched: 0, newTopicsCreated: 0 }
    };
  }

  // Loads the topics cache needed while assigning topics for events.
  const topicsCache = await db.Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    order: [['updatedAt', 'DESC']]
  });

  // Tracks distinct touched topic id while assigning topics for events.
  const touchedTopicIds = new Set();
  const initialTopicCount = topicsCache.length;
  let eventsSkipped = 0;
  let eventsMatched = 0;
  let eventsUnmatched = 0;

  // Processes each events entry in turn.
  for (const event of events) {
    // Handles the case where event event vector is not an array or event event vector is empty.
    if (!Array.isArray(event.eventVector) || !event.eventVector.length) {
      eventsSkipped++;
      await EventTopic.destroy({ where: { eventId: event.id } });
      await event.update({ topicId: null });
      await syncEventTopicsToArticles(event.id, []);
      continue;
    }

    // Derives the event topic assignments through assign semantic unit to topic while assigning topics for events.
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
        publishedAt: event.eventWindowEndAt || event.updatedAt || new Date()
      },
      semanticVector: event.eventVector,
      topicsCache,
      assignmentContext
    });

    // Derives the persisted assignments through persist event topic assignments while assigning topics for events.
    const persistedAssignments = await persistEventTopicAssignments(event, eventTopicAssignments);
    await syncEventTopicsToArticles(event.id, persistedAssignments);

    // Handles the case where persisted assignments is non-empty.
    if (persistedAssignments.length) {
      eventsMatched++;
    } else {
      eventsUnmatched++;
    }

    // Processes each persisted assignments entry in turn.
    for (const assignment of persistedAssignments) {
      touchedTopicIds.add(Number(assignment.topicId));
    }
  }

  // Derives the new topics created required while assigning topics for events.
  const newTopicsCreated = topicsCache.length - initialTopicCount;

  return {
    eventCount: events.length,
    touchedTopicIds: [...touchedTopicIds],
    stats: { eventsSkipped, eventsMatched, eventsUnmatched, newTopicsCreated }
  };
}
