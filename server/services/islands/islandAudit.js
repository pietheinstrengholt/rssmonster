import { Op } from 'sequelize';
import db from '../../models/index.js';
import { activeSignal, BEHAVIOR_TIMESTAMP_FIELDS, signalTimestamp, usableBehaviorDate } from '../articles/articleBehaviorTime.js';
import { behaviorRecencyWeight, SIGNAL_HALF_LIFE_DAYS, DEFAULT_AUDIT_MAX_ARTICLE_IDS, DEFAULT_AUDIT_MAX_RUNS } from './islandVectorUtils.js';

// Provides the shared dependencies used by this service.
const { Article, Tag } = db;
export const MAX_AUDIT_RULE_TAGS_PER_ARTICLE = 10;
const snapshotDate = value => {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value).slice(0, 100);
};

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
export async function buildPopulationAuditEntry({ userId, articleIds = [], transaction }) {
  if (!articleIds.length) {
    return {
      runAt: new Date().toISOString(),
      articleIds: [],
      metrics: {
        relatedArticleCount: 0,
        starredCount: 0,
        clickedCount: 0,
        positiveCount: 0,
        meaningfulReadCount: 0,
        negativeCount: 0
      },
      sourceArticles: {
        starredArticleIds: [],
        clickedArticleIds: [],
        positiveArticleIds: [],
        meaningfulReadArticleIds: [],
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
      attributes: ['id', 'title', 'feedId', 'favoriteInd', 'clickedAmount', 'negativeInd',
        'positiveInd', 'attentionBucket', 'publishedAt', 'readAt', 'firstSeen', ...BEHAVIOR_TIMESTAMP_FIELDS],
      raw: true,
      transaction
    })
    : [];

  const now = Date.now();
  // Derives the article rows through sort while building population audit entry.
  const articleRows = rows
    .map(row => ({
      id: Number(row.id),
      title: String(row.title || '').slice(0, 300),
      feedId: row.feedId ?? null,
      positiveInd: Number(row.positiveInd || 0),
      attentionBucket: Number(row.attentionBucket || 0),
      ...Object.fromEntries(['publishedAt', 'readAt', 'firstSeen', ...BEHAVIOR_TIMESTAMP_FIELDS]
        .map(field => [field, snapshotDate(row[field])])),
      signalTimes: Object.fromEntries(BEHAVIOR_TIMESTAMP_FIELDS.map(field => [field, {
        active: activeSignal(row, field),
        halfLifeDays: SIGNAL_HALF_LIFE_DAYS[field],
        recencyWeight: behaviorRecencyWeight(signalTimestamp(row, field, now), SIGNAL_HALF_LIFE_DAYS[field]),
        effectiveAt: signalTimestamp(row, field, now)?.toISOString() ?? null,
        source: usableBehaviorDate(row[field], now) ? 'interaction'
          : usableBehaviorDate(row.publishedAt, now) ? 'publication_fallback' : 'unavailable'
      }])),
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

  const retainedArticles = articleRows.slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);
  // Tags retain the available rule-assignment provenance, not an invented rule definition ID.
  const tagLimit = retainedArticles.length * MAX_AUDIT_RULE_TAGS_PER_ARTICLE;
  const ruleTags = tagLimit ? await Tag.findAll({
    where: { userId, articleId: { [Op.in]: retainedArticles.map(row => row.id) }, tagType: 'rule' },
    attributes: ['id', 'articleId', 'name', 'createdAt'], order: [['id', 'ASC']],
    limit: tagLimit + 1, raw: true, transaction
  }) : [];
  const tagsByArticle = new Map();
  for (const tag of ruleTags.slice(0, tagLimit)) {
    const tags = tagsByArticle.get(Number(tag.articleId)) || [];
    tags.push({ id: Number(tag.id), name: String(tag.name || '').slice(0, 255), createdAt: snapshotDate(tag.createdAt) });
    tagsByArticle.set(Number(tag.articleId), tags);
  }
  for (const row of retainedArticles) {
    const tags = tagsByArticle.get(row.id) || [];
    row.ruleProvenance = {
      source: 'article_rule_tags', tags: tags.slice(0, MAX_AUDIT_RULE_TAGS_PER_ARTICLE),
      truncated: ruleTags.length > tagLimit || tags.length > MAX_AUDIT_RULE_TAGS_PER_ARTICLE
    };
  }
  const positiveRows = articleRows.filter(row => row.positiveInd === 1);
  const meaningfulReadRows = articleRows.filter(row => row.attentionBucket >= 3);
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
    articleIds: articleRows.map(row => row.id).slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS),
    metrics: {
      relatedArticleCount: articleRows.length,
      starredCount: starredRows.length,
      clickedCount: clickedRows.length,
      positiveCount: positiveRows.length,
      meaningfulReadCount: meaningfulReadRows.length,
      negativeCount: negativeRows.length
    },
    sourceArticles: {
      starredArticleIds,
      clickedArticleIds,
      positiveArticleIds: positiveRows.map(row => row.id).slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS),
      meaningfulReadArticleIds: meaningfulReadRows.map(row => row.id).slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS),
      negativeArticleIds,
      articles: retainedArticles
    }
  };
}
