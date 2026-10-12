import db from '../models/index.js';
import {
  ArticleExpressionValidationError,
  validateArticleExpression
} from '../services/articleSearch/articleQueryParser.service.js';
import { persistWithGeneratedFeedToken } from '../services/generatedFeedTokens.js';

const { GeneratedFeed } = db;
const GENERATED_FEED_DESCRIPTION_MAX_LENGTH = 2000;
const GENERATED_FEED_NOT_FOUND = { message: 'Generated Feed not found' };

// Logs only bounded diagnostic identifiers because persistence errors may contain bearer tokens.
const logGeneratedFeedError = (operation, error) => {
  console.error(`Unable to ${operation} Generated Feed:`, {
    name: error?.name || 'Error',
    code: error?.original?.code || error?.code || null
  });
};

// Returns the authenticated owner identifier expected by every management operation.
const managementUserId = req => req.userData?.userId;

// Builds the external URL returned only through authenticated management APIs.
const generatedFeedUrl = (req, token) =>
  `${req.protocol}://${req.get('host')}/rss/generated/${token}`;

// Converts a model instance into the stable Generated Feed management contract.
const serializeGeneratedFeed = (generatedFeed, req) => {
  const values = typeof generatedFeed.get === 'function'
    ? generatedFeed.get({ plain: true })
    : generatedFeed;

  return {
    id: values.id,
    name: values.name,
    description: values.description,
    expression: values.expression,
    token: values.token,
    rssUrl: generatedFeedUrl(req, values.token),
    enabled: Boolean(values.enabled),
    tokenRegeneratedAt: values.tokenRegeneratedAt,
    createdAt: values.createdAt,
    updatedAt: values.updatedAt
  };
};

// Returns a structured validation failure shared by create and update operations.
const validationFailure = (code, message) => ({
  valid: false,
  response: { error: { code, message } }
});

// Validates and normalizes mutable Generated Feed fields.
const validateGeneratedFeedPayload = (body, { partial = false } = {}) => {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const values = {};

  if (!partial || Object.hasOwn(source, 'name')) {
    if (typeof source.name !== 'string' || !source.name.trim()) {
      return validationFailure('NAME_REQUIRED', 'Name cannot be empty.');
    }
    if (source.name.trim().length > 255) {
      return validationFailure('NAME_TOO_LONG', 'Name must not exceed 255 characters.');
    }
    values.name = source.name.trim();
  }

  if (!partial || Object.hasOwn(source, 'expression')) {
    if (typeof source.expression !== 'string') {
      return validationFailure('EXPRESSION_REQUIRED', 'Expression cannot be empty.');
    }
    try {
      validateArticleExpression(source.expression);
    } catch (error) {
      if (error instanceof ArticleExpressionValidationError) {
        return validationFailure(error.code, error.message);
      }
      throw error;
    }
    values.expression = source.expression.trim();
  }

  if (Object.hasOwn(source, 'description')) {
    if (source.description !== null && typeof source.description !== 'string') {
      return validationFailure(
        'DESCRIPTION_INVALID',
        'Description must be text or null.'
      );
    }
    const description = source.description?.trim() || null;
    if (description && description.length > GENERATED_FEED_DESCRIPTION_MAX_LENGTH) {
      return validationFailure(
        'DESCRIPTION_TOO_LONG',
        `Description must not exceed ${GENERATED_FEED_DESCRIPTION_MAX_LENGTH} characters.`
      );
    }
    values.description = description;
  } else if (!partial) {
    values.description = null;
  }

  if (Object.hasOwn(source, 'enabled')) {
    if (typeof source.enabled !== 'boolean') {
      return validationFailure('ENABLED_INVALID', 'Enabled must be a boolean.');
    }
    values.enabled = source.enabled;
  } else if (!partial) {
    values.enabled = true;
  }

  if (partial && Object.keys(values).length === 0) {
    return validationFailure('UPDATE_EMPTY', 'No supported fields were provided.');
  }

  return { valid: true, values };
};

// Finds a Generated Feed without allowing a valid record id to bypass ownership.
const findOwnedGeneratedFeed = (id, userId) => GeneratedFeed.findOne({
  where: { id, userId }
});

const listGeneratedFeeds = async (req, res) => {
  const userId = managementUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });

  try {
    const generatedFeeds = await GeneratedFeed.findAll({
      where: { userId },
      order: [['name', 'ASC'], ['id', 'ASC']]
    });

    return res.status(200).json({
      total: generatedFeeds.length,
      generatedFeeds: generatedFeeds.map(feed => serializeGeneratedFeed(feed, req))
    });
  } catch (error) {
    logGeneratedFeedError('list', error);
    return res.status(500).json({ error: 'Unable to list Generated Feeds' });
  }
};

const getGeneratedFeed = async (req, res) => {
  const userId = managementUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });

  try {
    const generatedFeed = await findOwnedGeneratedFeed(req.params.id, userId);
    if (!generatedFeed) return res.status(404).json(GENERATED_FEED_NOT_FOUND);

    return res.status(200).json({
      generatedFeed: serializeGeneratedFeed(generatedFeed, req)
    });
  } catch (error) {
    logGeneratedFeedError('load', error);
    return res.status(500).json({ error: 'Unable to load Generated Feed' });
  }
};

const createGeneratedFeed = async (req, res) => {
  const userId = managementUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });

  const validation = validateGeneratedFeedPayload(req.body);
  if (!validation.valid) return res.status(400).json(validation.response);

  try {
    const now = new Date();
    const generatedFeed = await persistWithGeneratedFeedToken(token =>
      GeneratedFeed.create({
        userId,
        ...validation.values,
        token,
        tokenRegeneratedAt: now
      })
    );

    return res.status(201).json({
      generatedFeed: serializeGeneratedFeed(generatedFeed, req)
    });
  } catch (error) {
    logGeneratedFeedError('create', error);
    return res.status(500).json({ error: 'Unable to create Generated Feed' });
  }
};

const updateGeneratedFeed = async (req, res) => {
  const userId = managementUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });

  const validation = validateGeneratedFeedPayload(req.body, { partial: true });
  if (!validation.valid) return res.status(400).json(validation.response);

  try {
    const generatedFeed = await findOwnedGeneratedFeed(req.params.id, userId);
    if (!generatedFeed) return res.status(404).json(GENERATED_FEED_NOT_FOUND);

    await generatedFeed.update(validation.values);
    return res.status(200).json({
      generatedFeed: serializeGeneratedFeed(generatedFeed, req)
    });
  } catch (error) {
    logGeneratedFeedError('update', error);
    return res.status(500).json({ error: 'Unable to update Generated Feed' });
  }
};

const deleteGeneratedFeed = async (req, res) => {
  const userId = managementUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });

  try {
    const generatedFeed = await findOwnedGeneratedFeed(req.params.id, userId);
    if (!generatedFeed) return res.status(404).json(GENERATED_FEED_NOT_FOUND);

    await generatedFeed.destroy();
    return res.status(204).send();
  } catch (error) {
    logGeneratedFeedError('delete', error);
    return res.status(500).json({ error: 'Unable to delete Generated Feed' });
  }
};

const regenerateGeneratedFeedToken = async (req, res) => {
  const userId = managementUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });

  try {
    const generatedFeed = await findOwnedGeneratedFeed(req.params.id, userId);
    if (!generatedFeed) return res.status(404).json(GENERATED_FEED_NOT_FOUND);

    await persistWithGeneratedFeedToken(token => generatedFeed.update({
      token,
      tokenRegeneratedAt: new Date()
    }));

    return res.status(200).json({
      generatedFeed: serializeGeneratedFeed(generatedFeed, req)
    });
  } catch (error) {
    logGeneratedFeedError('regenerate token for', error);
    return res.status(500).json({ error: 'Unable to regenerate Generated Feed token' });
  }
};

export default {
  createGeneratedFeed,
  deleteGeneratedFeed,
  getGeneratedFeed,
  listGeneratedFeeds,
  regenerateGeneratedFeedToken,
  updateGeneratedFeed
};
