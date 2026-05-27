import db from '../models/index.js';
import { Op } from 'sequelize';

const { Article, Event, Feed, Tag } = db;

const appendAndCondition = (whereClause, condition) => {
  whereClause[Op.and] ??= [];
  whereClause[Op.and].push(condition);
};

export const buildArticleSearchQuery = ({
  baseWhere,
  smartFolderSearch,
  sortRecommended,
  sortQuality,
  sortAttention,
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
  rawSearch,
  clusterFilter,
  clusterView,
  clusterCountFilter,
  firstSeenAgeFilter
}) => {
  const queryAttributes = ['id'];

  const needsQuality = qualityFilter || sortQuality;
  const needsFreshness = freshnessFilter || sortRecommended;
  const needsAttention = sortAttention;
  const needsPublished = !smartFolderSearch || needsFreshness;

  if (needsQuality) {
    queryAttributes.push('advertisementScore', 'sentimentScore', 'qualityScore');
  }

  if (needsFreshness) {
    if (!queryAttributes.includes('published')) {
      queryAttributes.push('published');
    }
    if (!queryAttributes.includes('qualityScore')) {
      queryAttributes.push('advertisementScore', 'sentimentScore', 'qualityScore');
    }
  } else if (needsPublished && !queryAttributes.includes('published')) {
    queryAttributes.push('published');
  }

  if (needsAttention) {
    queryAttributes.push('attentionBucket', 'clickedAmount');
  }

  const articleQuery = {
    attributes: queryAttributes,
    where: baseWhere
  };

  if (sortRecommended) {
    articleQuery.include = [
      {
        model: Event,
        as: 'cluster',
        attributes: ['id', 'name', 'articleCount', 'eventStrength', 'sourceDiversityScore', 'sourceCount', 'topicId'],
        required: false
      },
      {
        model: Feed,
        attributes: ['id', 'feedTrust'],
        required: false
      },
      {
        model: Tag,
        attributes: ['id', 'tagType'],
        required: false
      }
    ];
  }

  if (!smartFolderSearch && !sortRecommended && !sortQuality && !sortAttention) {
    articleQuery.order = [['published', workingSort]];
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

  if (starFilter !== null) {
    articleQuery.where.starInd = starFilter ? 1 : 0;
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
    articleQuery.where.firstSeen = seenFilter ? { [Op.is]: null } : { [Op.not]: null };
  }

  if (hotFilter !== null) {
    articleQuery.where.hotInd = hotFilter ? 1 : 0;
    if (hotFilter) {
      delete articleQuery.where.feedId;
    }
  }

  if (starFilter === null && unreadFilter === null && readFilter === null && clickedFilter === null && hotFilter === null) {
    const effectiveStatus = rawSearch && !['star', 'hot', 'clicked'].includes(status) ? '%' : status;

    if (effectiveStatus === 'star') {
      articleQuery.where.starInd = 1;
    } else if (effectiveStatus === 'hot') {
      delete articleQuery.where.feedId;
      articleQuery.where.hotInd = 1;
    } else if (effectiveStatus === 'clicked') {
      articleQuery.where.clickedAmount = { [Op.gt]: 0 };
    } else if (effectiveStatus !== '%') {
      articleQuery.where.status = effectiveStatus;
    }
  }

  const workingClusterView = clusterFilter !== null ? clusterFilter : clusterView;
  if (Number.isFinite(clusterCountFilter)) {
    const countLiteral = Article.sequelize.literal(
      '(SELECT e.articleCount FROM events e WHERE e.id = articles.eventId)'
    );
    appendAndCondition(articleQuery.where,
      Article.sequelize.where(countLiteral, { [Op.gte]: clusterCountFilter })
    );
  }

  if (workingClusterView === 'eventCluster') {
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

  return articleQuery;
};

export const executeSearch = async ({ where, include, attributes, order }) => Article.findAll({
  where,
  include,
  attributes,
  order
});
