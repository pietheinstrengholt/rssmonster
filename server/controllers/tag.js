import Sequelize from 'sequelize';
import db from '../models/index.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

const { Article, Tag } = db;
const TOP_TAG_STATUSES = new Set(['unread', 'read', 'favorite', 'hot', 'clicked']);

// Builds the canonical article predicate represented by a Top Tags status collection.
const topTagArticleWhere = ({ userId, status }) => {
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

    const articleWhere = topTagArticleWhere({ userId, status });

    const tags = await Tag.findAll({
      where: { userId },
      attributes: [
        'name',
        [
          Sequelize.fn(
            'COUNT',
            Sequelize.fn('DISTINCT', Sequelize.col('tags.articleId'))
          ),
          'count'
        ]
      ],
      include: [{
        model: Article,
        attributes: [],
        required: true,
        where: articleWhere
      }],
      group: ['tags.name'],
      order: [[Sequelize.literal('count'), 'DESC'], ['name', 'ASC']],
      limit: 10
    });
    return res.status(200).json({ tags });
  } catch (err) {
    console.error('Error fetching tags:', err);
    return res.status(500).json({ error: 'Failed to fetch tags' });
  }
};

export default { getTags };
