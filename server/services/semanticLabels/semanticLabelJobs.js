import { Op } from 'sequelize';
import db from '../../models/index.js';
import { shouldSkipSemanticLabeling } from '../../config/intelligentFeatures.js';
import { enqueueProcessingJob } from '../jobs/processingJobQueue.js';

export const SEMANTIC_LABEL_JOB_TYPE = 'semantic_label';
export const SEMANTIC_LABEL_CONTRACT_VERSION = 1;
export const DEFAULT_SEMANTIC_LABEL_RECONCILE_LIMIT = 100;
const MAX_RECONCILE_LIMIT = 500;

const defaultModels = {
  event: db.Event,
  topic: db.Topic,
  island: db.Island
};

export const SEMANTIC_LABEL_TARGET_CONFIG = Object.freeze({
  event: Object.freeze({ field: 'generatedName' }),
  topic: Object.freeze({ field: 'generatedName' }),
  island: Object.freeze({ field: 'generatedLabel' })
});

const rowValue = (row, field) => typeof row?.getDataValue === 'function'
  ? row.getDataValue(field)
  : row?.[field];

const positiveId = (value, field) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return parsed;
};

const normalizeIds = values => [...new Set((values || [])
  .map(Number)
  .filter(value => Number.isSafeInteger(value) && value > 0))];

const targetIds = (targets, targetType) => normalizeIds(targets?.[`${targetType}Ids`]);

const targetWhere = ({ targetType, userId, ids = null }) => {
  const config = SEMANTIC_LABEL_TARGET_CONFIG[targetType];
  return {
    userId,
    ...(ids ? { id: { [Op.in]: ids } } : {}),
    [config.field]: null,
    ...(targetType === 'island' ? { archivedInd: false } : {})
  };
};

export const semanticLabelDedupeKey = ({ userId, targetType, targetId }) => (
  `semantic-label:${SEMANTIC_LABEL_CONTRACT_VERSION}:${positiveId(userId, 'userId')}` +
  `:${targetType}:${positiveId(targetId, 'targetId')}`
);

const enqueueKnownSemanticLabelTarget = ({
  userId,
  targetType,
  targetId,
  transaction,
  enqueueJob
}) => enqueueJob({
  type: SEMANTIC_LABEL_JOB_TYPE,
  userId,
  articleId: null,
  dedupeKey: semanticLabelDedupeKey({ userId, targetType, targetId }),
  payload: {
    userId,
    targetType,
    targetId,
    labelContractVersion: SEMANTIC_LABEL_CONTRACT_VERSION
  }
}, { transaction });

// Enqueues one label only after verifying that its unlabelled target exists and is owned.
export const enqueueSemanticLabelJob = async ({
  userId,
  targetType,
  targetId,
  transaction = null
}, options = {}) => {
  const normalizedUserId = positiveId(userId, 'userId');
  const normalizedTargetId = positiveId(targetId, 'targetId');
  const config = SEMANTIC_LABEL_TARGET_CONFIG[targetType];
  if (!config) throw new TypeError('targetType must be event, topic, or island');
  if (shouldSkipSemanticLabeling(options.environment || process.env)) {
    return { created: false, skipped: 'disabled' };
  }

  const model = (options.models || defaultModels)[targetType];
  const target = await model.findOne({
    where: targetWhere({
      targetType,
      userId: normalizedUserId,
      ids: [normalizedTargetId]
    }),
    attributes: ['id'],
    transaction
  });
  if (!target) return { created: false, skipped: 'ineligible' };

  return enqueueKnownSemanticLabelTarget({
    userId: normalizedUserId,
    targetType,
    targetId: normalizedTargetId,
    transaction,
    enqueueJob: options.enqueueJob || enqueueProcessingJob
  });
};

// Enqueues newly-created owned semantic targets without ever carrying title context in jobs.
export const enqueueGeneratedSemanticLabelJobsForUser = async (
  userId,
  targets = {},
  options = {}
) => {
  const normalizedUserId = positiveId(userId, 'userId');
  const summary = { eventCount: 0, topicCount: 0, islandCount: 0 };
  if (shouldSkipSemanticLabeling(options.environment || process.env)) return summary;

  const models = options.models || defaultModels;
  const enqueueJob = options.enqueueJob || enqueueProcessingJob;
  for (const targetType of Object.keys(SEMANTIC_LABEL_TARGET_CONFIG)) {
    const ids = targetIds(targets, targetType);
    if (!ids.length) continue;
    const rows = await models[targetType].findAll({
      where: targetWhere({ targetType, userId: normalizedUserId, ids }),
      attributes: ['id'],
      order: [['id', 'ASC']],
      transaction: options.transaction || null
    });
    for (const row of rows) {
      const result = await enqueueKnownSemanticLabelTarget({
        userId: normalizedUserId,
        targetType,
        targetId: positiveId(rowValue(row, 'id'), 'targetId'),
        transaction: options.transaction || null,
        enqueueJob
      });
      if (result.created) summary[`${targetType}Count`] += 1;
    }
  }
  return summary;
};

// Label enqueue failures are optional and must never fail deterministic semantic persistence.
export const tryEnqueueGeneratedSemanticLabelJobsForUser = async (
  userId,
  targets = {},
  options = {}
) => {
  try {
    return await enqueueGeneratedSemanticLabelJobsForUser(userId, targets, options);
  } catch (error) {
    (options.logger || console).warn(
      `[SEMANTIC LABEL JOB] user=${userId} enqueue skipped`,
      { code: error?.code || 'SEMANTIC_LABEL_ENQUEUE_FAILED' }
    );
    return {
      eventCount: 0,
      topicCount: 0,
      islandCount: 0,
      enqueueFailed: true
    };
  }
};

// Enqueues a bounded set of eligible null-label rows to repair post-commit enqueue gaps.
export const reconcileSemanticLabelJobsForUser = async (userId, options = {}) => {
  const normalizedUserId = positiveId(userId, 'userId');
  const requestedLimit = Number.parseInt(
    options.limit ?? DEFAULT_SEMANTIC_LABEL_RECONCILE_LIMIT,
    10
  );
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_RECONCILE_LIMIT)
    : DEFAULT_SEMANTIC_LABEL_RECONCILE_LIMIT;
  const summary = { eventCount: 0, topicCount: 0, islandCount: 0, scannedCount: 0 };
  if (shouldSkipSemanticLabeling(options.environment || process.env)) return summary;

  const models = options.models || defaultModels;
  const enqueueJob = options.enqueueJob || enqueueProcessingJob;
  let remaining = limit;
  for (const targetType of Object.keys(SEMANTIC_LABEL_TARGET_CONFIG)) {
    if (remaining === 0) break;
    const rows = await models[targetType].findAll({
      where: targetWhere({ targetType, userId: normalizedUserId }),
      attributes: ['id'],
      order: [['id', 'ASC']],
      limit: remaining
    });
    summary.scannedCount += rows.length;
    remaining -= rows.length;
    for (const row of rows) {
      const result = await enqueueKnownSemanticLabelTarget({
        userId: normalizedUserId,
        targetType,
        targetId: positiveId(rowValue(row, 'id'), 'targetId'),
        transaction: null,
        enqueueJob
      });
      if (result.created) summary[`${targetType}Count`] += 1;
    }
  }
  return summary;
};

// Reconciliation repairs optional enqueue gaps without failing deterministic crawl work.
export const tryReconcileSemanticLabelJobsForUser = async (userId, options = {}) => {
  try {
    return await reconcileSemanticLabelJobsForUser(userId, options);
  } catch (error) {
    (options.logger || console).warn(
      `[SEMANTIC LABEL JOB] user=${userId} reconciliation skipped`,
      { code: error?.code || 'SEMANTIC_LABEL_RECONCILIATION_FAILED' }
    );
    return {
      eventCount: 0,
      topicCount: 0,
      islandCount: 0,
      scannedCount: 0,
      reconciliationFailed: true
    };
  }
};

export default enqueueGeneratedSemanticLabelJobsForUser;
