import Sequelize from 'sequelize';
import db from '../models/index.js';
import {
  buildBriefingArticleWhere,
  resolveDailyBriefingFilters
} from '../services/dailyBriefing/dailyBriefing.service.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

const { Article, BriefingPreference, Tag } = db;
const TOP_TAG_STATUSES = new Set([
  'briefing',
  'unread',
  'read',
  'favorite',
  'hot',
  'clicked'
]);

// Applies the same representative-article grouping used by article lists and overview counts.
const applyTopTagGrouping = ({ where, grouping, includeDevelopingEvents }) => {
  if (grouping === 'event') {
    const selectedEventArticleColumn = includeDevelopingEvents
      ? 'COALESCE(grouped_event.developingArticleId, grouped_event.representativeArticleId)'
      : 'grouped_event.representativeArticleId';

    where[Sequelize.Op.or] = [
      { eventId: { [Sequelize.Op.is]: null } },
      Sequelize.literal(`EXISTS (
        SELECT 1
        FROM events grouped_event
        WHERE grouped_event.id = articles.eventId
          AND grouped_event.userId = articles.userId
          AND articles.id = ${selectedEventArticleColumn}
      )`)
    ];
  }

  if (grouping === 'topic') {
    where.id = {
      [Sequelize.Op.in]: Sequelize.literal(`(
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
    };
  }
};

// Builds the canonical article predicate represented by a Top Tags status collection.
const topTagArticleWhere = async ({ userId, status }) => {
  if (status === 'briefing') {
    const preferences = await BriefingPreference.findOne({
      where: { userId },
      attributes: [
        'selectionPeriod',
        'includeOnlyUnreadArticles',
        'minDistinctSources',
        'showOnlyInterestMatchedArticles',
        'showOnlyDevelopingEventArticles'
      ],
      raw: true
    });
    const filters = resolveDailyBriefingFilters({
      period: preferences?.selectionPeriod,
      status: Number(preferences?.includeOnlyUnreadArticles) ? 'unread' : 'all'
    });

    return buildBriefingArticleWhere({
      userId,
      ...filters,
      minDistinctSources: Number(preferences?.minDistinctSources) || 1,
      showOnlyInterestMatchedArticles: Boolean(
        Number(preferences?.showOnlyInterestMatchedArticles)
      ),
      showOnlyDevelopingEventArticles: Boolean(
        Number(preferences?.showOnlyDevelopingEventArticles)
      )
    });
  }

  const where = {
    userId,
    ...canonicalArticleWhere()
  };

  if (status === 'favorite') {
    where.favoriteInd = 1;
  } else if (status === 'hot') {
    where.hotInd = 1;
  } else if (status === 'clicked') {
    where.clickedAmount = { [Sequelize.Op.gt]: 0 };
  } else {
    where.status = status;
  }

  return where;
};

// Returns the most frequent tags within the authenticated user's selected article collection.
const getTags = async (req, res) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const status = String(req.query?.status || 'unread').toLowerCase();
    if (!TOP_TAG_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Unsupported tag status' });
    }

    const articleWhere = await topTagArticleWhere({ userId, status });
    const grouping = ['event', 'topic'].includes(req.query?.grouping)
      ? req.query.grouping
      : 'none';
    applyTopTagGrouping({
      where: articleWhere,
      grouping,
      includeDevelopingEvents: req.query?.includeDevelopingEvents === 'true'
    });

    const tags = await Article.findAll({
      where: articleWhere,
      attributes: [
        [Sequelize.col('tags.name'), 'name'],
        [
          Sequelize.fn(
            'COUNT',
            Sequelize.fn('DISTINCT', Sequelize.col('articles.id'))
          ),
          'count'
        ]
      ],
      include: [{
        model: Tag,
        attributes: [],
        required: true,
        where: { userId }
      }],
      group: ['tags.name'],
      order: [
        [Sequelize.literal('count'), 'DESC'],
        [Sequelize.col('tags.name'), 'ASC']
      ],
      limit: 10,
      subQuery: false,
      raw: true
    });
    return res.status(200).json({ tags });
  } catch (err) {
    console.error('Error fetching tags:', err);
    return res.status(500).json({ error: 'Failed to fetch tags' });
  }
};

export default { getTags };
