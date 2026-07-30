import db from '../../models/index.js';
import { Op } from 'sequelize';

import { normalizeTopicAssignments, primaryTopicId } from '../topics/event/eventTopicAssignment.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

// Provides the shared dependencies used by this service.
const { Article, ArticleTopic } = db;

// This function mirrors event topic assignments to each article in the event.
// It only replaces event-owned ArticleTopic rows so behavioral evidence is preserved.
export async function syncEventTopicsToArticles(eventId, eventTopicAssignments, transaction = null) {
  // Normalizes the assignments before synchronizing event topics to articles.
  const normalizedAssignments = normalizeTopicAssignments(eventTopicAssignments);
  // Derives the primary id through primary topic id while synchronizing event topics to articles.
  const primaryId = primaryTopicId(normalizedAssignments);

  // Loads the event articles needed while synchronizing event topics to articles.
  const eventArticles = await Article.findAll({
    where: { eventId, ...canonicalArticleWhere() },
    attributes: ['id'],
    raw: true,
    transaction
  });

  // Keeps the article id entries eligible while synchronizing event topics to articles.
  const articleIds = eventArticles.map(article => Number(article.id)).filter(Boolean);
  // Returns early when article id is empty.
  if (!articleIds.length) return 0;

  await ArticleTopic.destroy({
    where: {
      articleId: { [Op.in]: articleIds },
      topicId: {
        [Op.in]: db.Sequelize.literal(
          `(SELECT id FROM topics WHERE topicType IN ('event', 'hybrid'))`
        )
      }
    },
    transaction
  });

  // Handles the case where normalized assignments is non-empty.
  if (normalizedAssignments.length) {
    // Collects the rows while synchronizing event topics to articles.
    const rows = [];
    // Processes each article id entry in turn.
    for (const articleId of articleIds) {
      // Processes each normalized assignments entry in turn.
      for (const assignment of normalizedAssignments) {
        rows.push({
          articleId,
          topicId: assignment.topicId,
          confidence: assignment.confidence,
          rank: assignment.rank,
          primaryInd: assignment.primaryInd
        });
      }
    }

    await ArticleTopic.bulkCreate(rows, { transaction });
  }

  // Article.topicId represents the primary event/hybrid topic only.
  // Behavioral topic membership lives in article_topics.
  await Article.update(
    { topicId: primaryId },
    {
      where: {
        id: { [Op.in]: articleIds }
      },
      transaction
    }
  );

  return articleIds.length;
}
