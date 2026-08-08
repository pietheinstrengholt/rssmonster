import db from '../../models/index.js';
import { Op } from 'sequelize';

// Provides the Article model used to construct shared SQL predicates.
const { Article } = db;

// Defines the persisted conditions represented by the Article isDevelopingStory virtual field.
export const DEVELOPING_STORY_ELIGIBILITY_SQL = `(
  articles.status = 'unread'
  AND EXISTS (
    SELECT 1
    FROM events developing_story_event
    WHERE developing_story_event.id = articles.eventId
      AND developing_story_event.userId = articles.userId
      AND developing_story_event.developingArticleId IS NOT NULL
      AND developing_story_event.developingArticleId <> developing_story_event.representativeArticleId
      AND developing_story_event.developingArticleId = articles.id
  )
)`;

// This function returns the shared SQL literal for developing or non-developing articles.
export function developingStoryEligibilityLiteral(included = true) {
  const predicate = included
    ? DEVELOPING_STORY_ELIGIBILITY_SQL
    : `NOT ${DEVELOPING_STORY_ELIGIBILITY_SQL}`;

  return Article.sequelize.literal(predicate);
}

// This function appends the exact isDevelopingStory predicate to a Sequelize where clause.
export function applyDevelopingStoryEligibility(whereClause, included = true) {
  whereClause[Op.and] ??= [];
  whereClause[Op.and].push(developingStoryEligibilityLiteral(included));
  return whereClause;
}
