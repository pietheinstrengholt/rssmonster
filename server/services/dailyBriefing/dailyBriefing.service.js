import db from '../../models/index.js';
import { Op } from 'sequelize';
import { resolveDateFilterToRange } from '../articleSearch/articleDateParser.service.js';
import { applyBriefingEligibility } from '../articleSearch/briefingEligibility.service.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

const {
  Article,
  Event,
  EventTopic,
  Island,
  IslandTopic,
  Setting,
  Topic
} = db;

const BRIEFING_PERIOD_FILTERS = {
  today: { type: 'today' },
  '24h': { type: 'today' },
  '7d': { type: 'lastweek' }
};
const BRIEFING_STATUSES = new Set(['all', 'unread']);
const DEFAULT_BRIEFING_PERIOD = '7d';
const DEFAULT_BRIEFING_STATUS = 'all';
const MAX_MORNING_SUMMARY_ITEMS = 4;
const MIN_USEFUL_SENTENCE_LENGTH = 25;
const MIN_USEFUL_SENTENCE_WORDS = 4;
const EXCERPT_TARGET_MIN = 160;
const EXCERPT_TARGET_MAX = 280;
const BRIEFING_BOILERPLATE_PATTERNS = [
  /\b(?:image|photo|picture)\s+credits?\b/i,
  /^(?:continue|keep)\s+reading\b/i,
  /^read\s+(?:more|the\s+(?:full|original)\b)/i,
  /^discuss\b.*\bforums?\b/i,
  /^(?:join|visit)\b.*\bforums?\b/i
];

export class DailyBriefingRequestError extends Error {}

const MONTH_NAME_PATTERN = 'January|February|March|April|May|June|July|August|September|October|November|December';
const LEADING_MEDIA_CREDIT_PATTERN = new RegExp(
  `^.*?\\b(?:image|photo|picture)\\s+credits?\\s*:?\\s*.*?(?=In\\s+(?:${MONTH_NAME_PATTERN}|\\d{4})\\b)`,
  'i'
);
const TRAILING_READING_PROMPT_PATTERN = /[\s"'“”‘’|]*(?:continue|keep)\s+reading\b[\s\S]*$/i;

// This function normalizes whitespace into the compact plain-text form used by excerpts.
const normalizeWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

// This function removes a duplicated article title from the start of article text.
const removeLeadingTitle = (contentText, title) => {
  const normalizedTitle = normalizeWhitespace(title);
  if (!normalizedTitle) return contentText;

  if (!contentText.toLocaleLowerCase().startsWith(normalizedTitle.toLocaleLowerCase())) {
    return contentText;
  }

  return contentText
    .slice(normalizedTitle.length)
    .replace(/^[\s:|\-–—.!?]+/, '')
    .trim();
};

// This function removes embedded media-credit prefixes and trailing publisher prompts.
const removeBriefingBoilerplate = contentText => contentText
  .replace(LEADING_MEDIA_CREDIT_PATTERN, '')
  .replace(TRAILING_READING_PROMPT_PATTERN, '')
  .trim();

// This function splits normalized text into sentence-like segments while preserving punctuation.
const splitSentences = contentText => (
  contentText.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []
).map(normalizeWhitespace);

// This function identifies publisher credits, continuation links, and forum calls to action.
const isBriefingBoilerplate = sentence => (
  BRIEFING_BOILERPLATE_PATTERNS.some(pattern => pattern.test(sentence))
);

// This function reports whether a sentence contains enough substance for a briefing excerpt.
const isUsefulSentence = sentence => (
  !isBriefingBoilerplate(sentence) &&
  sentence.length >= MIN_USEFUL_SENTENCE_LENGTH &&
  sentence.split(/\s+/).filter(Boolean).length >= MIN_USEFUL_SENTENCE_WORDS
);

// This function truncates text at a word boundary without exceeding the excerpt maximum.
const truncateExcerpt = value => {
  if (value.length <= EXCERPT_TARGET_MAX) return value;

  const candidate = value.slice(0, EXCERPT_TARGET_MAX - 1);
  const boundary = candidate.lastIndexOf(' ');
  if (boundary < 1) return null;

  const truncated = candidate.slice(0, boundary);

  return `${truncated.replace(/[\s,;:.-]+$/, '')}…`;
};

// This function extracts one or two useful sentences for a Daily Briefing summary item.
export function extractBriefingExcerpt(contentText, title) {
  const normalizedContent = removeBriefingBoilerplate(
    removeLeadingTitle(normalizeWhitespace(contentText), title)
  );
  if (!normalizedContent) return null;

  const usefulSentences = splitSentences(normalizedContent).filter(isUsefulSentence);
  if (!usefulSentences.length) return null;

  const selectedSentences = [];
  for (const sentence of usefulSentences.slice(0, 2)) {
    selectedSentences.push(sentence);
    if (selectedSentences.join(' ').length >= EXCERPT_TARGET_MIN) break;
  }

  const excerpt = truncateExcerpt(selectedSentences.join(' '));
  return excerpt?.length >= MIN_USEFUL_SENTENCE_LENGTH ? excerpt : null;
}

// This function serializes database identifiers as numbers when they are safely representable.
const serializeId = value => {
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) ? numericValue : String(value);
};

// This function returns unique non-null identifiers while preserving their first-seen order.
const uniqueIds = values => [...new Set(values.filter(value => value !== null && value !== undefined))];

// This function normalizes and validates the supported Daily Briefing request filters.
export function resolveDailyBriefingFilters({ period, status, generatedAt = new Date() } = {}) {
  const normalizedPeriod = String(period || DEFAULT_BRIEFING_PERIOD).toLowerCase();
  const normalizedStatus = String(status || DEFAULT_BRIEFING_STATUS).toLowerCase();

  if (!BRIEFING_PERIOD_FILTERS[normalizedPeriod]) {
    throw new DailyBriefingRequestError('period must be one of: today, 24h, 7d');
  }

  if (!BRIEFING_STATUSES.has(normalizedStatus)) {
    throw new DailyBriefingRequestError('status must be one of: unread, all');
  }

  const resolvedDate = resolveDateFilterToRange(
    BRIEFING_PERIOD_FILTERS[normalizedPeriod],
    generatedAt
  );

  return {
    period: normalizedPeriod,
    status: normalizedStatus,
    generatedAt: new Date(generatedAt),
    dateFrom: resolvedDate.dateRange.start,
    dateTo: resolvedDate.dateRange.end
  };
}

// This function builds the canonical, thresholded article scope shared by Daily Briefing reads.
const buildBriefingArticleWhere = async ({
  userId,
  status,
  dateFrom,
  dateTo,
  minDistinctSources,
  showOnlyInterestMatchedArticles,
  showOnlyDevelopingEventArticles
}) => {
  const settings = await Setting.findOne({
    where: { userId },
    attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore'],
    raw: true
  });

  const where = {
    userId,
    ...canonicalArticleWhere(),
    advertisementScore: { [Op.gte]: settings?.minAdvertisementScore ?? 0 },
    sentimentScore: { [Op.gte]: settings?.minSentimentScore ?? 0 },
    qualityScore: { [Op.gte]: settings?.minQualityScore ?? 0 },
    publishedAt: { [Op.between]: [dateFrom, dateTo] }
  };

  if (status === 'unread') {
    where.status = 'unread';
  }

  return applyBriefingEligibility(where, true, {
    minDistinctSources,
    showOnlyInterestMatchedArticles,
    showOnlyDevelopingEventArticles
  });
};

// This function maps each event to its ordered structural topic identifiers.
const buildEventTopicMap = (events, eventTopicRows, validTopicIds) => {
  const validTopicIdSet = new Set(validTopicIds.map(String));
  const topicMap = new Map();

  for (const row of eventTopicRows) {
    if (!validTopicIdSet.has(String(row.topicId))) continue;
    const eventKey = String(row.eventId);
    const topicIds = topicMap.get(eventKey) || [];
    if (!topicIds.some(topicId => String(topicId) === String(row.topicId))) {
      topicIds.push(row.topicId);
    }
    topicMap.set(eventKey, topicIds);
  }

  for (const event of events) {
    if (!event.topicId || !validTopicIdSet.has(String(event.topicId))) continue;
    const eventKey = String(event.id);
    const topicIds = topicMap.get(eventKey) || [];
    if (!topicIds.some(topicId => String(topicId) === String(event.topicId))) {
      topicIds.unshift(event.topicId);
    }
    topicMap.set(eventKey, topicIds);
  }

  return topicMap;
};

// This function selects the strongest active island linked to an event's topics.
const resolveEventIsland = ({ eventId, eventTopicMap, islandLinksByTopic, islandMap }) => {
  const candidates = (eventTopicMap.get(String(eventId)) || [])
    .flatMap(topicId => islandLinksByTopic.get(String(topicId)) || [])
    .filter(link => islandMap.has(String(link.islandId)));

  candidates.sort((left, right) => {
    const confidenceDelta = Number(right.confidence || 0) - Number(left.confidence || 0);
    if (confidenceDelta) return confidenceDelta;

    const similarityDelta = Number(right.similarity || 0) - Number(left.similarity || 0);
    if (similarityDelta) return similarityDelta;

    const leftIsland = islandMap.get(String(left.islandId));
    const rightIsland = islandMap.get(String(right.islandId));
    const weightDelta = Number(rightIsland?.weight || 0) - Number(leftIsland?.weight || 0);
    if (weightDelta) return weightDelta;

    return Number(left.islandId) - Number(right.islandId);
  });

  const island = candidates.length
    ? islandMap.get(String(candidates[0].islandId))
    : null;

  return island
    ? { id: serializeId(island.id), name: island.label }
    : null;
};

// This function orders events by strength, representative publication time, and stable ID.
const compareSummaryEvents = (left, right, representativeMap) => {
  const strengthDelta = Number(right.eventStrength || 0) - Number(left.eventStrength || 0);
  if (strengthDelta) return strengthDelta;

  const leftPublishedAt = representativeMap.get(String(left.representativeArticleId))?.publishedAt;
  const rightPublishedAt = representativeMap.get(String(right.representativeArticleId))?.publishedAt;
  const publishedDelta = new Date(rightPublishedAt || 0).getTime() - new Date(leftPublishedAt || 0).getTime();
  if (publishedDelta) return publishedDelta;

  return Number(right.id) - Number(left.id);
};

// This function creates up to four unique, deterministic morning-summary items.
const buildMorningSummaryItems = ({ events, representativeMap, eventTopicMap, islandLinksByTopic, islandMap }) => {
  const items = [];
  const seenEventIds = new Set();
  const seenRepresentativeArticleIds = new Set();

  const orderedEvents = events
    .filter(event => representativeMap.has(String(event.representativeArticleId)))
    .sort((left, right) => compareSummaryEvents(left, right, representativeMap));

  for (const event of orderedEvents) {
    const eventKey = String(event.id);
    const representativeKey = String(event.representativeArticleId);
    if (seenEventIds.has(eventKey) || seenRepresentativeArticleIds.has(representativeKey)) continue;

    const representativeArticle = representativeMap.get(representativeKey);
    items.push({
      eventId: serializeId(event.id),
      representativeArticleId: serializeId(event.representativeArticleId),
      headline: normalizeWhitespace(event.name) || normalizeWhitespace(representativeArticle.title),
      text: extractBriefingExcerpt(representativeArticle.contentText, representativeArticle.title),
      island: resolveEventIsland({
        eventId: event.id,
        eventTopicMap,
        islandLinksByTopic,
        islandMap
      })
    });

    seenEventIds.add(eventKey);
    seenRepresentativeArticleIds.add(representativeKey);
    if (items.length === MAX_MORNING_SUMMARY_ITEMS) break;
  }

  return items;
};

// This function loads a structured, read-only Daily Briefing for one authenticated user.
export async function getDailyBriefing({
  userId,
  period,
  status,
  minDistinctSources = 1,
  showOnlyInterestMatchedArticles = false,
  showOnlyDevelopingEventArticles = false,
  generatedAt = new Date()
}) {
  if (!userId) {
    throw new DailyBriefingRequestError('userId is required');
  }

  const filters = resolveDailyBriefingFilters({ period, status, generatedAt });
  const articleWhere = await buildBriefingArticleWhere({
    userId,
    ...filters,
    minDistinctSources,
    showOnlyInterestMatchedArticles,
    showOnlyDevelopingEventArticles
  });
  const candidateArticles = await Article.findAll({
    where: articleWhere,
    attributes: ['id', 'eventId', 'feedId', 'topicId', 'publishedAt'],
    raw: true
  });

  const eventIds = uniqueIds(candidateArticles.map(article => article.eventId));
  const events = eventIds.length
    ? await Event.findAll({
      where: { id: { [Op.in]: eventIds }, userId },
      attributes: [
        'id',
        'name',
        'topicId',
        'representativeArticleId',
        'eventStrength',
        'createdAt'
      ],
      raw: true
    })
    : [];

  const ownedEventIds = events.map(event => event.id);
  const representativeArticleIds = uniqueIds(events.map(event => event.representativeArticleId));
  const [eventTopicRows, representativeArticles] = await Promise.all([
    ownedEventIds.length
      ? EventTopic.findAll({
        where: { eventId: { [Op.in]: ownedEventIds } },
        attributes: ['eventId', 'topicId', 'primaryInd', 'rank', 'confidence'],
        order: [
          ['eventId', 'ASC'],
          ['primaryInd', 'DESC'],
          ['rank', 'ASC'],
          ['confidence', 'DESC'],
          ['topicId', 'ASC']
        ],
        raw: true
      })
      : [],
    representativeArticleIds.length
      ? Article.findAll({
        where: {
          id: { [Op.in]: representativeArticleIds },
          userId,
          ...canonicalArticleWhere()
        },
        attributes: ['id', 'title', 'contentText', 'publishedAt'],
        raw: true
      })
      : []
  ]);

  const candidateTopicIds = uniqueIds([
    ...candidateArticles.map(article => article.topicId),
    ...events.map(event => event.topicId),
    ...eventTopicRows.map(row => row.topicId)
  ]);
  const topics = candidateTopicIds.length
    ? await Topic.findAll({
      where: { id: { [Op.in]: candidateTopicIds }, userId },
      attributes: ['id'],
      raw: true
    })
    : [];
  const validTopicIds = topics.map(topic => topic.id);
  const islandTopicRows = validTopicIds.length
    ? await IslandTopic.findAll({
      where: { topicId: { [Op.in]: validTopicIds } },
      attributes: ['islandId', 'topicId', 'similarity', 'confidence'],
      raw: true
    })
    : [];
  const islandIds = uniqueIds(islandTopicRows.map(row => row.islandId));
  const islands = islandIds.length
    ? await Island.findAll({
      where: { id: { [Op.in]: islandIds }, userId, archivedInd: false },
      attributes: ['id', 'label', 'weight'],
      raw: true
    })
    : [];

  const activeIslandIdSet = new Set(islands.map(island => String(island.id)));
  const activeIslandTopicRows = islandTopicRows.filter(row => activeIslandIdSet.has(String(row.islandId)));
  const islandLinksByTopic = new Map();
  for (const row of activeIslandTopicRows) {
    const topicKey = String(row.topicId);
    islandLinksByTopic.set(topicKey, [...(islandLinksByTopic.get(topicKey) || []), row]);
  }

  const representativeMap = new Map(
    representativeArticles.map(article => [String(article.id), article])
  );
  const islandMap = new Map(islands.map(island => [String(island.id), island]));
  const eventTopicMap = buildEventTopicMap(events, eventTopicRows, validTopicIds);
  const newEventCount = events.filter(event => {
    const createdAt = new Date(event.createdAt).getTime();
    return createdAt >= filters.dateFrom.getTime() && createdAt <= filters.dateTo.getTime();
  }).length;

  return {
    generatedAt: filters.generatedAt.toISOString(),
    filters: {
      period: filters.period,
      status: filters.status,
      minDistinctSources: Number(minDistinctSources) || 1,
      dateFrom: filters.dateFrom.toISOString()
    },
    context: {
      articleCount: candidateArticles.length,
      eventCount: events.length,
      newEventCount,
      topicCount: validTopicIds.length,
      islandCount: islands.length,
      sourceCount: uniqueIds(candidateArticles.map(article => article.feedId)).length
    },
    morningSummary: {
      items: buildMorningSummaryItems({
        events,
        representativeMap,
        eventTopicMap,
        islandLinksByTopic,
        islandMap
      })
    }
  };
}
