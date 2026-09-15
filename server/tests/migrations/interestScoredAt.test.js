import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260915001000-add-interest-scored-at.mjs';

describe('interest evaluation timestamp migration', () => {
  it('leaves legacy history unknown, supports repeat application and removes only its own column', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('articles', { id: { type: DataTypes.INTEGER, primaryKey: true }, interestScore: DataTypes.FLOAT });
      await query.bulkInsert('articles', [{ id: 1, interestScore: 0.5 }]);
      await up(query, Sequelize); await up(query, Sequelize);
      expect(await query.rawSelect('articles', { where: { id: 1 } }, 'interestScoredAt')).toBeNull();
      expect(await query.rawSelect('articles', { where: { id: 1 } }, 'interestScore')).toBe(0.5);
      await down(query);
      expect((await query.describeTable('articles')).interestScoredAt).toBeUndefined();
    } finally { await sequelize.close(); }
  });
});
