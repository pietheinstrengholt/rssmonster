// services/events/assignArticleToEvent.js
import db from '../../models/index.js';
import assignEventToTopic from './assignEventToTopic.js';
import { EVENT_SIM_THRESHOLD, MAX_CANDIDATES } from './semanticConfig.js';

const { Article, Event, Topic } = db;

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length || !b.length) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function updateSourceDiversity(eventId, userId) {
  const sourceCount = await Article.count({
    where: { eventId, userId },
    distinct: true,
    col: 'feedId'
  });

  const sourceDiversityScore = Math.log(sourceCount + 1);

  await Event.update(
    { sourceCount, sourceDiversityScore },
    { where: { id: eventId } }
  );

  return { sourceCount, sourceDiversityScore };
}

function generateEventName(article) {
  if (!article?.title) return null;

  let name = article.title
    .replace(/\s*[-–—|:]\s*[^-–—|:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length > 120) {
    name = name.slice(0, 120).replace(/\s+\S*$/, '') + '…';
  }

  return name || null;
}

export class EventCache {
  constructor(events = []) {
    this._events = events;
  }

  static async forUser(userId) {
    const events = await Event.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

    return new EventCache(events);
  }

  get events() {
    return this._events;
  }

  add(event) {
    this._events.unshift(event);

    if (this._events.length > MAX_CANDIDATES) {
      this._events.pop();
    }
  }

  updateInMemory(eventId, updates) {
    const event = this._events.find(e => e.id === eventId);
    if (event) {
      Object.assign(event.dataValues, updates);
    }
  }
}

async function assignArticleToExistingEvent({
  article,
  articleEventVector,
  bestEvent,
  cache,
  bestScore
}) {
  const newCount = bestEvent.articleCount + 1;
  let updatedEventVector = bestEvent.eventVector;

  if (bestEvent.eventVector && articleEventVector) {
    const weight = 1 / newCount;
    updatedEventVector = bestEvent.eventVector.map(
      (v, i) =>
        v * (1 - weight) + articleEventVector[i] * weight
    );
  }

  const seenAt = article.published || new Date();

  // Parallelize database operations
  const [, , diversity] = await Promise.all([
    article.update({
      eventId: bestEvent.id,
      topicId: bestEvent.topicId ?? null
    }),
    bestEvent.update({
      eventVector: updatedEventVector,
      articleCount: newCount,
      lastSeen: seenAt,
      status: 'active'
    }),
    updateSourceDiversity(bestEvent.id, article.userId)
  ]);

  // Topic updates in parallel if needed
  if (bestEvent.topicId) {
    await Promise.all([
      Topic.increment('articleCount', {
        by: 1,
        where: { id: bestEvent.topicId }
      }),
      Topic.update(
        { lastActivityAt: seenAt },
        { where: { id: bestEvent.topicId } }
      )
    ]);
  }

  if (cache) {
    cache.updateInMemory(bestEvent.id, {
      eventVector: updatedEventVector,
      articleCount: newCount,
      ...diversity
    });
  }

  console.log(
    `[EVENT] Article ${article.id} -> EVENT ${bestEvent.id} (sim=${bestScore.toFixed(3)})`
  );
}

async function createAndAssignEvent({
  article,
  articleEventVector,
  assignedTopic,
  cache
}) {
  const name = generateEventName(article);
  const seenAt = article.published || new Date();

  const newEvent = await Event.create({
    userId: article.userId,
    topicId: assignedTopic?.id ?? null,
    representativeArticleId: article.id,
    name,
    articleCount: 1,
    eventStrength: 0.2,
    eventVector: articleEventVector,
    firstSeen: seenAt,
    lastSeen: seenAt,
    status: 'active',
    sourceCount: 1,
    sourceDiversityScore: Math.log(2)
  });

  if (!newEvent?.id) {
    console.warn(
      `[EVENT] Failed to create event for article ${article.id}`
    );
    return null;
  }

  // Parallelize article update and topic updates
  const topicOps = assignedTopic?.id
    ? Promise.all([
        Topic.increment('articleCount', {
          by: 1,
          where: { id: assignedTopic.id }
        }),
        Topic.increment('eventCount', {
          by: 1,
          where: { id: assignedTopic.id }
        }),
        Topic.update(
          { lastActivityAt: seenAt },
          { where: { id: assignedTopic.id } }
        )
      ])
    : Promise.resolve();

  await Promise.all([
    article.update({
      eventId: newEvent.id,
      topicId: assignedTopic?.id ?? null
    }),
    topicOps
  ]);

  if (cache) {
    cache.add(newEvent);
  }

  console.log(
    `[EVENT] Article ${article.id} -> NEW EVENT ${newEvent.id}` +
      (assignedTopic?.topicKey ? ` (topic=${assignedTopic.topicKey.slice(0, 8)})` : '')
  );
  
  return newEvent.id;
}

export async function assignArticleToEvent(articleIdOrObj, cache = null, vectors = null, topicsCache = null) {
  // Accept article object directly to avoid redundant fetch, or fetch by ID
  const article = typeof articleIdOrObj === 'object' 
    ? articleIdOrObj 
    : await Article.findByPk(articleIdOrObj);
  
  const articleEventVector = vectors?.eventVector ?? null;
  const articleTopicVector = vectors?.topicVector ?? null;

  if (!article || !articleEventVector) return null;

  const events = cache
    ? cache.events
    : (await Event.findAll({
        where: { userId: article.userId },
        order: [['updatedAt', 'DESC']],
        limit: MAX_CANDIDATES
      }));

  let bestEvent = null;
  let bestScore = 0;

  for (const event of events) {
    if (!event.eventVector) continue;

    const sim = cosineSimilarity(
      articleEventVector,
      event.eventVector
    );

    if (sim > bestScore) {
      bestScore = sim;
      bestEvent = event;
    }
  }

  if (bestEvent && bestScore >= EVENT_SIM_THRESHOLD) {
    await assignArticleToExistingEvent({
      article,
      articleEventVector,
      bestEvent,
      cache,
      bestScore
    });
    return bestEvent.id;
  }

  const assignedTopic = await assignEventToTopic({
    article,
    articleTopicVector,
    topicsCache
  });

  const newEventId = await createAndAssignEvent({
    article,
    articleEventVector,
    assignedTopic,
    cache
  });
  
  return newEventId;
}

export default assignArticleToEvent;
