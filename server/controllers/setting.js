import db from '../models/index.js';
const { BriefingPreference, CrawlRun, Island, OfficialSource, Setting } = db;

const DEFAULT_CRAWL_STATISTICS_DAYS = 30;
const MAX_CRAWL_STATISTICS_DAYS = 365;

// This function formats a ratio as a one-decimal percentage number.
const percentage = (part, total) => total
  ? Number(((part / total) * 100).toFixed(1))
  : 0;

// This function validates the bounded calendar-day range for crawl statistics.
const parseCrawlStatisticsDays = value => {
  if (value === undefined) return DEFAULT_CRAWL_STATISTICS_DAYS;
  if (!/^\d+$/.test(String(value))) return null;

  const days = Number(value);
  return days >= 1 && days <= MAX_CRAWL_STATISTICS_DAYS ? days : null;
};

// This function normalizes an official source domain before storage.
const normalizeOfficialSourceDomain = (value) => {
  const trimmedValue = String(value || '').trim().toLowerCase();
  if (!trimmedValue) return null;

  const withoutWildcard = trimmedValue.replace(/^\*\./, '');

  try {
    const url = new URL(
      withoutWildcard.includes('://') ? withoutWildcard : `https://${withoutWildcard}`
    );
    return url.hostname.replace(/^www\./, '');
  } catch {
    return withoutWildcard
      .split('/')[0]
      .split(':')[0]
      .replace(/^www\./, '') || null;
  }
};

// This function fetches all official source rows for the current user.
export const getOfficialSources = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const officialSources = await OfficialSource.findAll({
      where: { userId },
      order: [
        ['entity', 'ASC'],
        ['domain', 'ASC']
      ],
      raw: true
    });

    return res.status(200).json({
      total: officialSources.length,
      officialSources
    });
  } catch (err) {
    console.error('Error in getOfficialSources:', err);
    return res.status(500).json({ error: err.message });
  }
};

// This function returns terminal crawl statistics grouped by calendar day for the current user.
export const getCrawlStatistics = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const days = parseCrawlStatisticsDays(req.query.days);
    if (!days) {
      return res.status(400).json({
        error: `days must be an integer between 1 and ${MAX_CRAWL_STATISTICS_DAYS}`
      });
    }

    const calendarDate = db.Sequelize.fn('DATE', db.Sequelize.col('startedAt'));
    const crawlStatistics = await CrawlRun.findAll({
      attributes: [
        [calendarDate, 'date'],
        [
          db.Sequelize.fn(
            'COALESCE',
            db.Sequelize.fn('SUM', db.Sequelize.col('newArticles')),
            0
          ),
          'newArticles'
        ],
        [
          db.Sequelize.fn(
            'COALESCE',
            db.Sequelize.fn('SUM', db.Sequelize.col('updatedArticles')),
            0
          ),
          'updatedArticles'
        ],
        [
          db.Sequelize.fn(
            'SUM',
            db.Sequelize.literal("CASE WHEN `status` = 'completed' THEN 1 ELSE 0 END")
          ),
          'completedCrawls'
        ],
        [
          db.Sequelize.fn(
            'SUM',
            db.Sequelize.literal("CASE WHEN `status` = 'failed' THEN 1 ELSE 0 END")
          ),
          'failedCrawls'
        ]
      ],
      where: {
        userId,
        status: { [db.Sequelize.Op.in]: ['completed', 'failed'] },
        startedAt: {
          [db.Sequelize.Op.gte]: db.Sequelize.literal(
            `DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`
          )
        }
      },
      group: [calendarDate],
      order: [[calendarDate, 'DESC']],
      raw: true
    });

    return res.status(200).json({
      days,
      crawlStatistics: crawlStatistics.map(row => ({
        date: row.date,
        newArticles: Number(row.newArticles || 0),
        updatedArticles: Number(row.updatedArticles || 0),
        completedCrawls: Number(row.completedCrawls || 0),
        failedCrawls: Number(row.failedCrawls || 0)
      }))
    });
  } catch (err) {
    console.error('Error in getCrawlStatistics:', err);
    return res.status(500).json({ error: err.message });
  }
};

// This function overwrites all official source rows for the current user.
export const setOfficialSources = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const officialSources = Array.isArray(req.body?.officialSources)
      ? req.body.officialSources
      : [];

    const rowsByDomain = new Map();

    for (const source of officialSources) {
      const entity = String(source?.entity || '').trim();
      const domain = normalizeOfficialSourceDomain(source?.domain);

      if (!entity && !domain) continue;

      if (!entity || !domain) {
        return res.status(400).json({ error: 'Each official source needs an entity and domain.' });
      }

      rowsByDomain.set(domain, {
        userId,
        entity,
        domain,
        enabled: source?.enabled !== false
      });
    }

    const payload = [...rowsByDomain.values()];

    await db.sequelize.transaction(async (transaction) => {
      await OfficialSource.destroy({
        where: { userId },
        transaction
      });

      if (payload.length > 0) {
        await OfficialSource.bulkCreate(payload, { transaction });
      }
    });

    const saved = await OfficialSource.findAll({
      where: { userId },
      order: [
        ['entity', 'ASC'],
        ['domain', 'ASC']
      ],
      raw: true
    });

    return res.status(200).json({
      total: saved.length,
      officialSources: saved
    });
  } catch (err) {
    console.error('Error in setOfficialSources:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const getSettings = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const aiEnabled = Boolean(process.env.OPENAI_API_KEY);

    // Set first-load defaults based on whether AI features are available.
    let categoryId = "%";
    let feedId = "%";
    let status = "unread";
    let sort = aiEnabled ? "recommended" : "desc";
    let minAdvertisementScore = 0;
    let minSentimentScore = 0;
    let minQualityScore = 0;
    let viewMode = aiEnabled ? "reader" : "full";
    let grouping = aiEnabled ? "event" : "none";
    let includeDevelopingEvents = aiEnabled;
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
      includeDevelopingEvents = Boolean(settings.includeDevelopingEvents);
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
      includeDevelopingEvents,
      themeMode: themeMode,
      AIEnabled: aiEnabled
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
    const {
      minAdvertisementScore,
      minSentimentScore,
      minQualityScore,
      includeDevelopingEvents
    } = req.body;

    // Validate score values (0-100)
    const validateScore = (score, name) => {
      const numScore = parseInt(score);
      if (isNaN(numScore) || numScore < 0 || numScore > 100) {
        throw new Error(`${name} must be between 0 and 100`);
      }
      return numScore;
    };

    const validatedSettings = {
      minAdvertisementScore: validateScore(minAdvertisementScore, 'minAdvertisementScore'),
      minSentimentScore: validateScore(minSentimentScore, 'minSentimentScore'),
      minQualityScore: validateScore(minQualityScore, 'minQualityScore')
    };

    if (includeDevelopingEvents !== undefined) {
      if (typeof includeDevelopingEvents !== 'boolean') {
        return res.status(400).json({ error: 'includeDevelopingEvents must be a boolean' });
      }
      validatedSettings.includeDevelopingEvents = includeDevelopingEvents;
    }

    // Find or create settings for user
    const settings = await Setting.findOne({ where: { userId: userId } });

    if (settings) {
      console.log("Updating existing settings for user:", userId);
      console.log("Validated settings:", validatedSettings);
      // Update existing settings
      await settings.update(validatedSettings);
    } else {
      // Create new settings
      await Setting.create({
        userId: userId,
        ...validatedSettings
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Settings saved successfully',
      ...validatedSettings
    });
  } catch (err) {
    console.error('Error in setSettings:', err);
    return res.status(400).json({ error: err.message });
  }
};

// This function updates whether the current user's selection includes developing events.
export const setIncludeDevelopingEvents = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { includeDevelopingEvents } = req.body;
    if (typeof includeDevelopingEvents !== 'boolean') {
      return res.status(400).json({ error: 'includeDevelopingEvents must be a boolean' });
    }

    await db.sequelize.transaction(async transaction => {
      const [settings, settingsCreated] = await Setting.findOrCreate({
        where: { userId },
        defaults: { includeDevelopingEvents },
        transaction
      });

      if (!settingsCreated) {
        await settings.update({ includeDevelopingEvents }, { transaction });
      }

      const [briefingPreference, briefingPreferenceCreated] = await BriefingPreference.findOrCreate({
        where: { userId },
        defaults: { includeDevelopingEvents },
        transaction
      });

      if (!briefingPreferenceCreated) {
        await briefingPreference.update({ includeDevelopingEvents }, { transaction });
      }
    });

    return res.status(200).json({
      success: true,
      includeDevelopingEvents
    });
  } catch (err) {
    console.error('Error in setIncludeDevelopingEvents:', err);
    return res.status(500).json({ error: err.message });
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
          a.publishedAt,
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
        ORDER BY a.publishedAt DESC
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
          const auditArticleIds = Array.isArray(entry?.articleIds) ? entry.articleIds : [];
          const starred = Array.isArray(source.starredArticleIds) ? source.starredArticleIds : [];
          const clicked = Array.isArray(source.clickedArticleIds) ? source.clickedArticleIds : [];
          const negative = Array.isArray(source.negativeArticleIds) ? source.negativeArticleIds : [];
          const articles = Array.isArray(source.articles) ? source.articles.map(article => article.id) : [];
          return [...auditArticleIds, ...starred, ...clicked, ...negative, ...articles]
            .map(Number)
            .filter(Number.isFinite);
        })
      )];

      const sourceArticleSnapshots = new Map();
      const historicalStarredIds = new Set();
      const historicalClickedIds = new Set();
      const historicalNegativeIds = new Set();
      for (const entry of populationAudit) {
        const source = entry?.sourceArticles || {};
        for (const articleId of Array.isArray(source.starredArticleIds) ? source.starredArticleIds : []) {
          historicalStarredIds.add(Number(articleId));
        }
        for (const articleId of Array.isArray(source.clickedArticleIds) ? source.clickedArticleIds : []) {
          historicalClickedIds.add(Number(articleId));
        }
        for (const articleId of Array.isArray(source.negativeArticleIds) ? source.negativeArticleIds : []) {
          historicalNegativeIds.add(Number(articleId));
        }
        const articles = Array.isArray(entry?.sourceArticles?.articles)
          ? entry.sourceArticles.articles
          : [];

        for (const article of articles) {
          const articleId = Number(article?.id);
          if (!Number.isFinite(articleId)) continue;

          const previous = sourceArticleSnapshots.get(articleId) || {};
          sourceArticleSnapshots.set(articleId, {
            favoriteInd: Math.max(Number(previous.favoriteInd || 0), Number(article.favoriteInd || 0)),
            clickedAmount: Math.max(Number(previous.clickedAmount || 0), Number(article.clickedAmount || 0)),
            negativeInd: Math.max(Number(previous.negativeInd || 0), Number(article.negativeInd || 0))
          });
        }
      }

      const sourceArticlesRaw = populationSourceArticleIds.length
        ? await db.sequelize.query(
          `
          SELECT
            a.id,
            a.title,
            a.url,
            a.publishedAt,
            a.favoriteInd,
            a.clickedAmount,
            a.positiveInd,
            a.attentionBucket,
            a.negativeInd,
            f.feedName
          FROM articles a
          LEFT JOIN feeds f
            ON f.id = a.feedId
           AND f.userId = :userId
          WHERE a.userId = :userId
            AND a.duplicateOfArticleId IS NULL
            AND a.id IN (:sourceArticleIds)
          ORDER BY a.publishedAt DESC
          `,
          {
            replacements: { userId, sourceArticleIds: populationSourceArticleIds },
            type: db.Sequelize.QueryTypes.SELECT
          }
        )
        : [];

      const relatedArticleIds = relatedArticles.map(article => Number(article.id));
      const connectedArticleIds = [...new Set([
        ...relatedArticleIds,
        ...sourceArticlesRaw.map(article => Number(article.id))
      ])];
      const relatedTopicRows = connectedArticleIds.length
        ? await db.sequelize.query(
          `
          SELECT DISTINCT
            atp.articleId,
            t.id AS topicId,
            t.name AS topicName,
            it.similarity,
            it.confidence
          FROM article_topics atp
          INNER JOIN island_topics it
            ON it.topicId = atp.topicId
           AND it.islandId = :islandId
          INNER JOIN topics t
            ON t.id = atp.topicId
           AND t.userId = :userId
          WHERE atp.articleId IN (:connectedArticleIds)
          ORDER BY atp.articleId, it.confidence DESC, t.id
          `,
          {
            replacements: { userId, islandId: island.id, connectedArticleIds },
            type: db.Sequelize.QueryTypes.SELECT
          }
        )
        : [];

      const topicsByArticleId = new Map();
      for (const row of relatedTopicRows) {
        const articleId = Number(row.articleId);
        const topics = topicsByArticleId.get(articleId) || [];
        topics.push({
          id: Number(row.topicId),
          name: row.topicName,
          similarity: Number(row.similarity || 0),
          confidence: Number(row.confidence || 0)
        });
        topicsByArticleId.set(articleId, topics);
      }

      const populationSourceSet = new Set(populationSourceArticleIds);
      const favoriteCount = Number(islandStats?.starredArticles || 0);
      const clickCount = Number(islandStats?.clickedArticles || 0);
      const allSourceArticles = sourceArticlesRaw.map(article => {
        const articleId = Number(article.id);
        const snapshot = sourceArticleSnapshots.get(articleId) || {};
        const evidence = [];
        const clickedAmount = Math.max(Number(article.clickedAmount || 0), Number(snapshot.clickedAmount || 0));

        if (Number(article.positiveInd || 0) === 1) evidence.push({ type: 'positive', label: 'Positive feedback' });
        if (Number(article.favoriteInd || 0) === 1 || Number(snapshot.favoriteInd || 0) === 1 || historicalStarredIds.has(articleId)) {
          evidence.push({ type: 'favorite', label: 'Favorite' });
        }
        if (clickedAmount > 0 || historicalClickedIds.has(articleId)) {
          const clickLabel = clickedAmount > 0
            ? `${clickedAmount} ${clickedAmount === 1 ? 'click' : 'clicks'}`
            : 'Clicked';
          evidence.push({ type: 'click', label: clickLabel });
        }
        if (Number(article.attentionBucket || 0) >= 3) evidence.push({ type: 'deepRead', label: 'Deep read' });
        if (Number(article.negativeInd || 0) === 1 || Number(snapshot.negativeInd || 0) === 1 || historicalNegativeIds.has(articleId)) {
          evidence.push({ type: 'negative', label: 'Negative feedback' });
        }

        return {
          ...article,
          evidence,
          connectionTopics: topicsByArticleId.get(articleId) || []
        };
      });
      const sourceArticles = allSourceArticles.slice(0, 5);

      islands.push({
        ...island,
        topicCount: Number(islandStats?.topicCount || 0),
        starredArticles: favoriteCount,
        clickedArticles: clickCount,
        relatedArticleCount: Number(islandStats?.relatedArticleCount || 0),
        populationAudit,
        populationSourceArticleIds,
        sourceArticleCount: populationSourceArticleIds.length,
        sourceArticles,
        evidenceSignalCount: allSourceArticles.reduce((sum, article) => sum + article.evidence.length, 0),
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
            isNewArticle: !isPopulationSource,
            connectionTopics: topicsByArticleId.get(articleId) || []
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
  getCrawlStatistics,
  getOfficialSources,
  setOfficialSources,
  getSettings,
  setSettings,
  setIncludeDevelopingEvents,
  setThemeMode,
  getIslandsOverview,
  getTopicsOverview
}
