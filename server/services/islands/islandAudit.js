import { Op } from 'sequelize';
import db from '../../models/index.js';
import { DEFAULT_AUDIT_MAX_ARTICLE_IDS, DEFAULT_AUDIT_MAX_RUNS } from './islandVectorUtils.js';

const { Article, sequelize } = db;

// This function appends one bounded population-audit entry to an island's history.
export function appendPopulationAudit(existingAudit, entry) {
  const previous = Array.isArray(existingAudit) ? existingAudit : [];
  const next = [...previous, entry];

  if (next.length <= DEFAULT_AUDIT_MAX_RUNS) return next;
  return next.slice(next.length - DEFAULT_AUDIT_MAX_RUNS);
}

// This function builds a compact audit entry describing which articles populated an island.
export async function buildPopulationAuditEntry({ userId, topicIds = [], articleIds = [], transaction }) {
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

  const rows = articleIds.length
    ? await Article.findAll({
      where: {
        userId,
        id: { [Op.in]: articleIds }
      },
      attributes: ['id', 'title', 'starInd', 'clickedAmount', 'negativeInd'],
      raw: true,
      transaction
    })
    : await sequelize.query(
      `
      SELECT DISTINCT
        a.id,
        a.title,
        a.starInd,
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

  const articleRows = rows
    .map(row => ({
      id: Number(row.id),
      title: row.title,
      starInd: Number(row.starInd || 0),
      clickedAmount: Number(row.clickedAmount || 0),
      negativeInd: Number(row.negativeInd || 0)
    }))
    .filter(row => Number.isFinite(row.id))
    .sort((a, b) => (
      b.starInd - a.starInd ||
      b.clickedAmount - a.clickedAmount ||
      b.negativeInd - a.negativeInd ||
      a.id - b.id
    ));

  const starredRows = articleRows.filter(row => row.starInd === 1);
  const clickedRows = articleRows.filter(row => row.clickedAmount > 0);
  const negativeRows = articleRows.filter(row => row.negativeInd === 1);

  const starredArticleIds = starredRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  const clickedArticleIds = clickedRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

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
