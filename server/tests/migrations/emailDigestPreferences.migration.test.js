import { createRequire } from 'node:module';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260904000000-add-email-digest-preferences.js'
);

describe('email digest preferences migration', () => {
  it('adds opt-in scheduling fields with existing-user-safe defaults', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn.mock.calls).toEqual([
      ['briefing_preferences', 'emailDigestEnabled', expect.objectContaining({
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      })],
      ['briefing_preferences', 'emailDigestTime', expect.objectContaining({
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: '08:00'
      })],
      ['briefing_preferences', 'emailDigestTimezone', expect.objectContaining({
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'UTC'
      })],
      ['briefing_preferences', 'emailDigestSkipWhenEmpty', expect.objectContaining({
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      })]
    ]);
  });

  it('backfills defaults for an existing SQLite preference row', async () => {
    const database = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const queryInterface = database.getQueryInterface();
    const now = new Date();

    try {
      await queryInterface.createTable('briefing_preferences', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.bulkInsert('briefing_preferences', [{
        userId: 42,
        createdAt: now,
        updatedAt: now
      }]);

      await migration.up(queryInterface, DataTypes);

      const [preference] = await database.query(
        'SELECT emailDigestEnabled, emailDigestTime, emailDigestTimezone, ' +
        'emailDigestSkipWhenEmpty FROM briefing_preferences WHERE userId = 42',
        { type: QueryTypes.SELECT }
      );
      expect(Boolean(preference.emailDigestEnabled)).toBe(false);
      expect(preference.emailDigestTime).toBe('08:00');
      expect(preference.emailDigestTimezone).toBe('UTC');
      expect(Boolean(preference.emailDigestSkipWhenEmpty)).toBe(true);
    } finally {
      await database.close();
    }
  });

  it('removes the email scheduling fields in reverse dependency order', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn.mock.calls).toEqual([
      ['briefing_preferences', 'emailDigestSkipWhenEmpty'],
      ['briefing_preferences', 'emailDigestTimezone'],
      ['briefing_preferences', 'emailDigestTime'],
      ['briefing_preferences', 'emailDigestEnabled']
    ]);
  });
});
