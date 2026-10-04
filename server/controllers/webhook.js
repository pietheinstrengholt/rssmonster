import db from '../models/index.js';
import {
  createOwnedWebhook,
  findOwnedWebhook,
  listOwnedWebhooks,
  serializeWebhook,
  updateOwnedWebhook,
  validateWebhookPayload
} from '../services/webhooks.js';

const { Webhook } = db;
const NOT_FOUND = { message: 'Webhook not found' };
const userIdFor = req => req.userData?.userId;

// Persistence errors can contain SQL parameters, including encrypted secrets.
const logWebhookError = (operation, error) => console.error(`Unable to ${operation} webhook:`, {
  name: error?.name || 'Error',
  code: error?.original?.code || error?.code || null
});

const listWebhooks = async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  try {
    const webhooks = await listOwnedWebhooks(userId);
    return res.status(200).json({ total: webhooks.length, webhooks: webhooks.map(serializeWebhook) });
  } catch (error) {
    logWebhookError('list', error);
    return res.status(500).json({ error: 'Unable to list webhooks' });
  }
};

const getWebhook = async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  try {
    const webhook = await findOwnedWebhook(req.params.id, userId);
    return webhook
      ? res.status(200).json({ webhook: serializeWebhook(webhook) })
      : res.status(404).json(NOT_FOUND);
  } catch (error) {
    logWebhookError('load', error);
    return res.status(500).json({ error: 'Unable to load webhook' });
  }
};

const createWebhook = async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  const validation = validateWebhookPayload(req.body);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  try {
    const result = await createOwnedWebhook(userId, validation.values);
    return result.valid
      ? res.status(201).json({ webhook: serializeWebhook(result.webhook) })
      : res.status(400).json({ error: result.error });
  } catch (error) {
    logWebhookError('create', error);
    return res.status(500).json({ error: 'Unable to create webhook' });
  }
};

const updateWebhook = async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  const validation = validateWebhookPayload(req.body);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  try {
    const result = await updateOwnedWebhook(req.params.id, userId, validation.values);
    if (result.notFound) return res.status(404).json(NOT_FOUND);
    return result.valid
      ? res.status(200).json({ webhook: serializeWebhook(result.webhook) })
      : res.status(400).json({ error: result.error });
  } catch (error) {
    logWebhookError('update', error);
    return res.status(500).json({ error: 'Unable to update webhook' });
  }
};

const deleteWebhook = async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  try {
    const deleted = await Webhook.destroy({ where: { id: req.params.id, userId } });
    return deleted ? res.status(204).send() : res.status(404).json(NOT_FOUND);
  } catch (error) {
    logWebhookError('delete', error);
    return res.status(500).json({ error: 'Unable to delete webhook' });
  }
};

export default { listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook };
