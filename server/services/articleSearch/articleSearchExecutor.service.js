// Builds and executes Sequelize article search queries from normalized filters.
// It keeps database predicate construction separate from higher-level search orchestration.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { applyBriefingEligibility } from './briefingEligibility.service.js';

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
  grouping,
  eventCountFilter,
  firstSeenAgeFilter,
  authorFilter,
  languageFilter
}) => {
  const queryAttributes = ['id', 'feedId'];

  const needsQuality = qualityFilter || sortQuality;
  const needsFreshness = freshnessFilter || sortRecommended;
  const needsAttention = sortAttention;
  const needsInterestScore = sortRecommended;
  const needsPublished = !smartFolderSearch || needsFreshness || sortTrust;

  if (needsQuality) {
    queryAttributes.push('advertisementScore', 'sentimentScore', 'qualityScore');
  }

  if (needsFreshness) {
    if (!queryAttributes.includes('publishedAt')) {
      queryAttributes.push('publishedAt');
    }
    if (!queryAttributes.includes('qualityScore')) {
      queryAttributes.push('advertisementScore', 'sentimentScore', 'qualityScore');
    }
  } else if (needsPublished && !queryAttributes.includes('publishedAt')) {
    queryAttributes.push('publishedAt');
  }

  if (needsAttention) {
    queryAttributes.push('attentionBucket', 'clickedAmount');
  }

  if (needsInterestScore) {
    queryAttributes.push('interestScore');
  }

  const articleQuery = {
    attributes: queryAttributes,
    where: baseWhere
  };

  if (sortRecommended || needsQuality || sortTrust) {
    articleQuery.include = [
      {
        model: Feed,
        attributes: ['id', 'feedTrust', 'feedDuplicationRate', 'feedAttentionSampleSize'],
        required: false
      }
    ];

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

  if (sortTrust) {
    articleQuery.order = [
      [Feed, 'feedTrust', 'DESC'],
      ['publishedAt', 'DESC'],
      ['id', 'DESC']
    ];
  } else if (!smartFolderSearch && !sortRecommended && !sortQuality && !sortAttention) {
    const sqlSortDirection = toSqlSortDirection(workingSort);
    articleQuery.order = [
      ['publishedAt', sqlSortDirection],
      ['id', sqlSortDirection]
    ];
  }

  if (firstSeenAgeFilter) {
    const { value, unit } = firstSeenAgeFilter;
    const intervalUnit = unit === 'h' ? 'HOUR' : 'DAY';
    appendAndCondition(articleQuery.where, {
      [Op.or]: [
        { firstSeen: { [Op.is]: null } },
        { firstSeen: { [Op.gte]: Article.sequelize.literal(`NOW() - INTERVAL ${value} ${intervalUnit}`) } }
      ]
    });
  }

  if (authorFilter) {
    articleQuery.where.author = { [Op.like]: `%${authorFilter}%` };
  }

  if (languageFilter) {
    articleQuery.where.language = languageFilter;
  }

  if (starFilter !== null) {
    articleQuery.where.favoriteInd = starFilter ? 1 : 0;
  }

  if (unreadFilter !== null) {
    articleQuery.where.status = unreadFilter ? 'unread' : 'read';
  }

  if (readFilter !== null) {
    articleQuery.where.status = readFilter ? 'read' : 'unread';
  }

  if (clickedFilter !== null) {
    articleQuery.where.clickedAmount = clickedFilter ? { [Op.gt]: 0 } : 0;
  }

  if (seenFilter !== null) {
    articleQuery.where.firstSeen = seenFilter ? { [Op.not]: null } : { [Op.is]: null };
  }

  if (hotFilter !== null) {
    articleQuery.where.hotInd = hotFilter ? 1 : 0;
    if (hotFilter) {
      delete articleQuery.where.feedId;
    }
  }

  if (starFilter === null && unreadFilter === null && readFilter === null && clickedFilter === null && hotFilter === null) {
    const effectiveStatus = status === 'briefing' || (hasSearchIntent && !['favorite', 'star', 'hot', 'clicked'].includes(status))
      ? '%'
      : status;

    if (effectiveStatus === 'favorite' || effectiveStatus === 'star') {
      articleQuery.where.favoriteInd = 1;
    } else if (effectiveStatus === 'hot') {
      delete articleQuery.where.feedId;
      articleQuery.where.hotInd = 1;
    } else if (effectiveStatus === 'clicked') {
      articleQuery.where.clickedAmount = { [Op.gt]: 0 };
    } else if (effectiveStatus !== '%') {
      articleQuery.where.status = effectiveStatus;
    }
  }

  if (event !== null) {
    articleQuery.where.eventId = event ? { [Op.not]: null } : { [Op.is]: null };
  }

  if (islandFilter !== null) {
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

  if (briefingFilter !== null) {
    applyBriefingEligibility(articleQuery.where, briefingFilter, {
      minDistinctSources: briefingMinDistinctSources,
      showOnlyInterestMatchedArticles: briefingShowOnlyInterestMatchedArticles,
      showOnlyDevelopingEventArticles: briefingShowOnlyDevelopingEventArticles
    });
  }

  if (Number.isFinite(eventCountFilter)) {
    const countLiteral = Article.sequelize.literal(
      '(SELECT e.articleCount FROM events e WHERE e.id = articles.eventId)'
    );
    appendAndCondition(articleQuery.where,
      Article.sequelize.where(countLiteral, { [Op.gte]: eventCountFilter })
    );
  }

  if (event === null && grouping === 'event') {
    appendAndCondition(articleQuery.where, {
      [Op.or]: [
        {
          id: {
            [Op.in]: Article.sequelize.literal('(SELECT representativeArticleId FROM events)')
          }
        },
        {
          eventId: {
            [Op.is]: null
          }
        }
      ]
    });
  }

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
