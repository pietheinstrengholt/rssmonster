// services/events/assignArticleToEvent.js
import crypto from 'crypto';
import db from '../../models/index.js';

const { Article, Event, Topic } = db;

const EVENT_SIM_THRESHOLD = 0.88;
const TOPIC_SIM_THRESHOLD = 0.65;
const MAX_CANDIDATES = 300;

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

function generateTopicKey(topicVector) {
  if (!Array.isArray(topicVector)) return null;

  const slice = topicVector.slice(0, 32);
  const buffer = Buffer.from(
    slice.map(v => Math.round(v * 1e6)).join(',')
  );

  return crypto.createHash('sha1').update(buffer).digest('hex');
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

function generateTopicName(article) {
  if (!article?.title) return 'Untitled Topic';

  const name = article.title
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();

  return name || 'Untitled Topic';
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

async function resolveTopicAssignment(article, articleTopicVector) {
  if (!articleTopicVector) return null;

  let bestTopicSim = 0;
  let bestTopic = null;

  const topics = await Topic.findAll({
    where: { userId: article.userId },
    order: [['updatedAt', 'DESC']],
    limit: MAX_CANDIDATES
  });

  for (const topic of topics) {
    if (!topic.topicVector) continue;

    const sim = cosineSimilarity(
      articleTopicVector,
      topic.topicVector
    );

    if (sim > bestTopicSim) {
      bestTopicSim = sim;
      bestTopic = topic;
    }
  }

  if (bestTopic && bestTopicSim >= TOPIC_SIM_THRESHOLD) {
    return bestTopic;
  }

  const topicKey = generateTopicKey(articleTopicVector);
  const now = article.published || new Date();

  return Topic.create({
    userId: article.userId,
    name: generateTopicName(article),
    topicKey: topicKey || `topic-${article.userId}-${article.id}`,
    topicVector: articleTopicVector,
    articleCount: 0,
    eventCount: 0,
    lastActivityAt: now
  });
}

async function assignArticleToExistingEvent({
  article,
  articleEventVector,
  bestEvent,
  cache,
  bestScore
}) {
  await article.update({
    eventId: bestEvent.id,
    topicId: bestEvent.topicId ?? null
  });

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

  await bestEvent.update({
    eventVector: updatedEventVector,
    articleCount: newCount,
    lastSeen: seenAt,
    status: 'active'
  });

  const diversity = await updateSourceDiversity(
    bestEvent.id,
    article.userId
  );

  if (bestEvent.topicId) {
    await Topic.increment('articleCount', {
      by: 1,
      where: { id: bestEvent.topicId }
    });

    await Topic.update(
      { lastActivityAt: seenAt },
      { where: { id: bestEvent.topicId } }
    );
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
    return;
  }

  await article.update({
    eventId: newEvent.id,
    topicId: assignedTopic?.id ?? null
  });

  if (assignedTopic?.id) {
    await Topic.increment('articleCount', {
      by: 1,
      where: { id: assignedTopic.id }
    });
    await Topic.increment('eventCount', {
      by: 1,
      where: { id: assignedTopic.id }
    });

    await Topic.update(
      { lastActivityAt: seenAt },
      { where: { id: assignedTopic.id } }
    );
  }

  if (cache) {
    cache.add(newEvent);
  }

  console.log(
    `[EVENT] Article ${article.id} -> NEW EVENT ${newEvent.id}` +
      (assignedTopic?.topicKey ? ` (topic=${assignedTopic.topicKey.slice(0, 8)})` : '')
  );
}

export async function assignArticleToEvent(articleId, cache = null, vectors = null) {
  const article = await Article.findByPk(articleId);
  const articleEventVector = vectors?.eventVector ?? null;
  const articleTopicVector = vectors?.topicVector ?? null;

  if (!article || !articleEventVector) return;

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
    return;
  }

  const assignedTopic = await resolveTopicAssignment(article, articleTopicVector);

  await createAndAssignEvent({
    article,
    articleEventVector,
    assignedTopic,
    cache
  });
}

export default assignArticleToEvent;
