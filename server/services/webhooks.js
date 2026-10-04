import { Op } from 'sequelize';
import db from '../models/index.js';
import { WEBHOOK_CONDITION_OPERATORS } from './webhookConditions.js';

const { Category, Feed, Webhook, WebhookCondition, sequelize } = db;
const WEBHOOK_KEYS = ['name', 'enabled', 'endpointUrl', 'secret', 'matchMode', 'conditions'];
const CONDITION_KEYS = ['field', 'operator', 'value'];
const positiveId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const invalid = (code, message) => ({ valid: false, error: { code, message } });

export const validateWebhookPayload = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !WEBHOOK_KEYS.includes(key))) {
    return invalid('WEBHOOK_INVALID', 'Provide a valid webhook definition.');
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return invalid('NAME_REQUIRED', 'Name cannot be empty.');
  if (name.length > 255) return invalid('NAME_TOO_LONG', 'Name must not exceed 255 characters.');

  const endpointUrl = typeof body.endpointUrl === 'string' ? body.endpointUrl.trim() : '';
  if (!endpointUrl || endpointUrl.length > 4096) {
    return invalid('ENDPOINT_URL_INVALID', 'Endpoint URL must be an HTTP or HTTPS URL of up to 4096 characters.');
  }
  try {
    const url = new URL(endpointUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    return invalid('ENDPOINT_URL_INVALID', 'Endpoint URL must be an HTTP or HTTPS URL of up to 4096 characters.');
  }
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return invalid('ENABLED_INVALID', 'Enabled must be a boolean.');
  }
  if (body.matchMode !== undefined && !['ALL', 'ANY'].includes(body.matchMode)) {
    return invalid('MATCH_MODE_INVALID', 'Match mode must be ALL or ANY.');
  }
  if (body.secret !== undefined && body.secret !== null &&
      (typeof body.secret !== 'string' || body.secret.length > 4096)) {
    return invalid('SECRET_INVALID', 'Signing secret must be text of up to 4096 characters or null.');
  }
  if (!Array.isArray(body.conditions)) {
    return invalid('CONDITIONS_INVALID', 'Conditions must be an array.');
  }

  const conditions = [];
  for (const [index, condition] of body.conditions.entries()) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition) ||
        Object.keys(condition).some(key => !CONDITION_KEYS.includes(key)) ||
        typeof condition.field !== 'string' || !Object.hasOwn(WEBHOOK_CONDITION_OPERATORS, condition.field) ||
        typeof condition.operator !== 'string' || !WEBHOOK_CONDITION_OPERATORS[condition.field].includes(condition.operator) ||
        typeof condition.value !== 'string' || !condition.value.trim() ||
        condition.value.trim().length > 4096 ||
        (['feed', 'category'].includes(condition.field) && !positiveId(condition.value.trim()))) {
      return invalid('CONDITION_INVALID', `Condition ${index + 1} has an invalid field, operator, or value.`);
    }
    conditions.push({ field: condition.field, operator: condition.operator, value: condition.value.trim() });
  }

  const values = { name, endpointUrl, conditions };
  if (body.enabled !== undefined) values.enabled = body.enabled;
  if (body.matchMode !== undefined) values.matchMode = body.matchMode;
  if (body.secret !== undefined) values.secret = body.secret;
  return { valid: true, values };
};

export const validateOwnedConditionValues = async (userId, conditions, transaction) => {
  for (const [field, model] of [['feed', Feed], ['category', Category]]) {
    const ids = [...new Set(conditions.filter(condition => condition.field === field).map(condition => Number(condition.value)))];
    if (!ids.length) continue;
    const count = await model.count({ where: { id: { [Op.in]: ids }, userId }, transaction });
    if (count !== ids.length) return invalid('CONDITION_VALUE_NOT_FOUND', 'A selected feed or category is unavailable.');
  }
  return { valid: true };
};

const conditionInclude = [{ model: WebhookCondition, as: 'conditions', attributes: ['id', 'field', 'operator', 'value'], required: false }];
const conditionOrder = [[{ model: WebhookCondition, as: 'conditions' }, 'id', 'ASC']];

export const findOwnedWebhook = (id, userId) => Webhook.findOne({
  where: { id, userId }, include: conditionInclude, order: conditionOrder
});

export const listOwnedWebhooks = userId => Webhook.findAll({
  where: { userId }, include: conditionInclude,
  order: [['name', 'ASC'], ['id', 'ASC'], ...conditionOrder]
});

export const serializeWebhook = webhook => {
  const values = webhook.get({ plain: true });
  return {
    id: values.id,
    name: values.name,
    enabled: Boolean(values.enabled),
    endpointUrl: values.endpointUrl,
    matchMode: values.matchMode,
    conditions: (values.conditions || []).map(({ id, field, operator, value }) => ({ id, field, operator, value })),
    createdAt: values.createdAt,
    updatedAt: values.updatedAt
  };
};

export const createOwnedWebhook = async (userId, { conditions, ...values }) => {
  const result = await sequelize.transaction({ logging: false }, async transaction => {
    const ownership = await validateOwnedConditionValues(userId, conditions, transaction);
    if (!ownership.valid) return ownership;
    const webhook = await Webhook.create({ userId, ...values }, { transaction, logging: false });
    if (conditions.length) await WebhookCondition.bulkCreate(
      conditions.map(condition => ({ ...condition, webhookId: webhook.id })),
      { transaction, logging: false }
    );
    return { valid: true, id: webhook.id };
  });
  return result.valid ? { valid: true, webhook: await findOwnedWebhook(result.id, userId) } : result;
};

export const updateOwnedWebhook = async (id, userId, { conditions, ...values }) => {
  const result = await sequelize.transaction({ logging: false }, async transaction => {
    const webhook = await Webhook.findOne({ where: { id, userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!webhook) return { notFound: true };
    const ownership = await validateOwnedConditionValues(userId, conditions, transaction);
    if (!ownership.valid) return ownership;
    await webhook.update(values, { transaction, logging: false });
    await WebhookCondition.destroy({ where: { webhookId: id }, transaction, logging: false });
    if (conditions.length) await WebhookCondition.bulkCreate(
      conditions.map(condition => ({ ...condition, webhookId: id })),
      { transaction, logging: false }
    );
    return { valid: true };
  });
  return result.valid ? { valid: true, webhook: await findOwnedWebhook(id, userId) } : result;
};
