import db from '../../models/index.js';
import { Op } from 'sequelize';

import {
  EVENT_LIFECYCLE,
  EVENT_STRENGTH_CONFIG
} from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import {
  articleEventTimestamp,
  eventWindowFromArticles
} from './articleEventTime.js';

const { Article, Event } = db;

// This function maps event age and size into the lifecycle status used by event queries.
export function resolveEventStatus(articleCount, lastSeenAt) {
  const now = Date.now();
  const lastSeenTs = lastSeenAt ? new Date(lastSeenAt).getTime() : null;

  if (!Number.isFinite(lastSeenTs)) return 'archived';

  const ageHours = Math.max(0, (now - lastSeenTs) / (1000 * 60 * 60));

  if (ageHours >= EVENT_LIFECYCLE.coolingHours) {
    return 'archived';
  }

  if (ageHours > EVENT_LIFECYCLE.activeFreshHours) {
    return 'cooling';
  }

  if (articleCount <= EVENT_LIFECYCLE.emergingArticleMax) {
    return 'emerging';
  }

  return 'active';
}

// This function builds an event vector from recent article vectors, weighting newer articles more heavily.
export function buildRecencyWeightedVector(eventArticles) {
  const embedded = eventArticles.filter(a => Array.isArray(a.articleVector));
  if (!embedded.length) return null;

  const sorted = embedded
    .slice()
    .sort((a, b) => (articleEventTimestamp(b) || 0) - (articleEventTimestamp(a) || 0))
    .slice(0, 24);

  const newestTs = articleEventTimestamp(sorted[0]) || 0;
  const dim = sorted[0].articleVector.length;

  const weighted = Array(dim).fill(0);
  let totalWeight = 0;

  for (const article of sorted) {
    const ts = articleEventTimestamp(article) || 0;
    const ageHours = Math.max(0, (newestTs - ts) / (1000 * 60 * 60));
    const weight = Math.pow(0.5, ageHours / 12);

    totalWeight += weight;
    for (let i = 0; i < dim; i++) {
      weighted[i] += article.articleVector[i] * weight;
    }
  }

  if (!totalWeight) return sorted[0].articleVector;

  return weighted.map(value => value / totalWeight);
}

// This function estimates event strength from article redundancy, cohesion, and topic history.
export function computeEventStrength({
  articleCount,
  topicEventCount
}) {
  const redundancyScore = Math.min(
    articleCount / EVENT_STRENGTH_CONFIG.maxArticleRedundancyCount,
    1
  );

  const topicScore = Math.min(
    Math.log2((topicEventCount ?? 1) + 1) / EVENT_STRENGTH_CONFIG.maxTopicEventLogBase,
    1
  );

  const cohesionScore = EVENT_STRENGTH_CONFIG.cohesionBaseline;

  return Number((
    redundancyScore * EVENT_STRENGTH_CONFIG.weights.redundancy +
    cohesionScore * EVENT_STRENGTH_CONFIG.weights.cohesion +
    topicScore * EVENT_STRENGTH_CONFIG.weights.topic
  ).toFixed(3));
}

// This function recomputes denormalized event fields for events touched during assignment.
export async function reconcileTouchedEvents(userId, touchedEventIds) {
  const touchedIds = [...touchedEventIds];

  const events = await Event.findAll({
    where: {
      id: { [Op.in]: touchedIds },
      userId
    },
    order: [
      ['eventWindowEndAt', 'ASC'],
      ['id', 'ASC']
    ]
  });

  const allEventArticles = await Article.findAll({
    where: {
      eventId: { [Op.in]: touchedIds },
      userId,
      ...canonicalArticleWhere()
    },
    attributes: ['id', 'eventId', 'feedId', 'publishedAt', 'createdAt', 'articleVector']
  });

  const articlesByEventId = {};
  for (const article of allEventArticles) {
    if (!articlesByEventId[article.eventId]) {
      articlesByEventId[article.eventId] = [];
    }
    articlesByEventId[article.eventId].push(article);
  }

  for (const event of events) {
    const eventArticles = articlesByEventId[event.id] || [];

    if (!eventArticles.length) {
      await event.destroy();
      continue;
    }

    // Article-level event vectors may not be persisted in some environments.
    // Keep the existing event vector when no per-article vectors are available.
    const eventVector = buildRecencyWeightedVector(eventArticles) ?? event.eventVector ?? null;

    const { eventWindowStartAt, eventWindowEndAt } = eventWindowFromArticles(eventArticles);
    const status = resolveEventStatus(eventArticles.length, eventWindowEndAt);
    const sourceCount = new Set(
      eventArticles
        .map(article => article.feedId)
        .filter(feedId => feedId != null)
    ).size;
    const sourceDiversityScore = Math.log(sourceCount + 1);
    const strength = computeEventStrength({
      articleCount: eventArticles.length,
      topicEventCount: 1
    });

    await event.update({
      articleCount: eventArticles.length,
      eventVector,
      eventWindowStartAt,
      eventWindowEndAt,
      status,
      sourceCount,
      sourceDiversityScore,
      eventStrength: strength
    });

    console.log(
      `[EVENT] Reconciled event ${event.id}` +
      ` articles=${eventArticles.length}` +
      ` sources=${sourceCount}` +
      ` strength=${strength}`
    );
  }

  return {
    touchedIds,
    articlesByEventId
  };
}
