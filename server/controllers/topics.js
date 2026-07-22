import db from '../models/index.js';
import { Op } from 'sequelize';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

const { Article, Event, Feed, Tag, Topic } = db;

// This function fetches articles from all events in the selected topic.
const getTopicArticles = async (req, res) => {
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

    if (!event.topicId) {
      return res.status(404).json({ error: 'Topic not found for event' });
    }

    const topic = await Topic.findOne({
      where: {
        id: event.topicId,
        userId
      }
    });

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const topicEvents = await Event.findAll({
      where: {
        userId,
        topicId: topic.id
      },
      attributes: ['id']
    });
    const eventIds = topicEvents.map(topicEvent => topicEvent.id);

    const articles = await Article.findAll({
      where: {
        eventId: { [Op.in]: eventIds },
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
        },
        {
          model: Event,
          as: 'event',
          required: false,
          attributes: [
            'id',
            'articleCount',
            'sourceCount',
            'representativeArticleId',
            'developingArticleId'
          ]
        }
      ],
      order: [['publishedAt', 'DESC']]
    });

    return res.status(200).json({
      topic,
      event,
      articles
    });
  } catch (err) {
    console.error('Error in getTopicArticles:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getTopicArticles
};
