import db from '../../models/index.js';
import { Op } from 'sequelize';

const { Article } = db;

export const BRIEFING_ELIGIBILITY_SQL = `(
  articles.interestScore <> 0
  OR EXISTS (
    SELECT 1
    FROM events briefing_event
    WHERE briefing_event.id = articles.eventId
      AND briefing_event.userId = articles.userId
      AND briefing_event.articleCount > 1
  )
)`;

const INTEREST_MATCHED_ELIGIBILITY_SQL = 'articles.interestScore <> 0';
const DEVELOPING_EVENT_ELIGIBILITY_SQL = `EXISTS (
  SELECT 1
  FROM events briefing_event
  WHERE briefing_event.id = articles.eventId
    AND briefing_event.userId = articles.userId
    AND briefing_event.articleCount > 1
)`;

// This function normalizes the configured distinct-source threshold.
const normalizeMinimumDistinctSources = value => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 1
    ? Math.min(numericValue, 127)
    : 1;
};

// This function returns briefing eligibility with the configured event-source threshold.
export function briefingEligibilitySql({
  minDistinctSources = 1,
  showOnlyInterestMatchedArticles = false,
  showOnlyDevelopingEventArticles = false
} = {}) {
  const minimumSources = normalizeMinimumDistinctSources(minDistinctSources);
  const baseEligibilitySql = showOnlyInterestMatchedArticles
    ? INTEREST_MATCHED_ELIGIBILITY_SQL
    : (showOnlyDevelopingEventArticles
      ? DEVELOPING_EVENT_ELIGIBILITY_SQL
      : BRIEFING_ELIGIBILITY_SQL);
  const conditions = [baseEligibilitySql];

  if (minimumSources > 1) {
    conditions.push(`(
      SELECT COUNT(DISTINCT briefing_source_article.feedId)
      FROM articles briefing_source_article
      WHERE briefing_source_article.eventId = articles.eventId
        AND briefing_source_article.userId = articles.userId
        AND briefing_source_article.filteredInd = 0
        AND briefing_source_article.duplicateOfArticleId IS NULL
    ) >= ${minimumSources}`);
  }

  return conditions.length === 1
    ? baseEligibilitySql
    : `(${conditions.join('\n    AND ')})`;
}

// This function returns the shared SQL literal for included or excluded briefing articles.
export function briefingEligibilityLiteral(included = true, options = {}) {
  const eligibilitySql = briefingEligibilitySql(options);
  const predicate = included
    ? eligibilitySql
    : `NOT ${eligibilitySql}`;

  return Article.sequelize.literal(predicate);
}

// This function appends the shared briefing predicate to an existing Sequelize where clause.
export function applyBriefingEligibility(whereClause, included = true, options = {}) {
  whereClause[Op.and] ??= [];
  whereClause[Op.and].push(briefingEligibilityLiteral(included, options));
  return whereClause;
}
