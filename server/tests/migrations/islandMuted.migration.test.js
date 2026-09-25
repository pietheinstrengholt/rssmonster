import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260925001000-add-island-muted-ind.mjs';

describe('Island muted flag migration', () => {
  it('defaults existing and new Islands to unmuted', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('islands', { id: { type: DataTypes.INTEGER, primaryKey: true }, userId: DataTypes.INTEGER });
      await query.bulkInsert('islands', [{ id: 1, userId: 1 }]);
      await up(query, Sequelize); await up(query, Sequelize);
      const column = (await query.describeTable('islands')).mutedInd;
      expect(column.allowNull).toBe(false);
      expect(Boolean(await query.rawSelect('islands', { where: { id: 1 } }, 'mutedInd'))).toBe(false);
      await query.bulkInsert('islands', [{ id: 2, userId: 1 }]);
      expect(Boolean(await query.rawSelect('islands', { where: { id: 2 } }, 'mutedInd'))).toBe(false);
      await down(query);
      expect((await query.describeTable('islands')).mutedInd).toBeUndefined();
    } finally { await sequelize.close(); }
  });
});
