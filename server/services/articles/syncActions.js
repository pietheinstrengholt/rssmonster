import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { updateArticleBehavior } from './updateArticleBehavior.js';
import { articleStateValues } from './articleInteractionState.js';
import { retryDatabaseTransaction } from '../../utils/databaseRetry.js';

const { Article, ArticleSyncAction, Feed, User, Sequelize: { Op } } = db;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validSyncActions = body => Boolean(body && Array.isArray(body.actions) && body.actions.length > 0 && body.actions.length <= 50
  && body.actions.every(action => action && typeof action.actionId === 'string' && UUID.test(action.actionId)
    && Number.isSafeInteger(action.articleId) && action.articleId > 0
    && ((action.kind === 'set-status' && ['read', 'unread'].includes(action.value))
      || (action.kind === 'set-favorite' && typeof action.value === 'boolean'))));

const applyAction = (userId, action) => retryDatabaseTransaction(db.sequelize, async transaction => {
  // Follow the existing behavior-write order: user, receipt, then article.
  const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!user) throw new Error('Synchronization user no longer exists');
  const actionId = action.actionId.toLowerCase();
  const value = String(action.value);
  const receipt = await ArticleSyncAction.findOne({ where: { userId, actionId }, transaction });
  if (receipt) {
    if (Number(receipt.articleId) !== action.articleId || receipt.kind !== action.kind || receipt.value !== value) {
      return { actionId: action.actionId, outcome: 'rejected', errorCode: 'ACTION_ID_REUSED' };
    }
    return { actionId: action.actionId, outcome: receipt.outcome === 'rejected' ? 'rejected' : 'duplicate',
      ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}) };
  }
  const article = await Article.findOne({
    where: { id: action.articleId, userId, ...canonicalArticleWhere() },
    include: [{ model: Feed, required: true }], transaction, lock: transaction.LOCK.UPDATE
  });
  let outcome = 'rejected';
  const errorCode = article ? null : 'ARTICLE_UNAVAILABLE';
  if (article) {
    const same = action.kind === 'set-status' ? article.status === action.value : Number(article.favoriteInd) === Number(action.value);
    outcome = same ? 'noop' : 'applied';
    if (!same) await updateArticleBehavior(article, articleStateValues(action.kind, action.value), { transaction });
  }
  await ArticleSyncAction.create({ userId, actionId, articleId: action.articleId, kind: action.kind, value, outcome, errorCode }, { transaction });
  return { actionId: action.actionId, outcome, ...(errorCode ? { errorCode } : {}) };
});

export const synchronizeArticleActions = async (userId, actions) => {
  const results = [];
  let blocked = false;
  for (const action of actions) {
    if (blocked) {
      results.push({ actionId: action.actionId, outcome: 'retry', errorCode: 'PREVIOUS_ACTION_RETRY' });
      continue;
    }
    try { results.push(await applyAction(userId, action)); } catch (error) {
      console.error('Could not synchronize article action:', error);
      results.push({ actionId: action.actionId, outcome: 'retry', errorCode: 'SYNC_WRITE_FAILED' });
      blocked = true;
    }
  }
  // Return current state, never an old receipt's historical projection or foreign rows.
  const articles = await Article.findAll({
    where: { userId, id: { [Op.in]: [...new Set(actions.map(action => action.articleId))] }, ...canonicalArticleWhere() },
    attributes: ['id', 'status', 'favoriteInd', 'readAt', 'favoritedAt', 'feedId'],
    include: [{ model: Feed, required: true, attributes: ['id', 'categoryId'] }]
  });
  return { results, articles, serverTime: new Date().toISOString() };
};
