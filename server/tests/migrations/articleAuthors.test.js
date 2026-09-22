import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260922001000-add-article-authors.mjs';

describe('authors migration', () => {
  it('preserves unsplit legacy bylines during upgrade and rollback', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('articles', { id: { type: DataTypes.INTEGER, primaryKey: true }, author: DataTypes.TEXT });
      await query.bulkInsert('articles', [{ id: 1, author: 'Smith, Alice' }]);
      await up(query, Sequelize);
      await up(query, Sequelize);
      expect(await query.rawSelect('articles', { where: { id: 1 } }, 'authors')).toBeNull();
      await down(query);
      expect((await query.describeTable('articles')).authors).toBeUndefined();
      expect(await query.rawSelect('articles', { where: { id: 1 } }, 'author')).toBe('Smith, Alice');
    } finally { await sequelize.close(); }
  });
});
