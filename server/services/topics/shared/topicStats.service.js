import db from '../../../models/index.js';
import { canonicalArticleWhere } from '../../duplicates/articleDuplicates.js';

const { Article, Event, Topic, ArticleTopic, EventTopic } = db;

// This function recomputes denormalized topic counts for event and hybrid topics after assignment changes.
export async function recomputeTopicStatsForUser(userId, topicIds) {
  if (!topicIds.length) return;

  const uniqueTopicIds = [...new Set(topicIds.map(Number).filter(Boolean))];

  await Promise.all(
    uniqueTopicIds.map(async topicId => {
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
