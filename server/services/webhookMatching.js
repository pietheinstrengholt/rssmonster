import db from '../models/index.js';
import { WEBHOOK_CONDITION_OPERATORS } from './webhookConditions.js';

const { Webhook, WebhookCondition, WebhookDelivery } = db;
const read = (record, field) => typeof record?.getDataValue === 'function'
  ? record.getDataValue(field)
  : record?.[field];
const normalized = value => value == null ? '' : String(value).trim().toLowerCase();

const articleDomain = article => {
  try {
    return new URL(read(article, 'url')).hostname;
  } catch {
    return null;
  }
};

const conditionSource = (field, article, feed) => {
  if (field === 'feed') return read(feed, 'id');
  if (field === 'category') return read(feed, 'categoryId');
  if (field === 'domain') return articleDomain(article);
  if (field === 'content') return read(article, 'contentText');
  return read(article, field);
};

export const matchesWebhookCondition = (condition, article, feed) => {
  const field = read(condition, 'field');
  const operator = read(condition, 'operator');
  if (!Object.hasOwn(WEBHOOK_CONDITION_OPERATORS, field) ||
      !WEBHOOK_CONDITION_OPERATORS[field].includes(operator)) return false;

  const source = normalized(conditionSource(field, article, feed));
  const value = normalized(read(condition, 'value'));
  // Missing article metadata never satisfies a negative rule; it is unknown, not a mismatch.
  if (!source || !value) return false;
  if (operator === 'is') return source === value;
  if (operator === 'is_not') return source !== value;
  if (operator === 'contains') return source.includes(value);
  return !source.includes(value);
};

export const matchesWebhook = (webhook, article, feed) => {
  const conditions = webhook.conditions || [];
  if (!conditions.length) return false;
  if (webhook.matchMode === 'ALL') {
    return conditions.every(condition => matchesWebhookCondition(condition, article, feed));
  }
  if (webhook.matchMode === 'ANY') {
    return conditions.some(condition => matchesWebhookCondition(condition, article, feed));
  }
  return false;
};

// Called only for a newly inserted, accepted article inside its create transaction.
export const enqueueMatchingWebhooks = async ({ article, feed, transaction }) => {
  const webhooks = await Webhook.findAll({
    where: { userId: read(article, 'userId'), enabled: true },
    include: [{ model: WebhookCondition, as: 'conditions', required: false }],
    transaction
  });
  const rows = webhooks.filter(webhook => matchesWebhook(webhook, article, feed))
    .map(webhook => ({ webhookId: webhook.id, articleId: read(article, 'id') }));
  if (rows.length) await WebhookDelivery.bulkCreate(rows, { transaction, ignoreDuplicates: true });
  return rows.length;
};
