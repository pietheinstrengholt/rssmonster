import Sequelize from 'sequelize';
import db from '../models/index.js';
import {
  buildBriefingArticleWhere,
  resolveDailyBriefingFilters
} from '../services/dailyBriefing/dailyBriefing.service.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import { normalizeTagName } from '../services/crawl/persistence/tags.js';

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

};

// Builds the canonical article predicate represented by a Top Tags status collection.
const topTagArticleWhere = async ({ userId, status }) => {
  if (status === 'briefing') {
    const preferences = await BriefingPreference.findOne({
      where: { userId },
      attributes: [
        'selectionPeriod',
        'includeHotArticles',
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
      includeHotArticles: Boolean(Number(preferences?.includeHotArticles ?? true)),
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

    const hasSearch = req.query?.search !== undefined;
    if (req.query?.scope !== undefined && req.query.scope !== 'all') {
      return res.status(400).json({ error: 'Unsupported tag scope' });
    }
    if (hasSearch && (typeof req.query.search !== 'string' || normalizeTagName(req.query.search).length > 255)) {
      return res.status(400).json({ error: 'search must be a string of up to 255 characters' });
    }
    // The default remains the sidebar snapshot; all names support article tag selection.
    if (req.query?.scope === 'all' || hasSearch) {
      const search = hasSearch ? normalizeTagName(req.query.search) : '';
      const maxLimit = hasSearch ? 50 : 100;
      const limit = Number(req.query.limit ?? (hasSearch ? 20 : 100));
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit ||
        !Number.isSafeInteger(offset) || offset < 0) {
        return res.status(400).json({ error: `limit must be 1 to ${maxLimit} and offset must be a non-negative integer` });
      }
      const tags = await Tag.findAll({
        where: {
          userId,
          // Literal substring matching avoids treating a tag's % or _ as a wildcard.
          ...(search ? { [Sequelize.Op.and]: Sequelize.where(
            Sequelize.fn('INSTR', Sequelize.col('tags.name'), search), { [Sequelize.Op.gt]: 0 }
          ) } : {})
        },
        attributes: ['name'],
        include: [{ model: Article, attributes: [], required: true, where: { userId } }],
        group: ['tags.name'],
        // Keep an exact existing name inside the bounded result, even with many substring matches.
        order: [...(search ? [[Sequelize.where(Sequelize.col('tags.name'), { [Sequelize.Op.eq]: search }), 'DESC']] : []), ['name', 'ASC']],
        limit: limit + 1,
        offset,
        subQuery: false,
        raw: true
      });
      return res.status(200).json({ tags: tags.slice(0, limit), hasMore: tags.length > limit });
    }

    const status = String(req.query?.status || 'unread').toLowerCase();
    if (!TOP_TAG_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Unsupported tag status' });
    }

    const articleWhere = await topTagArticleWhere({ userId, status });
    const grouping = ['event'].includes(req.query?.grouping)
      ? req.query.grouping
      : 'none';
    applyTopTagGrouping({
      where: articleWhere,
      grouping,
      includeDevelopingEvents: req.query?.includeDevelopingEvents === 'true'
    });

    const tags = await Article.findAll({
      where: articleWhere,
      // Read collections benefit from the covering visibility index instead of fetching every owned Article row.
      ...(status === 'read' && db.sequelize.getDialect() === 'mysql' ? {
        indexHints: [{ type: Sequelize.IndexHints.USE, values: ['articles_user_status_visible_event_idx'] }]
      } : {}),
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
