import { Op } from 'sequelize';
import db from '../../models/index.js';
import { DEFAULT_AUDIT_MAX_ARTICLE_IDS, DEFAULT_AUDIT_MAX_RUNS } from './islandVectorUtils.js';

// Provides the shared dependencies used by this service.
const { Article, sequelize } = db;

// This function appends one bounded population-audit entry to an island's history.
export function appendPopulationAudit(existingAudit, entry) {
  // Selects the previous based on whether existing audit is an array.
  const previous = Array.isArray(existingAudit) ? existingAudit : [];
  // Collects the next while performing append population audit.
  const next = [...previous, entry];

  // Returns early when next count is at most default audit max runs.
  if (next.length <= DEFAULT_AUDIT_MAX_RUNS) return next;
  return next.slice(next.length - DEFAULT_AUDIT_MAX_RUNS);
}

// This function builds a compact audit entry describing which articles populated an island.
export async function buildPopulationAuditEntry({ userId, topicIds = [], articleIds = [], transaction }) {
  // Returns early when topic id is empty and article id is empty.
  if (!topicIds.length && !articleIds.length) {
    return {
      runAt: new Date().toISOString(),
      topicIds: [],
      articleIds: [],
      metrics: {
        relatedArticleCount: 0,
        starredCount: 0,
        clickedCount: 0,
        negativeCount: 0
      },
      sourceArticles: {
        starredArticleIds: [],
        clickedArticleIds: [],
        negativeArticleIds: [],
        articles: []
      }
    };
  }

  // Selects the rows based on whether article id is non-empty.
  const rows = articleIds.length
    ? await Article.findAll({
      where: {
        userId,
        id: { [Op.in]: articleIds }
      },
      attributes: ['id', 'title', 'favoriteInd', 'clickedAmount', 'negativeInd'],
      raw: true,
      transaction
    })
    : await sequelize.query(
      `
      SELECT DISTINCT
        a.id,
        a.title,
        a.favoriteInd,
        a.clickedAmount,
        a.negativeInd
      FROM article_topics atp
      INNER JOIN articles a
        ON a.id = atp.articleId
       AND a.userId = :userId
      WHERE atp.topicId IN (:topicIds)
      `,
      {
        replacements: {
          userId,
          topicIds
        },
        type: db.Sequelize.QueryTypes.SELECT,
        transaction
      }
    );

  // Derives the article rows through sort while building population audit entry.
  const articleRows = rows
    .map(row => ({
      id: Number(row.id),
      title: row.title,
      favoriteInd: Number(row.favoriteInd || 0),
      clickedAmount: Number(row.clickedAmount || 0),
      negativeInd: Number(row.negativeInd || 0)
    }))
    .filter(row => Number.isFinite(row.id))
    .sort((a, b) => (
      b.favoriteInd - a.favoriteInd ||
      b.clickedAmount - a.clickedAmount ||
      b.negativeInd - a.negativeInd ||
      a.id - b.id
    ));

  // Keeps the starred rows entries eligible while building population audit entry.
  const starredRows = articleRows.filter(row => row.favoriteInd === 1);
  // Keeps the clicked rows entries eligible while building population audit entry.
  const clickedRows = articleRows.filter(row => row.clickedAmount > 0);
  // Keeps the negative rows entries eligible while building population audit entry.
  const negativeRows = articleRows.filter(row => row.negativeInd === 1);

  // Derives the starred article id through slice while building population audit entry.
  const starredArticleIds = starredRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  // Derives the clicked article id through slice while building population audit entry.
  const clickedArticleIds = clickedRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  // Derives the negative article id through slice while building population audit entry.
  const negativeArticleIds = negativeRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  return {
    runAt: new Date().toISOString(),
    topicIds,
    articleIds: articleIds.slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS),
    metrics: {
      relatedArticleCount: articleRows.length,
      starredCount: starredRows.length,
      clickedCount: clickedRows.length,
      negativeCount: negativeRows.length
    },
    sourceArticles: {
      starredArticleIds,
      clickedArticleIds,
      negativeArticleIds,
      articles: articleRows.slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS)
    }
  };
}
