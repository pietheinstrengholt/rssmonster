import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';
import { up, down } from '../../migrations/20261004000000-create-webhooks.mjs';

describe('webhooks migration', () => {
  it('creates owned configurations, conditions, and deduplicated deliveries', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };

    await up(queryInterface, DataTypes);

    expect(queryInterface.createTable.mock.calls).toEqual([
      ['webhooks', expect.objectContaining({
        userId: expect.objectContaining({
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE'
        }),
        name: expect.objectContaining({ type: DataTypes.STRING(255), allowNull: false }),
        enabled: expect.objectContaining({ defaultValue: true }),
        matchMode: expect.objectContaining({ defaultValue: 'ALL' }),
        createdAt: expect.objectContaining({ allowNull: false }),
        updatedAt: expect.objectContaining({ allowNull: false })
      })],
      ['webhook_conditions', expect.objectContaining({
        webhookId: expect.objectContaining({
          allowNull: false,
          references: { model: 'webhooks', key: 'id' },
          onDelete: 'CASCADE'
        }),
        field: expect.objectContaining({ type: DataTypes.STRING(64), allowNull: false }),
        operator: expect.objectContaining({ type: DataTypes.STRING(32), allowNull: false }),
        value: expect.objectContaining({ allowNull: false })
      })],
      ['webhook_deliveries', expect.objectContaining({
        webhookId: expect.objectContaining({
          allowNull: false,
          references: { model: 'webhooks', key: 'id' },
          onDelete: 'CASCADE'
        }),
        articleId: expect.objectContaining({
          allowNull: false,
          references: { model: 'articles', key: 'id' },
          onDelete: 'CASCADE'
        }),
        status: expect.objectContaining({ defaultValue: 'pending' }),
        attemptCount: expect.objectContaining({ defaultValue: 0 }),
        nextAttemptAt: expect.objectContaining({ defaultValue: DataTypes.NOW })
      })]
    ]);
    expect(queryInterface.addIndex.mock.calls).toEqual([
      ['webhooks', ['userId'], { name: 'webhooks_userId_idx' }],
      ['webhook_conditions', ['webhookId'], { name: 'webhook_conditions_webhookId_idx' }],
      ['webhook_deliveries', ['webhookId', 'articleId'], {
        name: 'webhook_deliveries_webhook_article_unique', unique: true
      }],
      ['webhook_deliveries', ['articleId'], {
        name: 'webhook_deliveries_articleId_idx'
      }],
      ['webhook_deliveries', ['status', 'nextAttemptAt', 'id'], {
        name: 'webhook_deliveries_status_nextAttemptAt_idx'
      }]
    ]);
  });

  it('drops child tables before their parents', async () => {
    const queryInterface = { dropTable: vi.fn().mockResolvedValue(undefined) };

    await down(queryInterface);

    expect(queryInterface.dropTable.mock.calls).toEqual([
      ['webhook_deliveries'],
      ['webhook_conditions'],
      ['webhooks']
    ]);
  });
});
