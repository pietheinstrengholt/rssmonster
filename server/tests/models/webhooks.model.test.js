import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { WEBHOOK_DELIVERY_STATUSES } from '../../models/webhookDelivery.js';
import { decryptSecret } from '../../services/secretEncryption.js';

const { sequelize, User, Category, Feed, Article, Webhook, WebhookCondition, WebhookDelivery } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = prefix => {
  const username = uniqueName(prefix);
  return User.create({
    username,
    password: 'stored-password',
    feverCredentialHash: `${username}-fever-hash`,
    role: 'user'
  });
};

const createArticle = async user => {
  const category = await Category.create({
    userId: user.id,
    name: uniqueName('webhook-category'),
    categoryOrder: 0
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueName('webhook-feed'),
    url: `https://example.com/${uniqueName('feed')}.xml`
  });
  return Article.create({
    userId: user.id,
    feedId: feed.id,
    title: 'Webhook article'
  });
};

const createWebhook = user => Webhook.create({
  userId: user.id,
  name: uniqueName('Webhook'),
  endpointUrl: 'https://example.com/webhook'
});

describe('webhook models', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterAll(() => vi.unstubAllEnvs());

  it('registers models, associations, defaults, and lookup indexes', async () => {
    const user = await createUser('webhook-defaults');
    const webhook = await createWebhook(user);

    expect(webhook).toMatchObject({
      userId: user.id,
      enabled: true,
      matchMode: 'ALL',
      secret: null
    });
    expect(webhook.createdAt).toBeInstanceOf(Date);
    expect(webhook.updatedAt).toBeInstanceOf(Date);
    expect(await webhook.getUser()).toMatchObject({ id: user.id });
    expect(await user.getWebhooks()).toEqual([
      expect.objectContaining({ id: webhook.id })
    ]);
    expect(WebhookDelivery.rawAttributes.status.values).toEqual(WEBHOOK_DELIVERY_STATUSES);
    expect(WebhookDelivery.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'webhook_deliveries_webhook_article_unique',
        unique: true,
        fields: ['webhookId', 'articleId']
      }),
      expect.objectContaining({
        name: 'webhook_deliveries_status_nextAttemptAt_idx',
        fields: ['status', 'nextAttemptAt', 'id']
      })
    ]));
  });

  it('keeps optional signing secrets encrypted and out of serialized records', async () => {
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    const user = await createUser('webhook-secret');
    const webhook = await Webhook.create({
      userId: user.id,
      name: 'Signed webhook',
      endpointUrl: 'https://example.com/signed',
      secret: 'signing-secret'
    });

    expect(webhook.secret).toMatch(/^enc:v1:/);
    expect(decryptSecret(webhook.secret)).toBe('signing-secret');
    expect(webhook.toJSON()).not.toHaveProperty('secret');
    expect((await Webhook.findByPk(webhook.id)).get({ plain: true }))
      .not.toHaveProperty('secret');
  });

  it('persists conditions and one delivery per webhook/article pair', async () => {
    const user = await createUser('webhook-relations');
    const article = await createArticle(user);
    const webhook = await createWebhook(user);
    const condition = await WebhookCondition.create({
      webhookId: webhook.id,
      field: 'title',
      operator: 'contains',
      value: 'Webhook'
    });
    const delivery = await WebhookDelivery.create({
      webhookId: webhook.id,
      articleId: article.id
    });

    expect(await condition.getWebhook()).toMatchObject({ id: webhook.id });
    expect(await webhook.getConditions()).toEqual([
      expect.objectContaining({ id: condition.id })
    ]);
    expect(delivery).toMatchObject({
      status: 'pending',
      attemptCount: 0,
      lastAttemptAt: null,
      httpStatus: null,
      error: null
    });
    expect(delivery.nextAttemptAt).toBeInstanceOf(Date);
    expect(await delivery.getWebhook()).toMatchObject({ id: webhook.id });
    expect(await delivery.getArticle()).toMatchObject({ id: article.id });
    expect(await webhook.getDeliveries()).toEqual([
      expect.objectContaining({ id: delivery.id })
    ]);
    expect(await article.getWebhookDeliveries()).toEqual([
      expect.objectContaining({ id: delivery.id })
    ]);
    await expect(WebhookDelivery.create({
      webhookId: webhook.id,
      articleId: article.id
    })).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  });

  it('cascades webhook, article, and user deletion to their dependent rows', async () => {
    const user = await createUser('webhook-cascade');
    const article = await createArticle(user);
    const webhook = await createWebhook(user);
    const condition = await WebhookCondition.create({
      webhookId: webhook.id,
      field: 'language',
      operator: 'is',
      value: 'en'
    });
    const delivery = await WebhookDelivery.create({
      webhookId: webhook.id,
      articleId: article.id
    });

    await webhook.destroy();
    expect(await WebhookCondition.findByPk(condition.id)).toBeNull();
    expect(await WebhookDelivery.findByPk(delivery.id)).toBeNull();

    const secondWebhook = await createWebhook(user);
    const articleDelivery = await WebhookDelivery.create({
      webhookId: secondWebhook.id,
      articleId: article.id
    });
    await article.destroy();
    expect(await WebhookDelivery.findByPk(articleDelivery.id)).toBeNull();

    await user.destroy();
    expect(await Webhook.findByPk(secondWebhook.id)).toBeNull();
  });

  it('rejects invalid configurations and negative attempt counts', async () => {
    const user = await createUser('webhook-validation');
    const webhook = await createWebhook(user);

    await expect(Webhook.create({
      userId: user.id,
      name: 'Invalid endpoint',
      endpointUrl: 'ftp://example.com/webhook'
    })).rejects.toMatchObject({ name: 'SequelizeValidationError' });
    await expect(WebhookCondition.create({
      webhookId: webhook.id,
      field: '',
      operator: 'is',
      value: 'en'
    })).rejects.toMatchObject({ name: 'SequelizeValidationError' });
    await expect(WebhookDelivery.build({
      webhookId: webhook.id,
      articleId: 1,
      attemptCount: -1
    }).validate()).rejects.toMatchObject({ name: 'SequelizeValidationError' });
  });
});
