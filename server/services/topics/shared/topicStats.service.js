import db from '../../../models/index.js';
import { canonicalArticleWhere } from '../../duplicates/articleDuplicates.js';

// Provides the shared dependencies used by this service.
const { Article, Event, Topic, ArticleTopic, EventTopic } = db;

// This function recomputes denormalized topic counts for event and hybrid topics after assignment changes.
export async function recomputeTopicStatsForUser(userId, topicIds) {
  // Returns early when topic id is empty.
  if (!topicIds.length) return;

  // Collects the unique topic id while performing recompute topic stats for user.
  const uniqueTopicIds = [...new Set(topicIds.map(Number).filter(Boolean))];

  // Maps source values into the result produced while performing recompute topic stats for user.
  await Promise.all(
    uniqueTopicIds.map(async topicId => {
      // Loads the related records concurrently while performing recompute topic stats for user.
      const [articleCount, eventCount, lastEventRow] = await Promise.all([
        ArticleTopic.count({
          where: { topicId },
          include: [{
            model: Article,
            required: true,
            attributes: [],
            where: { userId, ...canonicalArticleWhere() }
          }],
          distinct: true,
          col: 'articleId'
        }),
        EventTopic.count({
          where: { topicId },
          include: [{
            model: Event,
            required: true,
            attributes: [],
            where: { userId }
          }],
          distinct: true,
          col: 'eventId'
        }),
        Event.findOne({
          where: { userId },
          include: [{
            model: EventTopic,
            required: true,
            attributes: [],
            where: { topicId }
          }],
          order: [['eventWindowEndAt', 'DESC']],
          attributes: ['eventWindowEndAt']
        })
      ]);

      await Topic.update(
        {
          articleCount,
          eventCount,
          lastActivityAt: lastEventRow?.eventWindowEndAt || null
        },
        { where: { id: topicId, userId } }
      );
    })
  );
}
