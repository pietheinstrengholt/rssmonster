import db from '../../models/index.js';
import { Op } from 'sequelize';
import { DEVELOPING_STORY_ELIGIBILITY_SQL } from './developingStoryEligibility.service.js';

// Provides the shared dependencies used by this service.
const { Article } = db;

// Defines the briefing eligibility sql enforced by this service.
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

// Defines the interest matched eligibility sql enforced by this service.
const INTEREST_MATCHED_ELIGIBILITY_SQL = 'articles.interestScore <> 0';
// This function normalizes the configured distinct-source threshold.
const normalizeMinimumDistinctSources = value => {
  // Coerces the numeric value into the representation required while normalizing minimum distinct sources.
  const numericValue = Number(value);
  // Selects the result based on whether numeric value is an integer and numeric value exceeds 1.
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
  // Normalizes the minimum sources before performing briefing eligibility sql.
  const minimumSources = normalizeMinimumDistinctSources(minDistinctSources);
  // Selects the base eligibility sql based on whether show only interest matched articles is available.
  const baseEligibilitySql = showOnlyInterestMatchedArticles
    ? INTEREST_MATCHED_ELIGIBILITY_SQL
    : (showOnlyDevelopingEventArticles
      ? DEVELOPING_STORY_ELIGIBILITY_SQL
      : BRIEFING_ELIGIBILITY_SQL);
  // Collects the conditions while performing briefing eligibility sql.
  const conditions = [baseEligibilitySql];

  // Handles the case where minimum sources exceeds 1.
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

  // Selects the result based on whether conditions count is 1.
  return conditions.length === 1
    ? baseEligibilitySql
    : `(${conditions.join('\n    AND ')})`;
}

// This function returns the shared SQL literal for included or excluded briefing articles.
export function briefingEligibilityLiteral(included = true, options = {}) {
  // Derives the eligibility sql through briefing eligibility sql while performing briefing eligibility literal.
  const eligibilitySql = briefingEligibilitySql(options);
  // Selects the predicate based on whether included is available.
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
