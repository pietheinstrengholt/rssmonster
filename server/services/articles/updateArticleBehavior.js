import db from '../../models/index.js';
import { BEHAVIOR_TIMESTAMP_FIELDS } from './articleBehaviorTime.js';
import { requestPersonalizationRefresh, requestExplicitFeedbackRefresh } from '../jobs/personalizationRefresh.js';

// API variants share an atomic behavior write and durable refresh request.
export async function updateArticleBehavior(target, values, options = {}) {
  if (!BEHAVIOR_TIMESTAMP_FIELDS.some(field => Object.hasOwn(values, field))) {
    return target.update(values, options);
  }
  const userId = target === db.Article ? options.where?.userId : target.userId;
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    throw new TypeError('Behavior updates require an owned user');
  }
  const triggerReasons = [
    ...(Object.hasOwn(values, 'favoritedAt') ? [values.favoriteInd ? 'favorite' : 'unfavorite'] : []),
    ...(values.positiveFeedbackAt ? ['more-like-this'] : []),
    ...(values.negativeFeedbackAt ? ['not-interested'] : []),
    ...(Object.hasOwn(values, 'lastClickedAt') ? [values.lastClickedAt ? 'click' : 'click-cleared'] : []),
    ...(values.lastMeaningfulReadAt ? ['deep-read'] : [])
  ];
  const write = async transaction => {
    // Serialize requests before article locks, including bulk compatibility writes.
    const user = await db.User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new Error('Behavior user no longer exists');
    const result = await target.update(values, { ...options, transaction });
    if (target !== db.Article || Number(result[0]) > 0) {
      await requestPersonalizationRefresh(userId, { transaction, triggerReasons });
      if (values.positiveFeedbackAt || values.negativeFeedbackAt) {
        const articleId = target === db.Article ? options.where?.id : target.id;
        await requestExplicitFeedbackRefresh(userId, articleId, { transaction, triggerReasons });
      }
    }
    return result;
  };
  return options.transaction ? write(options.transaction) : db.sequelize.transaction(
    db.sequelize.getDialect() === 'sqlite' ? { type: db.Sequelize.Transaction.TYPES.IMMEDIATE } : {}, write
  );
}
