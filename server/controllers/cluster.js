import db from '../models/index.js';
const { Article, ArticleCluster, Feed, Tag } = db;
import { Op } from 'sequelize';

const getClusterArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const clusterId = req.body?.clusterId;
    const clusterView = req.body?.clusterView || 'all';
    const requestedTopicKey = req.body?.topicKey || null;
    const articleId = Number(req.body?.articleId) || null;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!clusterId) {
      return res.status(400).json({ error: 'clusterId is required' });
    }

    // Verify cluster exists and belongs to the user
    const cluster = await ArticleCluster.findOne({
      where: {
        id: clusterId,
        userId: userId
      }
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const topicKey = requestedTopicKey || cluster.topicKey;

    let articles = [];
    if (clusterView === 'topicGroup' && topicKey) {
      const topicClusters = await ArticleCluster.findAll({
        where: {
          userId: userId,
          topicKey: topicKey
        },
        attributes: ['representativeArticleId', 'clusterStrength'],
        order: [['clusterStrength', 'DESC']]
      });

      const representativeIds = topicClusters
        .map(c => c.representativeArticleId)
        .filter(id => Number.isFinite(id))
        .filter(id => (articleId ? id !== articleId : true));

      if (representativeIds.length) {
        const idIndexMap = new Map(
          representativeIds.map((id, index) => [Number(id), index])
        );

        articles = await Article.findAll({
          where: {
            id: representativeIds,
            userId: userId
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
          ]
        });

        articles.sort(
          (a, b) => idIndexMap.get(Number(a.id)) - idIndexMap.get(Number(b.id))
        );
      }
    } else {
      // Fetch all articles in the cluster
      articles = await Article.findAll({
        where: {
          clusterId: clusterId,
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
    }

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