import db from '../models/index.js';
const { Island, Setting } = db;

// This function formats a ratio as a one-decimal percentage number.
const percentage = (part, total) => total
  ? Number(((part / total) * 100).toFixed(1))
  : 0;

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
    let sort = "desc";
    let minAdvertisementScore = 0;
    let minSentimentScore = 0;
    let minQualityScore = 0;
    let viewMode = "full";
    let grouping = "none";
    let themeMode = 'system';

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
      grouping = settings.grouping || 'none';
      themeMode = settings.themeMode || 'system';
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
      grouping: String(grouping),
      themeMode: themeMode,
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

// This function saves a user's selected color theme mode.
export const setThemeMode = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const { themeMode } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!['system', 'light', 'dark'].includes(themeMode)) {
      return res.status(400).json({ error: 'themeMode must be system, light, or dark' });
    }

    const [settings, created] = await Setting.findOrCreate({
      where: { userId },
      defaults: { themeMode }
    });

    if (!created) {
      await settings.update({ themeMode });
    }

    return res.status(200).json({ success: true, themeMode });
  } catch (err) {
    console.error('Error in setThemeMode:', err);
    return res.status(500).json({ error: err.message });
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
              AND a.duplicateOfArticleId IS NULL
              AND a.favoriteInd = 1
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
              AND a.duplicateOfArticleId IS NULL
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
              AND a.duplicateOfArticleId IS NULL
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
          a.favoriteInd,
          a.clickedAmount,
          f.feedName
        FROM articles a
        LEFT JOIN feeds f
          ON f.id = a.feedId
         AND f.userId = :userId
        WHERE a.userId = :userId
          AND a.duplicateOfArticleId IS NULL
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
      const favoriteCount = Number(islandStats?.starredArticles || 0);
      const clickCount = Number(islandStats?.clickedArticles || 0);

      islands.push({
        ...island,
        topicCount: Number(islandStats?.topicCount || 0),
        starredArticles: favoriteCount,
        clickedArticles: clickCount,
        relatedArticleCount: Number(islandStats?.relatedArticleCount || 0),
        populationAudit,
        populationSourceArticleIds,
        effectiveWeight: Number(island.weight || 0),
        favoriteCount,
        clickCount,
        interactionCount: favoriteCount + clickCount,
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
            AND a.duplicateOfArticleId IS NULL
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
        COALESCE((SELECT COUNT(*) FROM articles a2 WHERE a2.userId = :userId AND a2.duplicateOfArticleId IS NULL), 0) AS totalArticles
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

export const getTopicsOverview = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const [totalsRaw] = await db.sequelize.query(
      `
      SELECT
        COALESCE((SELECT COUNT(*) FROM articles a WHERE a.userId = :userId AND a.duplicateOfArticleId IS NULL), 0) AS totalArticles,
        COALESCE((SELECT COUNT(*) FROM articles a WHERE a.userId = :userId AND a.duplicateOfArticleId IS NULL AND a.eventId IS NULL), 0) AS unclusteredArticles,
        COALESCE((
          SELECT COUNT(DISTINCT a.id)
          FROM articles a
          INNER JOIN events e
            ON e.id = a.eventId
           AND e.userId = :userId
          WHERE a.userId = :userId
            AND a.duplicateOfArticleId IS NULL
        ), 0) AS eventLinkedArticles,
        COALESCE((SELECT COUNT(*) FROM events e WHERE e.userId = :userId), 0) AS eventCount,
        COALESCE((
          SELECT COUNT(*)
          FROM events e
          WHERE e.userId = :userId
            AND e.status <> 'archived'
        ), 0) AS activeEventCount,
        COALESCE((SELECT AVG(e.articleCount) FROM events e WHERE e.userId = :userId), 0) AS averageArticlesPerEvent,
        COALESCE((SELECT MAX(e.articleCount) FROM events e WHERE e.userId = :userId), 0) AS largestEventSize,
        COALESCE((SELECT COUNT(*) FROM topics t WHERE t.userId = :userId), 0) AS topicCount,
        COALESCE((
          SELECT COUNT(DISTINCT e.id)
          FROM events e
          WHERE e.userId = :userId
            AND (
              e.topicId IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM event_topics et
                INNER JOIN topics t
                  ON t.id = et.topicId
                 AND t.userId = :userId
                WHERE et.eventId = e.id
              )
            )
        ), 0) AS eventsLinkedToTopics,
        COALESCE((
          SELECT COUNT(DISTINCT t.id)
          FROM topics t
          WHERE t.userId = :userId
            AND (
              EXISTS (
                SELECT 1
                FROM events e
                WHERE e.topicId = t.id
                  AND e.userId = :userId
              )
              OR EXISTS (
                SELECT 1
                FROM event_topics et
                INNER JOIN events e
                  ON e.id = et.eventId
                 AND e.userId = :userId
                WHERE et.topicId = t.id
              )
            )
        ), 0) AS topicsWithEvents,
        COALESCE((
          SELECT COUNT(DISTINCT a.id)
          FROM articles a
          WHERE a.userId = :userId
            AND a.duplicateOfArticleId IS NULL
            AND (
              a.topicId IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM article_topics atp
                INNER JOIN topics t
                  ON t.id = atp.topicId
                 AND t.userId = :userId
                WHERE atp.articleId = a.id
              )
            )
        ), 0) AS articlesLinkedToTopics
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const eventSizeBuckets = await db.sequelize.query(
      `
      SELECT
        CASE
          WHEN e.articleCount >= 5 THEN '5+'
          ELSE CAST(e.articleCount AS CHAR)
        END AS bucket,
        COUNT(*) AS count
      FROM events e
      WHERE e.userId = :userId
      GROUP BY bucket
      ORDER BY MIN(e.articleCount)
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const eventStatuses = await db.sequelize.query(
      `
      SELECT e.status, COUNT(*) AS count
      FROM events e
      WHERE e.userId = :userId
      GROUP BY e.status
      ORDER BY e.status
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const topicTypes = await db.sequelize.query(
      `
      SELECT t.topicType, COUNT(*) AS count
      FROM topics t
      WHERE t.userId = :userId
      GROUP BY t.topicType
      ORDER BY t.topicType
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const events = await db.sequelize.query(
      `
      SELECT
        e.id,
        e.name,
        e.status,
        e.articleCount,
        e.sourceCount,
        e.eventStrength,
        e.eventWindowStartAt,
        e.eventWindowEndAt,
        e.updatedAt,
        COALESCE((
          SELECT COUNT(*)
          FROM articles a
          WHERE a.userId = :userId
            AND a.duplicateOfArticleId IS NULL
            AND a.eventId = e.id
        ), 0) AS actualArticleCount,
        (
          COALESCE((
            SELECT COUNT(DISTINCT et.topicId)
            FROM event_topics et
            INNER JOIN topics t
              ON t.id = et.topicId
             AND t.userId = :userId
            WHERE et.eventId = e.id
          ), 0)
          +
          CASE
            WHEN e.topicId IS NOT NULL
             AND NOT EXISTS (
               SELECT 1
               FROM event_topics et2
               WHERE et2.eventId = e.id
                 AND et2.topicId = e.topicId
             )
            THEN 1
            ELSE 0
          END
        ) AS topicCount
      FROM events e
      WHERE e.userId = :userId
      ORDER BY
        CASE WHEN e.status = 'archived' THEN 1 ELSE 0 END,
        e.articleCount DESC,
        e.updatedAt DESC
      LIMIT 25
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const topics = await db.sequelize.query(
      `
      SELECT
        t.id,
        t.name,
        t.topicType,
        t.affinityScore,
        t.evidenceScore,
        t.articleCount,
        t.behavioralArticleCount,
        t.eventCount,
        t.starredCount,
        t.lastActivityAt,
        COALESCE((
          SELECT COUNT(DISTINCT e.id)
          FROM events e
          WHERE e.userId = :userId
            AND (
              e.topicId = t.id
              OR EXISTS (
                SELECT 1
                FROM event_topics et
                WHERE et.eventId = e.id
                  AND et.topicId = t.id
              )
            )
        ), 0) AS linkedEventCount,
        COALESCE((
          SELECT COUNT(DISTINCT a.id)
          FROM articles a
          WHERE a.userId = :userId
            AND a.duplicateOfArticleId IS NULL
            AND (
              a.topicId = t.id
              OR EXISTS (
                SELECT 1
                FROM article_topics atp
                WHERE atp.articleId = a.id
                  AND atp.topicId = t.id
              )
            )
        ), 0) AS linkedArticleCount
      FROM topics t
      WHERE t.userId = :userId
      ORDER BY
        t.lastActivityAt DESC,
        t.eventCount DESC,
        t.articleCount DESC,
        t.id DESC
      LIMIT 25
      `,
      {
        replacements: { userId },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );

    const totalArticles = Number(totalsRaw?.totalArticles || 0);
    const eventLinkedArticles = Number(totalsRaw?.eventLinkedArticles || 0);
    const eventCount = Number(totalsRaw?.eventCount || 0);
    const eventsLinkedToTopics = Number(totalsRaw?.eventsLinkedToTopics || 0);
    const articlesLinkedToTopics = Number(totalsRaw?.articlesLinkedToTopics || 0);
    const topicCount = Number(totalsRaw?.topicCount || 0);

    return res.status(200).json({
      userId,
      totals: {
        totalArticles,
        unclusteredArticles: Number(totalsRaw?.unclusteredArticles || 0),
        eventLinkedArticles,
        unassignedArticles: Math.max(0, totalArticles - eventLinkedArticles),
        eventCount,
        activeEventCount: Number(totalsRaw?.activeEventCount || 0),
        eventReuseRatio: percentage(eventLinkedArticles, totalArticles),
        newEventRatio: percentage(eventCount, totalArticles),
        averageArticlesPerEvent: Number(Number(totalsRaw?.averageArticlesPerEvent || 0).toFixed(1)),
        largestEventSize: Number(totalsRaw?.largestEventSize || 0),
        topicCount,
        eventsLinkedToTopics,
        topicsWithEvents: Number(totalsRaw?.topicsWithEvents || 0),
        eventsWithoutTopics: Math.max(0, eventCount - eventsLinkedToTopics),
        articlesLinkedToTopics,
        topicCoveragePercent: percentage(articlesLinkedToTopics, totalArticles),
        averageEventsPerTopic: topicCount
          ? Number((eventsLinkedToTopics / topicCount).toFixed(1))
          : 0
      },
      eventSizeBuckets: eventSizeBuckets.map(row => ({
        bucket: row.bucket,
        count: Number(row.count || 0)
      })),
      eventStatuses: eventStatuses.map(row => ({
        status: row.status,
        count: Number(row.count || 0)
      })),
      topicTypes: topicTypes.map(row => ({
        topicType: row.topicType,
        count: Number(row.count || 0)
      })),
      events: events.map(event => ({
        ...event,
        articleCount: Number(event.articleCount || 0),
        sourceCount: Number(event.sourceCount || 0),
        eventStrength: Number(event.eventStrength || 0),
        actualArticleCount: Number(event.actualArticleCount || 0),
        topicCount: Number(event.topicCount || 0)
      })),
      topics: topics.map(topic => ({
        ...topic,
        affinityScore: Number(topic.affinityScore || 0),
        evidenceScore: Number(topic.evidenceScore || 0),
        articleCount: Number(topic.articleCount || 0),
        behavioralArticleCount: Number(topic.behavioralArticleCount || 0),
        eventCount: Number(topic.eventCount || 0),
        starredCount: Number(topic.starredCount || 0),
        linkedEventCount: Number(topic.linkedEventCount || 0),
        linkedArticleCount: Number(topic.linkedArticleCount || 0)
      }))
    });
  } catch (err) {
    console.error('Error in getTopicsOverview:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getSettings,
  setSettings,
  setThemeMode,
  getIslandsOverview,
  getTopicsOverview
}
