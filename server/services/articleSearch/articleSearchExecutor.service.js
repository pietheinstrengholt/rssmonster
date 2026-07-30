// Builds and executes Sequelize article search queries from normalized filters.
// It keeps database predicate construction separate from higher-level search orchestration.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { applyBriefingEligibility } from './briefingEligibility.service.js';

// Provides the shared dependencies used by this service.
const { Article, Event, Feed, Tag } = db;

// Converts search-language sort values to the SQL directions Sequelize/MySQL expect.
const toSqlSortDirection = sort => (
  String(sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
);

// Appends a condition to a Sequelize Op.and array, creating the array when needed.
const appendAndCondition = (whereClause, condition) => {
  whereClause[Op.and] ??= [];
  whereClause[Op.and].push(condition);
};

// Converts normalized search options into a Sequelize findAll query descriptor.
export const buildArticleSearchQuery = ({
  baseWhere,
  smartFolderSearch,
  sortRecommended,
  sortQuality,
  sortAttention,
  sortTrust,
  workingSort,
  qualityFilter,
  freshnessFilter,
  starFilter,
  unreadFilter,
  readFilter,
  clickedFilter,
  seenFilter,
  hotFilter,
  status,
  hasSearchIntent,
  event,
  islandFilter,
  briefingFilter,
  briefingMinDistinctSources,
  briefingShowOnlyInterestMatchedArticles,
  briefingShowOnlyDevelopingEventArticles,
  includeDevelopingEvents = false,
  grouping,
  eventCountFilter,
  firstSeenAgeFilter,
  authorFilter,
  languageFilter
}) => {
  // Collects the query attributes while building article search query.
  const queryAttributes = ['id', 'feedId'];

  // Derives the needs quality required while building article search query.
  const needsQuality = qualityFilter || sortQuality;
  // Derives the needs freshness required while building article search query.
  const needsFreshness = freshnessFilter || sortRecommended;
  const needsAttention = sortAttention;
  const needsInterestScore = sortRecommended;
  // Derives the needs published required while building article search query.
  const needsPublished = !smartFolderSearch || needsFreshness || sortTrust;

  // Handles the case where needs quality is available.
  if (needsQuality) {
    queryAttributes.push('advertisementScore', 'sentimentScore', 'qualityScore');
  }

  // Handles the case where needs freshness is available.
  if (needsFreshness) {
    // Handles the case where query attributes does not contain published at.
    if (!queryAttributes.includes('publishedAt')) {
      queryAttributes.push('publishedAt');
    }
    // Handles the case where query attributes does not contain quality score.
    if (!queryAttributes.includes('qualityScore')) {
      queryAttributes.push('advertisementScore', 'sentimentScore', 'qualityScore');
    }
  // Handles the case where needs published is available and query attributes does not contain published at.
  } else if (needsPublished && !queryAttributes.includes('publishedAt')) {
    queryAttributes.push('publishedAt');
  }

  // Handles the case where needs attention is available.
  if (needsAttention) {
    queryAttributes.push('attentionBucket', 'clickedAmount');
  }

  // Handles the case where needs interest score is available.
  if (needsInterestScore) {
    queryAttributes.push('interestScore');
  }

  // Builds the article query assembled while building article search query.
  const articleQuery = {
    attributes: queryAttributes,
    where: baseWhere
  };

  // Handles the case where sort recommended is available or needs quality is available or sort trust is available.
  if (sortRecommended || needsQuality || sortTrust) {
    articleQuery.include = [
      {
        model: Feed,
        attributes: ['id', 'feedTrust', 'feedDuplicationRate', 'feedAttentionSampleSize'],
        required: false
      }
    ];

    // Handles the case where sort recommended is available.
    if (sortRecommended) {
      articleQuery.include.unshift({
        model: Event,
        as: 'event',
        attributes: ['id', 'name', 'articleCount', 'eventStrength', 'sourceDiversityScore', 'sourceCount', 'topicId'],
        required: false
      });
      articleQuery.include.push({
        model: Tag,
        attributes: ['id', 'tagType'],
        required: false
      });
    }
  }

  // Handles the case where sort trust is available.
  if (sortTrust) {
    articleQuery.order = [
      [Feed, 'feedTrust', 'DESC'],
      ['publishedAt', 'DESC'],
      ['id', 'DESC']
    ];
  // Handles the case where smart folder search is unavailable and sort recommended is unavailable and sort quality is unavailable and sort attention is unavailable.
  } else if (!smartFolderSearch && !sortRecommended && !sortQuality && !sortAttention) {
    // Derives the sql sort direction through to sql sort direction while building article search query.
    const sqlSortDirection = toSqlSortDirection(workingSort);
    articleQuery.order = [
      ['publishedAt', sqlSortDirection],
      ['id', sqlSortDirection]
    ];
  }

  // Handles the case where first seen age filter is available.
  if (firstSeenAgeFilter) {
    const { value, unit } = firstSeenAgeFilter;
    // Selects the interval unit based on whether unit is h.
    const intervalUnit = unit === 'h' ? 'HOUR' : 'DAY';
    appendAndCondition(articleQuery.where, {
      [Op.or]: [
        { firstSeen: { [Op.is]: null } },
        { firstSeen: { [Op.gte]: Article.sequelize.literal(`NOW() - INTERVAL ${value} ${intervalUnit}`) } }
      ]
    });
  }

  // Handles the case where author filter is available.
  if (authorFilter) {
    articleQuery.where.author = { [Op.like]: `%${authorFilter}%` };
  }

  // Handles the case where language filter is available.
  if (languageFilter) {
    articleQuery.where.language = languageFilter;
  }

  // Handles the case where star filter is not value.
  if (starFilter !== null) {
    // Selects the result based on whether star filter is available.
    articleQuery.where.favoriteInd = starFilter ? 1 : 0;
  }

  // Handles the case where unread filter is not value.
  if (unreadFilter !== null) {
    // Selects the result based on whether unread filter is available.
    articleQuery.where.status = unreadFilter ? 'unread' : 'read';
  }

  // Handles the case where read filter is not value.
  if (readFilter !== null) {
    // Selects the result based on whether read filter is available.
    articleQuery.where.status = readFilter ? 'read' : 'unread';
  }

  // Handles the case where clicked filter is not value.
  if (clickedFilter !== null) {
    // Selects the result based on whether clicked filter is available.
    articleQuery.where.clickedAmount = clickedFilter ? { [Op.gt]: 0 } : 0;
  }

  // Handles the case where seen filter is not value.
  if (seenFilter !== null) {
    // Selects the result based on whether seen filter is available.
    articleQuery.where.firstSeen = seenFilter ? { [Op.not]: null } : { [Op.is]: null };
  }

  // Handles the case where hot filter is not value.
  if (hotFilter !== null) {
    // Selects the result based on whether hot filter is available.
    articleQuery.where.hotInd = hotFilter ? 1 : 0;
    // Handles the case where hot filter is available.
    if (hotFilter) {
      delete articleQuery.where.feedId;
    }
  }

  // Handles the case where star filter is value and unread filter is value and read filter is value and clicked filter is value and hot filter is value.
  if (starFilter === null && unreadFilter === null && readFilter === null && clickedFilter === null && hotFilter === null) {
    // Selects the effective status based on whether status is briefing or has search intent is available and value does not contain status.
    const effectiveStatus = status === 'briefing' || (hasSearchIntent && !['favorite', 'star', 'hot', 'clicked'].includes(status))
      ? '%'
      : status;

    // Handles the case where effective status is favorite or effective status is star.
    if (effectiveStatus === 'favorite' || effectiveStatus === 'star') {
      articleQuery.where.favoriteInd = 1;
    // Handles the case where effective status is hot.
    } else if (effectiveStatus === 'hot') {
      delete articleQuery.where.feedId;
      articleQuery.where.hotInd = 1;
    // Handles the case where effective status is clicked.
    } else if (effectiveStatus === 'clicked') {
      articleQuery.where.clickedAmount = { [Op.gt]: 0 };
    // Handles the case where effective status is not %.
    } else if (effectiveStatus !== '%') {
      articleQuery.where.status = effectiveStatus;
    }
  }

  // Handles the case where event is not value.
  if (event !== null) {
    // Selects the result based on whether event is available.
    articleQuery.where.eventId = event ? { [Op.not]: null } : { [Op.is]: null };
  }

  // Handles the case where island filter is not value.
  if (islandFilter !== null) {
    // Selects the island link predicate based on whether island filter is available.
    const islandLinkPredicate = islandFilter ? 'EXISTS' : 'NOT EXISTS';
    appendAndCondition(articleQuery.where, Article.sequelize.literal(`
      ${islandLinkPredicate} (
        SELECT 1
        FROM events island_event
        INNER JOIN event_topics island_event_topic
          ON island_event_topic.eventId = island_event.id
        INNER JOIN topics island_topic
          ON island_topic.id = island_event_topic.topicId
          AND island_topic.userId = articles.userId
        INNER JOIN island_topics island_membership
          ON island_membership.topicId = island_topic.id
        INNER JOIN islands interest_island
          ON interest_island.id = island_membership.islandId
          AND interest_island.userId = articles.userId
          AND interest_island.archivedInd = 0
        WHERE island_event.id = articles.eventId
          AND island_event.userId = articles.userId
      )
    `));
  }

  // Handles the case where briefing filter is not value.
  if (briefingFilter !== null) {
    applyBriefingEligibility(articleQuery.where, briefingFilter, {
      minDistinctSources: briefingMinDistinctSources,
      showOnlyInterestMatchedArticles: briefingShowOnlyInterestMatchedArticles,
      showOnlyDevelopingEventArticles: briefingShowOnlyDevelopingEventArticles
    });
  }

  // Handles the case where event count filter is finite.
  if (Number.isFinite(eventCountFilter)) {
    // Derives the count literal through literal while building article search query.
    const countLiteral = Article.sequelize.literal(
      '(SELECT e.articleCount FROM events e WHERE e.id = articles.eventId)'
    );
    appendAndCondition(articleQuery.where,
      Article.sequelize.where(countLiteral, { [Op.gte]: eventCountFilter })
    );
  }

  // Handles the case where event is value and grouping is event.
  if (event === null && grouping === 'event') {
    // Selects the selected event article column based on whether include developing events is available.
    const selectedEventArticleColumn = includeDevelopingEvents
      ? 'COALESCE(grouped_event.developingArticleId, grouped_event.representativeArticleId)'
      : 'grouped_event.representativeArticleId';

    appendAndCondition(articleQuery.where, {
      [Op.or]: [
        {
          eventId: {
            [Op.is]: null
          }
        },
        Article.sequelize.literal(`
          EXISTS (
            SELECT 1
            FROM events grouped_event
            WHERE grouped_event.id = articles.eventId
              AND grouped_event.userId = articles.userId
              AND articles.id = ${selectedEventArticleColumn}
          )
        `)
      ]
    });
  }

  // Handles the case where event is value and grouping is topic.
  if (event === null && grouping === 'topic') {
    appendAndCondition(articleQuery.where, {
      id: {
        [Op.in]: Article.sequelize.literal(`(
          SELECT e.representativeArticleId
          FROM events e
          INNER JOIN (
            SELECT userId, topicId, MAX(eventStrength) AS maxStrength
            FROM events
            WHERE topicId IS NOT NULL
            GROUP BY userId, topicId
          ) t
            ON e.userId = t.userId
            AND e.topicId = t.topicId
            AND e.eventStrength = t.maxStrength
          WHERE e.topicId IS NOT NULL
            AND e.id = (
              SELECT MAX(e2.id)
              FROM events e2
              WHERE e2.userId = e.userId
                AND e2.topicId = e.topicId
                AND e2.eventStrength = e.eventStrength
            )
        )`)
      }
    });
  }

  return articleQuery;
};

// Executes the prepared article query against the Article model.
export const executeSearch = async ({ where, include, attributes, order }) => Article.findAll({
  where,
  include,
  attributes,
  order
});

// Counts articles for a prepared query without materializing matching ids.
export const executeSearchCount = async ({ where }) => Article.count({
  where
});
