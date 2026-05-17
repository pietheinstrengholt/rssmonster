import db from '../models/index.js';
const { Article, Event, Feed, Tag } = db;
import { Op } from 'sequelize';

const getClusterArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const eventId = req.body?.clusterId;
    const clusterView = req.body?.clusterView || 'all';
    const requestedTopicId = Number(req.body?.topicId) || null;
    const articleId = Number(req.body?.articleId) || null;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!eventId) {
      return res.status(400).json({ error: 'clusterId is required' });
    }

    // Verify event exists and belongs to the user
    const cluster = await Event.findOne({
      where: {
        id: eventId,
        userId: userId
      }
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    let targetClusterIds = [eventId];
    const topicId = cluster.topicId || requestedTopicId;
    if (clusterView === 'topicGroup' && topicId) {
      const topicClusters = await Event.findAll({
        where: {
          userId: userId,
          topicId: topicId
        },
        attributes: ['id']
      });
      if (topicClusters.length) {
        targetClusterIds = topicClusters.map(c => c.id);
      }
    }

    // Fetch all articles in the cluster or topic group
    const articles = await Article.findAll({
      where: {
        eventId: targetClusterIds,
        userId: userId,
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
      cluster: cluster,
      articles: articles
    });
  } catch (err) {
    console.error('Error fetching cluster articles:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getClusterArticles
};