import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260922000000-add-article-original-source.mjs';

describe('original source migration', () => {
  it('preserves existing articles and supports upgrade and rollback', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('articles', { id: { type: DataTypes.INTEGER, primaryKey: true }, title: DataTypes.TEXT });
      await query.bulkInsert('articles', [{ id: 1, title: 'Existing article' }]);
      await up(query, Sequelize);
      await up(query, Sequelize);
      expect(await query.rawSelect('articles', { where: { id: 1 } }, 'originalSource')).toBeNull();
      await down(query);
      expect((await query.describeTable('articles')).originalSource).toBeUndefined();
      expect(await query.rawSelect('articles', { where: { id: 1 } }, 'title')).toBe('Existing article');
    } finally { await sequelize.close(); }
  });
});
