import { Sequelize, DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import { up, down } from '../../migrations/20260915002000-add-personalization-refreshed-at.mjs';

it('preserves users with unknown refresh history and supports migration replay and rollback', async () => {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.createTable('users', { id: { type: DataTypes.INTEGER, primaryKey: true }, username: DataTypes.STRING });
    await queryInterface.bulkInsert('users', [{ id: 1, username: 'existing' }]);
    await up(queryInterface, DataTypes);
    await up(queryInterface, DataTypes);
    const [rows] = await sequelize.query('SELECT * FROM users');
    expect(rows).toEqual([{ id: 1, username: 'existing', personalizationRefreshedAt: null }]);
    expect((await queryInterface.showIndex('users')).some(index => index.name === 'users_personalization_refreshed_at_id')).toBe(true);
    await down(queryInterface);
    expect((await queryInterface.describeTable('users')).personalizationRefreshedAt).toBeUndefined();
    expect((await sequelize.query('SELECT * FROM users'))[0]).toEqual([{ id: 1, username: 'existing' }]);
  } finally {
    await sequelize.close();
  }
});
