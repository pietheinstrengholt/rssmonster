import db from '../../models/index.js';
import { Op } from 'sequelize';
import { resolveDateFilterToRange } from '../articleSearch/articleDateParser.service.js';
import { applyBriefingEligibility } from '../articleSearch/briefingEligibility.service.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

// Provides the shared dependencies used by this service.
const {
  Article,
  Event,
  EventTopic,
  Island,
  IslandTopic,
  Setting,
  Topic
} = db;

// Defines the briefing period filters enforced by this service.
const BRIEFING_PERIOD_FILTERS = {
  today: { type: 'today' },
  '24h': { type: 'today' },
  '7d': { type: 'lastweek' }
};
// Defines the briefing statuses enforced by this service.
const BRIEFING_STATUSES = new Set(['all', 'unread']);
// Defines the default briefing period enforced by this service.
const DEFAULT_BRIEFING_PERIOD = '7d';
// Defines the default briefing status enforced by this service.
const DEFAULT_BRIEFING_STATUS = 'all';
// Defines the max morning summary items enforced by this service.
const MAX_MORNING_SUMMARY_ITEMS = 4;
// Defines the min useful sentence length enforced by this service.
const MIN_USEFUL_SENTENCE_LENGTH = 25;
// Defines the min useful sentence words enforced by this service.
const MIN_USEFUL_SENTENCE_WORDS = 4;
// Defines the excerpt target min enforced by this service.
const EXCERPT_TARGET_MIN = 160;
// Defines the excerpt target max enforced by this service.
const EXCERPT_TARGET_MAX = 280;
// Defines the briefing boilerplate patterns enforced by this service.
const BRIEFING_BOILERPLATE_PATTERNS = [
  /\b(?:image|photo|picture)\s+credits?\b/i,
  /^(?:continue|keep)\s+reading\b/i,
  /^read\s+(?:more|the\s+(?:full|original)\b)/i,
  /^discuss\b.*\bforums?\b/i,
  /^(?:join|visit)\b.*\bforums?\b/i
];

export class DailyBriefingRequestError extends Error {}

// Defines the month name pattern enforced by this service.
const MONTH_NAME_PATTERN = 'January|February|March|April|May|June|July|August|September|October|November|December';
// Defines the leading media credit pattern enforced by this service.
const LEADING_MEDIA_CREDIT_PATTERN = new RegExp(
  `^.*?\\b(?:image|photo|picture)\\s+credits?\\s*:?\\s*.*?(?=In\\s+(?:${MONTH_NAME_PATTERN}|\\d{4})\\b)`,
  'i'
);
// Defines the trailing reading prompt pattern enforced by this service.
const TRAILING_READING_PROMPT_PATTERN = /[\s"'“”‘’|]*(?:continue|keep)\s+reading\b[\s\S]*$/i;

// This function normalizes whitespace into the compact plain-text form used by excerpts.
const normalizeWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

// This function removes a duplicated article title from the start of article text.
const removeLeadingTitle = (contentText, title) => {
  // Normalizes the title before performing remove leading title.
  const normalizedTitle = normalizeWhitespace(title);
  // Returns early when normalized title is unavailable.
  if (!normalizedTitle) return contentText;

  // Returns early when starts with is unavailable.
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
  // Returns early when value count is at most excerpt target max.
  if (value.length <= EXCERPT_TARGET_MAX) return value;

  // Derives the candidate through slice while performing truncate excerpt.
  const candidate = value.slice(0, EXCERPT_TARGET_MAX - 1);
  // Derives the boundary through last index of while performing truncate excerpt.
  const boundary = candidate.lastIndexOf(' ');
  // Returns no result when boundary is below 1.
  if (boundary < 1) return null;

  // Derives the truncated through slice while performing truncate excerpt.
  const truncated = candidate.slice(0, boundary);

  return `${truncated.replace(/[\s,;:.-]+$/, '')}…`;
};

// This function extracts one or two useful sentences for a Daily Briefing summary item.
export function extractBriefingExcerpt(contentText, title) {
  // Derives the normalized content through remove briefing boilerplate while extracting briefing excerpt.
  const normalizedContent = removeBriefingBoilerplate(
    removeLeadingTitle(normalizeWhitespace(contentText), title)
  );
  // Returns no result when normalized content is unavailable.
  if (!normalizedContent) return null;

  // Keeps the useful sentences entries eligible while extracting briefing excerpt.
  const usefulSentences = splitSentences(normalizedContent).filter(isUsefulSentence);
  // Returns no result when useful sentences is empty.
  if (!usefulSentences.length) return null;

  // Collects the selected sentences while extracting briefing excerpt.
  const selectedSentences = [];
  // Processes each slice entry in turn.
  for (const sentence of usefulSentences.slice(0, 2)) {
    selectedSentences.push(sentence);
    // Stops collecting values when join count reaches excerpt target min.
    if (selectedSentences.join(' ').length >= EXCERPT_TARGET_MIN) break;
  }

  // Derives the excerpt through truncate excerpt while extracting briefing excerpt.
  const excerpt = truncateExcerpt(selectedSentences.join(' '));
  // Selects the result based on whether length reaches min useful sentence length.
  return excerpt?.length >= MIN_USEFUL_SENTENCE_LENGTH ? excerpt : null;
}

// This function serializes database identifiers as numbers when they are safely representable.
const serializeId = value => {
  // Coerces the numeric value into the representation required while performing serialize id.
  const numericValue = Number(value);
  // Selects the result based on whether numeric value is safe integer.
  return Number.isSafeInteger(numericValue) ? numericValue : String(value);
};

// This function returns unique non-null identifiers while preserving their first-seen order.
const uniqueIds = values => [...new Set(values.filter(value => value !== null && value !== undefined))];

// This function normalizes and validates the supported Daily Briefing request filters.
export function resolveDailyBriefingFilters({ period, status, generatedAt = new Date() } = {}) {
  // Normalizes the period before resolving daily briefing filters.
  const normalizedPeriod = String(period || DEFAULT_BRIEFING_PERIOD).toLowerCase();
  // Normalizes the status before resolving daily briefing filters.
  const normalizedStatus = String(status || DEFAULT_BRIEFING_STATUS).toLowerCase();

  // Rejects processing when briefing period filters normalized period is unavailable.
  if (!BRIEFING_PERIOD_FILTERS[normalizedPeriod]) {
    throw new DailyBriefingRequestError('period must be one of: today, 24h, 7d');
  }

  // Rejects processing when briefing statuses does not contain normalized status.
  if (!BRIEFING_STATUSES.has(normalizedStatus)) {
    throw new DailyBriefingRequestError('status must be one of: unread, all');
  }

  // Resolves the date filter to range while resolving daily briefing filters.
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
  // Loads the settings needed while building briefing article where.
  const settings = await Setting.findOne({
    where: { userId },
    attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore'],
    raw: true
  });

  // Builds the where assembled while building briefing article where.
  const where = {
    userId,
    ...canonicalArticleWhere(),
    advertisementScore: { [Op.gte]: settings?.minAdvertisementScore ?? 0 },
    sentimentScore: { [Op.gte]: settings?.minSentimentScore ?? 0 },
    qualityScore: { [Op.gte]: settings?.minQualityScore ?? 0 },
    publishedAt: { [Op.between]: [dateFrom, dateTo] }
  };

  // Handles the case where status is unread.
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
  // Tracks distinct valid topic id set while building event topic map.
  const validTopicIdSet = new Set(validTopicIds.map(String));
  // Indexes topic entries for efficient lookup.
  const topicMap = new Map();

  // Processes each event topic rows entry in turn.
  for (const row of eventTopicRows) {
    // Skips the current entry when valid topic id set does not contain string.
    if (!validTopicIdSet.has(String(row.topicId))) continue;
    // Coerces the event key into the representation required while building event topic map.
    const eventKey = String(row.eventId);
    // Derives the topic id required while building event topic map.
    const topicIds = topicMap.get(eventKey) || [];
    // Handles the case where some is unavailable.
    if (!topicIds.some(topicId => String(topicId) === String(row.topicId))) {
      topicIds.push(row.topicId);
    }
    topicMap.set(eventKey, topicIds);
  }

  // Processes each events entry in turn.
  for (const event of events) {
    // Skips the current entry when event topic id is unavailable or valid topic id set does not contain string.
    if (!event.topicId || !validTopicIdSet.has(String(event.topicId))) continue;
    // Coerces the event key into the representation required while building event topic map.
    const eventKey = String(event.id);
    // Derives the topic id required while building event topic map.
    const topicIds = topicMap.get(eventKey) || [];
    // Handles the case where some is unavailable.
    if (!topicIds.some(topicId => String(topicId) === String(event.topicId))) {
      topicIds.unshift(event.topicId);
    }
    topicMap.set(eventKey, topicIds);
  }

  return topicMap;
};

// This function selects the strongest active island linked to an event's topics.
const resolveEventIsland = ({ eventId, eventTopicMap, islandLinksByTopic, islandMap }) => {
  // Keeps the candidates entries eligible while resolving event island.
  const candidates = (eventTopicMap.get(String(eventId)) || [])
    .flatMap(topicId => islandLinksByTopic.get(String(topicId)) || [])
    .filter(link => islandMap.has(String(link.islandId)));

  // Orders values deterministically while resolving event island.
  candidates.sort((left, right) => {
    // Derives the confidence delta required while resolving event island.
    const confidenceDelta = Number(right.confidence || 0) - Number(left.confidence || 0);
    // Returns early when confidence delta is available.
    if (confidenceDelta) return confidenceDelta;

    // Derives the similarity delta required while resolving event island.
    const similarityDelta = Number(right.similarity || 0) - Number(left.similarity || 0);
    // Returns early when similarity delta is available.
    if (similarityDelta) return similarityDelta;

    // Derives the left island through get while resolving event island.
    const leftIsland = islandMap.get(String(left.islandId));
    // Derives the right island through get while resolving event island.
    const rightIsland = islandMap.get(String(right.islandId));
    // Derives the weight delta required while resolving event island.
    const weightDelta = Number(rightIsland?.weight || 0) - Number(leftIsland?.weight || 0);
    // Returns early when weight delta is available.
    if (weightDelta) return weightDelta;

    return Number(left.islandId) - Number(right.islandId);
  });

  // Selects the island based on whether candidates is non-empty.
  const island = candidates.length
    ? islandMap.get(String(candidates[0].islandId))
    : null;

  // Selects the result based on whether island is available.
  return island
    ? { id: serializeId(island.id), name: island.label }
    : null;
};

// This function orders events by strength, representative publication time, and stable ID.
const compareSummaryEvents = (left, right, representativeMap) => {
  // Derives the strength delta required while performing compare summary events.
  const strengthDelta = Number(right.eventStrength || 0) - Number(left.eventStrength || 0);
  // Returns early when strength delta is available.
  if (strengthDelta) return strengthDelta;

  const leftPublishedAt = representativeMap.get(String(left.representativeArticleId))?.publishedAt;
  const rightPublishedAt = representativeMap.get(String(right.representativeArticleId))?.publishedAt;
  // Derives the published delta required while performing compare summary events.
  const publishedDelta = new Date(rightPublishedAt || 0).getTime() - new Date(leftPublishedAt || 0).getTime();
  // Returns early when published delta is available.
  if (publishedDelta) return publishedDelta;

  return Number(right.id) - Number(left.id);
};

// This function creates up to four unique, deterministic morning-summary items.
const buildMorningSummaryItems = ({ events, representativeMap, eventTopicMap, islandLinksByTopic, islandMap }) => {
  // Collects the items while building morning summary items.
  const items = [];
  // Tracks distinct seen event id while building morning summary items.
  const seenEventIds = new Set();
  // Tracks distinct seen representative article id while building morning summary items.
  const seenRepresentativeArticleIds = new Set();

  // Derives the ordered events through sort while building morning summary items.
  const orderedEvents = events
    .filter(event => representativeMap.has(String(event.representativeArticleId)))
    .sort((left, right) => compareSummaryEvents(left, right, representativeMap));

  // Processes each ordered events entry in turn.
  for (const event of orderedEvents) {
    // Coerces the event key into the representation required while building morning summary items.
    const eventKey = String(event.id);
    // Coerces the representative key into the representation required while building morning summary items.
    const representativeKey = String(event.representativeArticleId);
    // Skips the current entry when seen event id contains event key or seen representative article id contains representative key.
    if (seenEventIds.has(eventKey) || seenRepresentativeArticleIds.has(representativeKey)) continue;

    // Derives the representative article through get while building morning summary items.
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
    // Stops collecting values when items count is max morning summary items.
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
  // Rejects processing when user id is unavailable.
  if (!userId) {
    throw new DailyBriefingRequestError('userId is required');
  }

  // Resolves the daily briefing filters while performing get daily briefing.
  const filters = resolveDailyBriefingFilters({ period, status, generatedAt });
  // Builds the briefing article where while performing get daily briefing.
  const articleWhere = await buildBriefingArticleWhere({
    userId,
    ...filters,
    minDistinctSources,
    showOnlyInterestMatchedArticles,
    showOnlyDevelopingEventArticles
  });
  // Loads the candidate articles needed while performing get daily briefing.
  const candidateArticles = await Article.findAll({
    where: articleWhere,
    attributes: ['id', 'eventId', 'feedId', 'topicId', 'publishedAt'],
    raw: true
  });

  // Derives the event id through unique id while performing get daily briefing.
  const eventIds = uniqueIds(candidateArticles.map(article => article.eventId));
  // Selects the events based on whether event id is non-empty.
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

  // Transforms source values into the owned event id required while performing get daily briefing.
  const ownedEventIds = events.map(event => event.id);
  // Derives the representative article id through unique id while performing get daily briefing.
  const representativeArticleIds = uniqueIds(events.map(event => event.representativeArticleId));
  // Selects the values based on whether owned event id is non-empty.
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

  // Derives the candidate topic id through unique id while performing get daily briefing.
  const candidateTopicIds = uniqueIds([
    ...candidateArticles.map(article => article.topicId),
    ...events.map(event => event.topicId),
    ...eventTopicRows.map(row => row.topicId)
  ]);
  // Selects the topics based on whether candidate topic id is non-empty.
  const topics = candidateTopicIds.length
    ? await Topic.findAll({
      where: { id: { [Op.in]: candidateTopicIds }, userId },
      attributes: ['id'],
      raw: true
    })
    : [];
  // Transforms source values into the valid topic id required while performing get daily briefing.
  const validTopicIds = topics.map(topic => topic.id);
  // Selects the island topic rows based on whether valid topic id is non-empty.
  const islandTopicRows = validTopicIds.length
    ? await IslandTopic.findAll({
      where: { topicId: { [Op.in]: validTopicIds } },
      attributes: ['islandId', 'topicId', 'similarity', 'confidence'],
      raw: true
    })
    : [];
  // Derives the island id through unique id while performing get daily briefing.
  const islandIds = uniqueIds(islandTopicRows.map(row => row.islandId));
  // Selects the islands based on whether island id is non-empty.
  const islands = islandIds.length
    ? await Island.findAll({
      where: { id: { [Op.in]: islandIds }, userId, archivedInd: false },
      attributes: ['id', 'label', 'weight'],
      raw: true
    })
    : [];

  // Tracks distinct active island id set while performing get daily briefing.
  const activeIslandIdSet = new Set(islands.map(island => String(island.id)));
  // Keeps the active island topic rows entries eligible while performing get daily briefing.
  const activeIslandTopicRows = islandTopicRows.filter(row => activeIslandIdSet.has(String(row.islandId)));
  // Derives the island links by topic required while performing get daily briefing.
  const islandLinksByTopic = new Map();
  // Processes each active island topic rows entry in turn.
  for (const row of activeIslandTopicRows) {
    // Coerces the topic key into the representation required while performing get daily briefing.
    const topicKey = String(row.topicId);
    islandLinksByTopic.set(topicKey, [...(islandLinksByTopic.get(topicKey) || []), row]);
  }

  // Indexes representative entries for efficient lookup.
  const representativeMap = new Map(
    representativeArticles.map(article => [String(article.id), article])
  );
  // Indexes island entries for efficient lookup.
  const islandMap = new Map(islands.map(island => [String(island.id), island]));
  // Builds the event topic map while performing get daily briefing.
  const eventTopicMap = buildEventTopicMap(events, eventTopicRows, validTopicIds);
  // Filters source values to the entries eligible while performing get daily briefing.
  const newEventCount = events.filter(event => {
    // Derives the created at through get time while performing get daily briefing.
    const createdAt = new Date(event.createdAt).getTime();
    return createdAt >= filters.dateFrom.getTime() && createdAt <= filters.dateTo.getTime();
  }).length;

  // Maps source values into the result produced while performing get daily briefing.
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
