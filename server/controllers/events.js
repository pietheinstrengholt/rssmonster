import db from '../models/index.js';
import { Op } from 'sequelize';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

const { Article, Event, Feed, Tag } = db;

// This function fetches articles that belong to one event.
const getEventArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const eventId = Number(req.body?.eventId) || null;
    const articleId = Number(req.body?.articleId) || null;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' });
    }

    const event = await Event.findOne({
      where: {
        id: eventId,
        userId
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const articles = await Article.findAll({
      where: {
        eventId,
        userId,
        ...canonicalArticleWhere(),
        ...(articleId ? { id: { [Op.ne]: articleId } } : {})
      },
      include: [
        {
          model: Feed,
          required: true,
          attributes: ['id', 'feedName', 'categoryId', 'url', 'favicon']
        },
        {
          model: Tag,
          required: false,
          attributes: ['id', 'name']
        }
      ],
      order: [['published', 'DESC']]
    });

    return res.status(200).json({
      event,
      articles
    });
  } catch (err) {
    console.error('Error in getEventArticles:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getEventArticles
};
