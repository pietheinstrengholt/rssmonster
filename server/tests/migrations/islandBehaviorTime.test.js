import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260917001000-add-island-behavior-time.mjs';

describe('Island behavioral clock migration', () => {
  it('leaves legacy age unknown and adds an idempotent active-deadline index', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('islands', { id: { type: DataTypes.INTEGER, primaryKey: true },
        userId: DataTypes.INTEGER, archivedInd: DataTypes.BOOLEAN, updatedAt: DataTypes.DATE });
      await query.bulkInsert('islands', [{ id: 1, userId: 1, archivedInd: false, updatedAt: new Date() }]);
      await up(query, Sequelize); await up(query, Sequelize);
      expect(await query.rawSelect('islands', { where: { id: 1 } }, 'lastBehaviorAt')).toBeNull();
      expect((await query.showIndex('islands')).filter(index => index.name === 'islands_user_active_behavior_idx')).toHaveLength(1);
      await down(query);
      expect((await query.describeTable('islands')).lastBehaviorAt).toBeUndefined();
      expect((await query.describeTable('islands')).updatedAt).toBeDefined();
    } finally { await sequelize.close(); }
  });
});
