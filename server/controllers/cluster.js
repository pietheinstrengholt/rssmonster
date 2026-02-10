import db from '../models/index.js';
const { Article, ArticleCluster, Feed, Tag } = db;

const getClusterArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const clusterId = req.params.clusterId;
    const clusterView = req.query?.clusterView || 'all';
    const requestedTopicKey = req.query?.topicKey || null;

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

    let targetClusterIds = [clusterId];
    const topicKey = requestedTopicKey || cluster.topicKey;
    if (clusterView === 'topicGroup' && topicKey) {
      const topicClusters = await ArticleCluster.findAll({
        where: {
          userId: userId,
          topicKey: topicKey
        },
        attributes: ['id']
      });
      targetClusterIds = topicClusters.map(c => c.id);
    }

    // Fetch all articles in the cluster or topic group
    const articles = await Article.findAll({
      where: {
        clusterId: targetClusterIds,
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