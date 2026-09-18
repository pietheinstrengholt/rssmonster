import { isActiveIsland, islandExpiresAt } from '../services/islands/islandDeadline.js';
import db from '../models/index.js';
import { getAvailableInferenceCapabilities } from '../services/inference/status.js';
import { isAssistantEnabled } from '../config/intelligentFeatures.js';
import runIslandCalibration from '../scripts/runIslandsCommand.js';
const { CrawlRun, Island, OfficialSource, Setting } = db;

const DEFAULT_CRAWL_STATISTICS_DAYS = 30;
const MAX_CRAWL_STATISTICS_DAYS = 365;

// This function recalibrates Interest Islands for the signed-in user.
export const recalculateIslands = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const result = await runIslandCalibration({ userId });

    return res.status(200).json({
      message: 'Interest islands recalculated',
      islandCount: Number(result?.islandCount || 0),
      articleCount: Number(result?.articleCount || 0),
      enrichedIslandCount: Number(result?.enrichedIslandCount || 0),
      rescoredArticleCount: Number(result?.rescoredArticleCount || 0)
    });
  } catch (err) {
    console.error('Error in recalculateIslands:', err);
    return res.status(500).json({ error: 'Unable to recalculate interest islands' });
  }
};

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
    const startedAtFrom = new Date();
    startedAtFrom.setUTCHours(0, 0, 0, 0);
    startedAtFrom.setUTCDate(startedAtFrom.getUTCDate() - (days - 1));
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
          [db.Sequelize.Op.gte]: startedAtFrom
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

    const available = await getAvailableInferenceCapabilities();
    const aiEnabled = available.embeddings || available.generation || available.classification;

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
    let prioritizeHighTrust = false;
    let themeMode = 'system';
    let startupViewMode = 'last-used';
    let markAsReadOnScroll = true;
    let openArticleLinksInNewTab = false;

    const settings = await Setting.findOne({ where: { userId: userId }, raw: true });

    // Always restore durable preferences, regardless of the startup selection behavior.
    if (settings) {
      minAdvertisementScore = settings.minAdvertisementScore || 0;
      minSentimentScore = settings.minSentimentScore || 0;
      minQualityScore = settings.minQualityScore || 0;
      includeDevelopingEvents = Boolean(settings.includeDevelopingEvents);
      prioritizeHighTrust = Boolean(settings.prioritizeHighTrust);
      themeMode = settings.themeMode || 'system';
      openArticleLinksInNewTab = Boolean(settings.openArticleLinksInNewTab);
      startupViewMode = settings.startupViewMode || 'last-used';
      markAsReadOnScroll = settings.markAsReadOnScroll == null
        ? true
        : Boolean(settings.markAsReadOnScroll);

      // Restore the previous selection only when the user opted into last-used startup behavior.
      if (startupViewMode === 'last-used') {
        categoryId = settings.categoryId;
        feedId = settings.feedId;
        status = settings.status;
        sort = settings.sort;
        viewMode = settings.viewMode || 'full';
        grouping = settings.grouping || 'none';
      }
    }

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
      prioritizeHighTrust,
      themeMode: themeMode,
      startupViewMode,
      openArticleLinksInNewTab,
      markAsReadOnScroll,
      AIEnabled: aiEnabled,
      AssistantEnabled: isAssistantEnabled() && available.assistant
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
      includeDevelopingEvents,
      prioritizeHighTrust
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

    if (prioritizeHighTrust !== undefined) {
      if (typeof prioritizeHighTrust !== 'boolean') {
        return res.status(400).json({ error: 'prioritizeHighTrust must be a boolean' });
      }
      validatedSettings.prioritizeHighTrust = prioritizeHighTrust;
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

    const [settings, created] = await Setting.findOrCreate({
      where: { userId },
      defaults: { includeDevelopingEvents }
    });

    if (!created) {
      await settings.update({ includeDevelopingEvents });
    }

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

// This function saves the current user's preferred startup selection behavior.
export const setStartupViewMode = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const { startupViewMode } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!['last-used', 'default'].includes(startupViewMode)) {
      return res.status(400).json({
        error: 'startupViewMode must be last-used or default'
      });
    }

    const [settings, created] = await Setting.findOrCreate({
      where: { userId },
      defaults: { startupViewMode }
    });

    if (!created) {
      await settings.update({ startupViewMode });
    }

    return res.status(200).json({ success: true, startupViewMode });
  } catch (err) {
    console.error('Error in setStartupViewMode:', err);
    return res.status(500).json({ error: err.message });
  }
};

// This function saves whether scrolling past unread articles marks them as read.
export const setMarkAsReadOnScroll = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const { markAsReadOnScroll } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (typeof markAsReadOnScroll !== 'boolean') {
      return res.status(400).json({ error: 'markAsReadOnScroll must be a boolean' });
    }

    const [settings, created] = await Setting.findOrCreate({
      where: { userId },
      defaults: { markAsReadOnScroll }
    });

    if (!created) {
      await settings.update({ markAsReadOnScroll });
    }

    return res.status(200).json({ success: true, markAsReadOnScroll });
  } catch (err) {
    console.error('Error in setMarkAsReadOnScroll:', err);
    return res.status(500).json({ error: err.message });
  }
};

// This function saves whether article body links open in a new tab.
export const setOpenArticleLinksInNewTab = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const { openArticleLinksInNewTab } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (typeof openArticleLinksInNewTab !== 'boolean') {
      return res.status(400).json({ error: 'openArticleLinksInNewTab must be a boolean' });
    }

    const [settings, created] = await Setting.findOrCreate({
      where: { userId },
      defaults: { openArticleLinksInNewTab }
    });

    if (!created) {
      await settings.update({ openArticleLinksInNewTab });
    }

    return res.status(200).json({ success: true, openArticleLinksInNewTab });
  } catch (err) {
    console.error('Error in setOpenArticleLinksInNewTab:', err);
    return res.status(500).json({ error: err.message });
  }
};

// This function saves the generic unread high-trust preference for future ranking behavior.
export const setPrioritizeHighTrust = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const { prioritizeHighTrust } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (typeof prioritizeHighTrust !== 'boolean') {
      return res.status(400).json({ error: 'prioritizeHighTrust must be a boolean' });
    }

    const [settings, created] = await Setting.findOrCreate({
      where: { userId },
      defaults: { prioritizeHighTrust }
    });

    if (!created) {
      await settings.update({ prioritizeHighTrust });
    }

    return res.status(200).json({ success: true, prioritizeHighTrust });
  } catch (err) {
    console.error('Error in setPrioritizeHighTrust:', err);
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
        'generatedLabel',
        'weight',
        'populationAudit',
        'archivedInd',
        'archivedAt',
        'lastBehaviorAt',
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

    const auditByIslandId = new Map(islandsRaw.map(island => {
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
          const positive = Array.isArray(source.positiveArticleIds) ? source.positiveArticleIds : [];
          const meaningfulRead = Array.isArray(source.meaningfulReadArticleIds) ? source.meaningfulReadArticleIds : [];
          return [...auditArticleIds, ...starred, ...clicked, ...negative, ...positive, ...meaningfulRead, ...articles]
            .map(Number)
            .filter(Number.isFinite);
        })
      )];

      return [String(island.id), { populationAudit, populationSourceArticleIds }];
    }));
    const allSourceArticleIds = [...new Set(
      [...auditByIslandId.values()].flatMap(audit => audit.populationSourceArticleIds)
    )];
    const islandIdsBySourceArticleId = new Map();
    for (const [islandId, audit] of auditByIslandId) {
      for (const articleId of audit.populationSourceArticleIds) {
        const sourceIslandIds = islandIdsBySourceArticleId.get(articleId) || [];
        sourceIslandIds.push(islandId);
        islandIdsBySourceArticleId.set(articleId, sourceIslandIds);
      }
    }

    const sourceArticlesRaw = allSourceArticleIds.length
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
          replacements: { userId, sourceArticleIds: allSourceArticleIds },
          type: db.Sequelize.QueryTypes.SELECT
        }
      )
      : [];
    const sourceArticlesByIslandId = new Map();
    for (const article of sourceArticlesRaw) {
      for (const islandId of islandIdsBySourceArticleId.get(Number(article.id)) || []) {
        const sourceArticles = sourceArticlesByIslandId.get(islandId) || [];
        sourceArticles.push(article);
        sourceArticlesByIslandId.set(islandId, sourceArticles);
      }
    }
    const islands = [];
    const now = Date.now();
    for (const island of islandsRaw) {
      const islandId = String(island.id);
      const { populationAudit, populationSourceArticleIds } = auditByIslandId.get(islandId);

      const sourceArticleSnapshots = new Map();
      const historicalStarredIds = new Set();
      const historicalClickedIds = new Set();
      const historicalNegativeIds = new Set();
      const historicalPositiveIds = new Set();
      const historicalMeaningfulReadIds = new Set();
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
        for (const articleId of Array.isArray(source.positiveArticleIds) ? source.positiveArticleIds : []) historicalPositiveIds.add(Number(articleId));
        for (const articleId of Array.isArray(source.meaningfulReadArticleIds) ? source.meaningfulReadArticleIds : []) historicalMeaningfulReadIds.add(Number(articleId));
        const articles = Array.isArray(entry?.sourceArticles?.articles)
          ? entry.sourceArticles.articles
          : [];

        for (const article of articles) {
          const articleId = Number(article?.id);
          if (!Number.isFinite(articleId)) continue;

          const previous = sourceArticleSnapshots.get(articleId) || {};
          sourceArticleSnapshots.set(articleId, {
            positiveInd: Math.max(Number(previous.positiveInd || 0), Number(article.positiveInd || 0)),
            attentionBucket: Math.max(Number(previous.attentionBucket || 0), Number(article.attentionBucket || 0)),
            favoriteInd: Math.max(Number(previous.favoriteInd || 0), Number(article.favoriteInd || 0)),
            clickedAmount: Math.max(Number(previous.clickedAmount || 0), Number(article.clickedAmount || 0)),
            negativeInd: Math.max(Number(previous.negativeInd || 0), Number(article.negativeInd || 0))
          });
        }
      }

      const islandSourceArticlesRaw = sourceArticlesByIslandId.get(islandId) || [];
      const allSourceArticles = islandSourceArticlesRaw.map(article => {
        const articleId = Number(article.id);
        const snapshot = sourceArticleSnapshots.get(articleId) || {};
        const evidence = [];
        const clickedAmount = Math.max(Number(article.clickedAmount || 0), Number(snapshot.clickedAmount || 0));

        if (Number(article.positiveInd || 0) === 1 || Number(snapshot.positiveInd || 0) === 1 || historicalPositiveIds.has(articleId)) evidence.push({ type: 'positive', label: 'Positive feedback' });
        if (Number(article.favoriteInd || 0) === 1 || Number(snapshot.favoriteInd || 0) === 1 || historicalStarredIds.has(articleId)) {
          evidence.push({ type: 'favorite', label: 'Favorite' });
        }
        if (clickedAmount > 0 || historicalClickedIds.has(articleId)) {
          const clickLabel = clickedAmount > 0
            ? `${clickedAmount} ${clickedAmount === 1 ? 'click' : 'clicks'}`
            : 'Clicked';
          evidence.push({ type: 'click', label: clickLabel });
        }
        if (Number(article.attentionBucket || 0) >= 3 || Number(snapshot.attentionBucket || 0) >= 3 || historicalMeaningfulReadIds.has(articleId)) evidence.push({ type: 'deepRead', label: 'Deep read' });
        if (Number(article.negativeInd || 0) === 1 || Number(snapshot.negativeInd || 0) === 1 || historicalNegativeIds.has(articleId)) {
          evidence.push({ type: 'negative', label: 'Negative feedback' });
        }

        return {
          ...article,
          evidence,
        };
      });
      const sourceArticles = allSourceArticles.slice(0, 5);

      islands.push({
        ...island,
        populationAudit,
        populationSourceArticleIds,
        sourceArticleCount: populationSourceArticleIds.length,
        sourceArticles,
        evidenceSignalCount: allSourceArticles.reduce((sum, article) => sum + article.evidence.length, 0),
        // Present expiry immediately while retaining the stored identity and explanation history.
        archivedInd: !isActiveIsland(island, now),
        expiresAt: islandExpiresAt(island, now),
        effectiveWeight: isActiveIsland(island, now) ? Number(island.weight || 0) : 0,
      });
    }

    const islandCount = islandsRaw.filter(island => isActiveIsland(island, now)).length;
    return res.status(200).json({
      userId,
      count: islands.length,
      totals: {
        islandCount
      },
      islands
    });
  } catch (err) {
    console.error('Error in getIslandsOverview:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const getEventsOverview = async (req, res, _next) => {
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
        COALESCE((SELECT MAX(e.articleCount) FROM events e WHERE e.userId = :userId), 0) AS largestEventSize
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

    const events = await db.sequelize.query(
      `
      SELECT
        e.id,
        e.name,
        e.generatedName,
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
        ), 0) AS actualArticleCount
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

    const totalArticles = Number(totalsRaw?.totalArticles || 0);
    const eventLinkedArticles = Number(totalsRaw?.eventLinkedArticles || 0);
    const eventCount = Number(totalsRaw?.eventCount || 0);

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
      },
      eventSizeBuckets: eventSizeBuckets.map(row => ({
        bucket: row.bucket,
        count: Number(row.count || 0)
      })),
      eventStatuses: eventStatuses.map(row => ({
        status: row.status,
        count: Number(row.count || 0)
      })),
      events: events.map(event => ({
        ...event,
        articleCount: Number(event.articleCount || 0),
        sourceCount: Number(event.sourceCount || 0),
        eventStrength: Number(event.eventStrength || 0),
        actualArticleCount: Number(event.actualArticleCount || 0),
      })),
    });
  } catch (err) {
    console.error('Error in getEventsOverview:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  recalculateIslands,
  getCrawlStatistics,
  getOfficialSources,
  setOfficialSources,
  getSettings,
  setSettings,
  setIncludeDevelopingEvents,
  setThemeMode,
  setStartupViewMode,
  setMarkAsReadOnScroll,
  setOpenArticleLinksInNewTab,
  setPrioritizeHighTrust,
  getIslandsOverview,
  getEventsOverview
}
