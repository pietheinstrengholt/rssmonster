import db from '../models/index.js';
const { Island, Setting } = db;

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

    const islandsRaw = await Island.findAll({
      attributes: [
        'id',
        'userId',
        'label',
        'weight',
        'populationAudit',
        'archivedInd',
        'archivedAt',
        'updatedAt'
      ],
      where: { userId },
      order: [
        ['archivedInd', 'ASC'],
        ['weight', 'DESC'],
        ['id', 'DESC']
      ],
      raw: true
    });

    const islands = [];

    for (const island of islandsRaw) {
      const [islandStats] = await db.sequelize.query(
        `
        SELECT
          COALESCE((SELECT COUNT(*) FROM island_topics it WHERE it.islandId = :islandId), 0) AS topicCount,
          COALESCE((
            SELECT COUNT(*)
            FROM articles a
            WHERE a.userId = :userId
              AND a.starInd = 1
              AND EXISTS (
                SELECT 1
                FROM article_topics atp
                INNER JOIN island_topics it
                  ON it.topicId = atp.topicId
                 AND it.islandId = :islandId
                WHERE atp.articleId = a.id
              )
          ), 0) AS starredArticles,
          COALESCE((
            SELECT COUNT(*)
            FROM articles a
            WHERE a.userId = :userId
              AND a.clickedAmount > 0
              AND EXISTS (
                SELECT 1
                FROM article_topics atp
                INNER JOIN island_topics it
                  ON it.topicId = atp.topicId
                 AND it.islandId = :islandId
                WHERE atp.articleId = a.id
              )
          ), 0) AS clickedArticles,
          COALESCE((
            SELECT COUNT(*)
            FROM articles a
            WHERE a.userId = :userId
              AND EXISTS (
                SELECT 1
                FROM article_topics atp
                INNER JOIN island_topics it
                  ON it.topicId = atp.topicId
                 AND it.islandId = :islandId
                WHERE atp.articleId = a.id
              )
          ), 0) AS relatedArticleCount
        `,
        {
          replacements: { userId, islandId: island.id },
          type: db.Sequelize.QueryTypes.SELECT
        }
      );

      const relatedArticles = await db.sequelize.query(
        `
        SELECT
          a.id,
          a.title,
          a.url,
          a.published,
          a.starInd,
          a.clickedAmount,
          f.feedName
        FROM articles a
        LEFT JOIN feeds f
          ON f.id = a.feedId
         AND f.userId = :userId
        WHERE a.userId = :userId
          AND EXISTS (
            SELECT 1
            FROM article_topics atp
            INNER JOIN island_topics it
              ON it.topicId = atp.topicId
             AND it.islandId = :islandId
            WHERE atp.articleId = a.id
          )
        ORDER BY a.published DESC
        LIMIT 3
        `,
        {
          replacements: { userId, islandId: island.id },
          type: db.Sequelize.QueryTypes.SELECT
        }
      );

      const populationAudit = Array.isArray(island.populationAudit)
        ? island.populationAudit
        : (typeof island.populationAudit === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(island.populationAudit);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : []);

      const populationSourceArticleIds = [...new Set(
        populationAudit.flatMap(entry => {
          const source = entry?.sourceArticles || {};
          const starred = Array.isArray(source.starredArticleIds) ? source.starredArticleIds : [];
          const clicked = Array.isArray(source.clickedArticleIds) ? source.clickedArticleIds : [];
          const negative = Array.isArray(source.negativeArticleIds) ? source.negativeArticleIds : [];
          const articles = Array.isArray(source.articles) ? source.articles.map(article => article.id) : [];
          return [...starred, ...clicked, ...negative, ...articles]
            .map(Number)
            .filter(Number.isFinite);
        })
      )];

      const populationSourceSet = new Set(populationSourceArticleIds);
      const starCount = Number(islandStats?.starredArticles || 0);
      const clickCount = Number(islandStats?.clickedArticles || 0);

      islands.push({
        ...island,
        topicCount: Number(islandStats?.topicCount || 0),
        starredArticles: starCount,
        clickedArticles: clickCount,
        relatedArticleCount: Number(islandStats?.relatedArticleCount || 0),
        populationAudit,
        populationSourceArticleIds,
        effectiveWeight: Number(island.weight || 0),
        starCount,
        clickCount,
        interactionCount: starCount + clickCount,
        relatedArticles: relatedArticles.map(article => {
          const articleId = Number(article.id);
          const isPopulationSource = populationSourceSet.has(articleId);

          return {
            ...article,
            isPopulationSource,
            isNewArticle: !isPopulationSource
          };
        })
      });
    }

    const [totalsRaw] = await db.sequelize.query(
      `
      SELECT
        COALESCE((
          SELECT COUNT(*)
          FROM islands i
          WHERE i.userId = :userId
            AND i.archivedInd = 0
        ), 0) AS islandCount,
        COALESCE((
          SELECT COUNT(*)
          FROM articles a
          WHERE a.userId = :userId
            AND EXISTS (
              SELECT 1
              FROM article_topics atp
              INNER JOIN island_topics it
                ON it.topicId = atp.topicId
              INNER JOIN islands i
                ON i.id = it.islandId
               AND i.userId = :userId
               AND i.archivedInd = 0
              WHERE atp.articleId = a.id
            )
        ), 0) AS islandArticles,
        COALESCE((SELECT COUNT(*) FROM articles a2 WHERE a2.userId = :userId), 0) AS totalArticles
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
