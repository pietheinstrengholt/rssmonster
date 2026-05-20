import db from '../models/index.js';
const { Setting } = db;

export const getSettings = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    //set default values
    let categoryId = "%";
    let feedId = "%";
    let status = "unread";
    let sort = "DESC";
    let minAdvertisementScore = 0;
    let minSentimentScore = 0;
    let minQualityScore = 0;
    let viewMode = "full";
    let clusterView = "all";

    const settings = await Setting.findOne({ where: { userId: userId }, raw: true });

    //use database values, if available
    if (settings) {
      categoryId = settings.categoryId;
      feedId = settings.feedId;
      status = settings.status;
      sort = settings.sort;
      minAdvertisementScore = settings.minAdvertisementScore || 0;
      minSentimentScore = settings.minSentimentScore || 0;
      minQualityScore = settings.minQualityScore || 0;
      viewMode = settings.viewMode || 'full';
      clusterView = settings.clusterView || 'all';
    }

    //return all query params
    return res.status(200).json({
      userId: userId,
      categoryId: categoryId,
      feedId: feedId,
      sort: sort,
      status: status,
      search: null,
      minAdvertisementScore: minAdvertisementScore,
      minSentimentScore: minSentimentScore,
      minQualityScore: minQualityScore,
      viewMode: viewMode,
      clusterView: String(clusterView),
      AIEnabled: Boolean(process.env.OPENAI_API_KEY)
    });
  } catch (err) {
    console.error('Error in getSettings:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const setSettings = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }
    const { minAdvertisementScore, minSentimentScore, minQualityScore } = req.body;

    // Validate score values (0-100)
    const validateScore = (score, name) => {
      const numScore = parseInt(score);
      if (isNaN(numScore) || numScore < 0 || numScore > 100) {
        throw new Error(`${name} must be between 0 and 100`);
      }
      return numScore;
    };

    const validatedScores = {
      minAdvertisementScore: validateScore(minAdvertisementScore, 'minAdvertisementScore'),
      minSentimentScore: validateScore(minSentimentScore, 'minSentimentScore'),
      minQualityScore: validateScore(minQualityScore, 'minQualityScore')
    };

    // Find or create settings for user
    const settings = await Setting.findOne({ where: { userId: userId } });

    if (settings) {
      console.log("Updating existing settings for user:", userId);
      console.log("Validated validatedScores:", validatedScores);
      // Update existing settings
      await settings.update(validatedScores);
    } else {
      // Create new settings
      await Setting.create({
        userId: userId,
        ...validatedScores
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Settings saved successfully',
      ...validatedScores
    });
  } catch (err) {
    console.error('Error in setSettings:', err);
    return res.status(400).json({ error: err.message });
  }
};

export const getIslandsOverview = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const islandsRaw = await db.sequelize.query(
      `
      SELECT
        i.id,
        i.userId,
        i.label,
        i.weight,
        i.archivedInd,
        i.archivedAt,
        i.updatedAt,
        COALESCE(topicStats.topicCount, 0) AS topicCount,
        COALESCE(articleStats.starredArticles, 0) AS starredArticles,
        COALESCE(articleStats.clickedArticles, 0) AS clickedArticles,
        COALESCE(articleStats.relatedArticleCount, 0) AS relatedArticleCount
      FROM islands i
      LEFT JOIN (
        SELECT
          it.islandId,
          COUNT(DISTINCT it.topicId) AS topicCount
        FROM island_topics it
        INNER JOIN islands i2
          ON i2.id = it.islandId
         AND i2.userId = :userId
        GROUP BY it.islandId
      ) topicStats
        ON topicStats.islandId = i.id
      LEFT JOIN (
        SELECT
          it.islandId,
          COUNT(DISTINCT CASE WHEN a.starInd = 1 THEN a.id END) AS starredArticles,
          COUNT(DISTINCT CASE WHEN a.clickedAmount > 0 THEN a.id END) AS clickedArticles,
          COUNT(DISTINCT a.id) AS relatedArticleCount
        FROM island_topics it
        INNER JOIN islands i3
          ON i3.id = it.islandId
         AND i3.userId = :userId
        INNER JOIN article_topics atp
          ON atp.topicId = it.topicId
        INNER JOIN articles a
          ON a.id = atp.articleId
         AND a.userId = :userId
        GROUP BY it.islandId
      ) articleStats
        ON articleStats.islandId = i.id
      WHERE i.userId = :userId
      ORDER BY i.archivedInd ASC, i.weight DESC, i.id DESC
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const islands = [];

    for (const island of islandsRaw) {
      const relatedArticles = await db.sequelize.query(
        `
        SELECT DISTINCT
          a.id,
          a.title,
          a.url,
          a.published,
          a.starInd,
          a.clickedAmount,
          f.feedName
        FROM island_topics it
        INNER JOIN islands i
          ON i.id = it.islandId
         AND i.userId = :userId
        INNER JOIN article_topics atp
          ON atp.topicId = it.topicId
        INNER JOIN articles a
          ON a.id = atp.articleId
         AND a.userId = :userId
        LEFT JOIN feeds f
          ON f.id = a.feedId
         AND f.userId = :userId
        WHERE it.islandId = :islandId
        ORDER BY a.published DESC
        LIMIT 3
        `,
        {
          replacements: { userId, islandId: island.id },
          type: db.Sequelize.QueryTypes.SELECT
        }
      );

      const starCount = Number(island.starredArticles || 0);
      const clickCount = Number(island.clickedArticles || 0);

      islands.push({
        ...island,
        effectiveWeight: Number(island.weight || 0),
        starCount,
        clickCount,
        interactionCount: starCount + clickCount,
        relatedArticles
      });
    }

    const [totalsRaw] = await db.sequelize.query(
      `
      SELECT
        COALESCE(COUNT(DISTINCT CASE WHEN i.archivedInd = 0 THEN i.id END), 0) AS islandCount,
        COALESCE(COUNT(DISTINCT CASE WHEN i.archivedInd = 0 THEN a.id END), 0) AS islandArticles,
        COALESCE((SELECT COUNT(*) FROM articles a2 WHERE a2.userId = :userId), 0) AS totalArticles
      FROM islands i
      LEFT JOIN island_topics it
        ON it.islandId = i.id
      LEFT JOIN article_topics atp
        ON atp.topicId = it.topicId
      LEFT JOIN articles a
        ON a.id = atp.articleId
       AND a.userId = :userId
      WHERE i.userId = :userId
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const islandCount = Number(totalsRaw?.islandCount || 0);
    const islandArticles = Number(totalsRaw?.islandArticles || 0);
    const totalArticles = Number(totalsRaw?.totalArticles || 0);
    const nonIslandArticles = Math.max(0, totalArticles - islandArticles);
    const islandCoveragePercent = totalArticles
      ? Number(((islandArticles / totalArticles) * 100).toFixed(1))
      : 0;
    const nonIslandCoveragePercent = Number((100 - islandCoveragePercent).toFixed(1));

    return res.status(200).json({
      userId,
      count: islands.length,
      totals: {
        islandCount,
        islandArticles,
        nonIslandArticles,
        totalArticles,
        islandCoveragePercent,
        nonIslandCoveragePercent
      },
      islands
    });
  } catch (err) {
    console.error('Error in getIslandsOverview:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getSettings,
  setSettings,
  getIslandsOverview
}