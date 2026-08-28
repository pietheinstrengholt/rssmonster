import db from '../../../models/index.js';
import { shouldSkipSemanticLabeling } from '../../../config/intelligentFeatures.js';
import {
  loadSemanticLabelTitles,
  normalizeGeneratedSemanticLabel,
  requestSemanticLabels
} from '../../semanticLabels/semanticLabeling.js';
import {
  SEMANTIC_LABEL_CONTRACT_VERSION,
  SEMANTIC_LABEL_TARGET_CONFIG
} from '../../semanticLabels/semanticLabelJobs.js';

const defaultModels = {
  Article: db.Article,
  ArticleTopic: db.ArticleTopic,
  event: db.Event,
  island: db.Island,
  topic: db.Topic
};

const rowValue = (row, field) => typeof row?.getDataValue === 'function'
  ? row.getDataValue(field)
  : row?.[field];

const positiveId = (value, field) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new SemanticLabelJobError(
      'SEMANTIC_LABEL_INVALID_PAYLOAD',
      `Semantic label ${field} is invalid`,
      { retryable: false }
    );
  }
  return parsed;
};

export class SemanticLabelJobError extends Error {
  constructor(code, message, { retryable = true, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SemanticLabelJobError';
    this.code = code;
    this.retryable = retryable;
    this.requestId = cause?.requestId || null;
  }
}

const obsolete = reason => ({ status: 'obsolete', reason });

const jobTarget = job => {
  const payload = rowValue(job, 'payload') || {};
  const userId = positiveId(payload.userId, 'userId');
  const targetId = positiveId(payload.targetId, 'targetId');
  const targetType = String(payload.targetType || '').trim();
  if (!SEMANTIC_LABEL_TARGET_CONFIG[targetType]) {
    throw new SemanticLabelJobError(
      'SEMANTIC_LABEL_INVALID_PAYLOAD',
      'Semantic label targetType is invalid',
      { retryable: false }
    );
  }
  if (userId !== Number(rowValue(job, 'userId'))) {
    throw new SemanticLabelJobError(
      'SEMANTIC_LABEL_INVALID_PAYLOAD',
      'Semantic label target ownership does not match the claimed job',
      { retryable: false }
    );
  }
  if (Number(payload.labelContractVersion) !== SEMANTIC_LABEL_CONTRACT_VERSION) {
    return { obsolete: obsolete('label_contract_changed') };
  }
  return { userId, targetId, targetType };
};

const loadOwnedTarget = async ({ target, models, transaction = null, lock = null }) => {
  const config = SEMANTIC_LABEL_TARGET_CONFIG[target.targetType];
  return models[target.targetType].findOne({
    where: { id: target.targetId, userId: target.userId },
    attributes: [
      'id',
      'userId',
      config.field,
      ...(target.targetType === 'island' ? ['archivedInd', 'populationAudit'] : [])
    ],
    transaction,
    ...(lock ? { lock } : {})
  });
};

const targetObsoleteReason = (row, targetType) => {
  if (!row) return 'target_missing_or_foreign';
  if (targetType === 'island' && Boolean(rowValue(row, 'archivedInd'))) {
    return 'island_archived';
  }
  const field = SEMANTIC_LABEL_TARGET_CONFIG[targetType].field;
  if (normalizeGeneratedSemanticLabel(rowValue(row, field))) return 'already_labelled';
  return null;
};

const inferenceError = error => new SemanticLabelJobError(
  'SEMANTIC_LABEL_INFERENCE_FAILED',
  'Semantic label inference failed',
  { retryable: true, cause: error }
);

// Reloads owned semantic state and current bounded title context before optional inference.
export const handleSemanticLabelJob = async (job, options = {}) => {
  const parsed = jobTarget(job);
  if (parsed.obsolete) return parsed.obsolete;
  if (shouldSkipSemanticLabeling(options.environment || process.env)) {
    return obsolete('semantic_labeling_disabled');
  }

  const models = options.models || defaultModels;
  const targetRow = await loadOwnedTarget({ target: parsed, models });
  const initialObsoleteReason = targetObsoleteReason(targetRow, parsed.targetType);
  if (initialObsoleteReason) return obsolete(initialObsoleteReason);

  const titles = await loadSemanticLabelTitles({
    ...parsed,
    target: targetRow,
    models: {
      Article: models.Article,
      ArticleTopic: models.ArticleTopic
    }
  });
  if (!titles.length) return obsolete('no_current_context');

  await options.assertLease?.();
  let response;
  try {
    response = await (options.requestLabels || requestSemanticLabels)(
      { context: titles, [parsed.targetType]: true },
      { signal: options.signal }
    );
  } catch (error) {
    throw inferenceError(error);
  }
  const label = normalizeGeneratedSemanticLabel(response?.[parsed.targetType]);
  if (!label) {
    throw new SemanticLabelJobError(
      'SEMANTIC_LABEL_INVALID_RESULT',
      'Semantic label inference returned an invalid result',
      { retryable: false }
    );
  }
  await options.assertLease?.();

  const sequelize = options.sequelize || db.sequelize;
  return sequelize.transaction(async transaction => {
    const currentTarget = await loadOwnedTarget({
      target: parsed,
      models,
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const currentObsoleteReason = targetObsoleteReason(currentTarget, parsed.targetType);
    if (currentObsoleteReason) return obsolete(currentObsoleteReason);

    const field = SEMANTIC_LABEL_TARGET_CONFIG[parsed.targetType].field;
    await currentTarget.update({ [field]: label }, { transaction });
    return { status: 'labelled', targetType: parsed.targetType, targetId: parsed.targetId };
  });
};

export default handleSemanticLabelJob;
