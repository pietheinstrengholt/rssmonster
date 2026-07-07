import db from '../../models/index.js';
import { Op } from 'sequelize';

import { normalizeTopicAssignments, primaryTopicId } from '../topics/event/eventTopicAssignment.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

const { Article, ArticleTopic } = db;

// This function mirrors event topic assignments to each article in the event.
// It only replaces event-owned ArticleTopic rows so behavioral evidence is preserved.
export async function syncEventTopicsToArticles(eventId, eventTopicAssignments) {
  const normalizedAssignments = normalizeTopicAssignments(eventTopicAssignments);
  const primaryId = primaryTopicId(normalizedAssignments);

  const eventArticles = await Article.findAll({
    where: { eventId, ...canonicalArticleWhere() },
    attributes: ['id'],
    raw: true
  });

  const articleIds = eventArticles.map(article => Number(article.id)).filter(Boolean);
  if (!articleIds.length) return 0;

  await ArticleTopic.destroy({
    where: {
      articleId: { [Op.in]: articleIds },
      topicId: {
        [Op.in]: db.Sequelize.literal(
          `(SELECT id FROM topics WHERE topicType IN ('event', 'hybrid'))`
        )
      }
    }
  });

  if (normalizedAssignments.length) {
    const rows = [];
    for (const articleId of articleIds) {
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

    await ArticleTopic.bulkCreate(rows);
  }

  // Article.topicId represents the primary event/hybrid topic only.
  // Behavioral topic membership lives in article_topics.
  await Article.update(
    { topicId: primaryId },
    {
      where: {
        id: { [Op.in]: articleIds }
      }
    }
  );

  return articleIds.length;
}
