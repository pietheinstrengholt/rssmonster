import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260915000000-add-aggregate-embedding-models.mjs';

async function withDatabase(run) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const query = sequelize.getQueryInterface();
  try {
    for (const table of ['events', 'islands', 'island_taxonomy']) {
      await query.createTable(table, {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        ...(table === 'island_taxonomy' ? { embedding_model: { type: DataTypes.STRING(100), allowNull: true } } : {})
      });
    }
    await run(query);
  } finally {
    await sequelize.close();
  }
}

describe('aggregate embedding model migration', () => {
  it('adds nullable metadata without inventing provenance and preserves taxonomy models on repeat/rollback', async () => {
    await withDatabase(async query => {
      await query.bulkInsert('events', [{ id: 1 }]);
      await query.bulkInsert('islands', [{ id: 1 }]);
      await query.bulkInsert('island_taxonomy', [{ id: 1, embedding_model: 'existing-model' }]);
      await up(query, Sequelize);
      await up(query, Sequelize);
      for (const table of ['events', 'islands', 'island_taxonomy']) {
        expect((await query.describeTable(table)).embedding_model).toMatchObject({ type: 'VARCHAR(64)', allowNull: true });
      }
      expect(await query.rawSelect('events', { where: { id: 1 } }, 'embedding_model')).toBeNull();
      expect(await query.rawSelect('islands', { where: { id: 1 } }, 'embedding_model')).toBeNull();
      expect(await query.rawSelect('island_taxonomy', { where: { id: 1 } }, 'embedding_model')).toBe('existing-model');
      await down(query, Sequelize);
      expect((await query.describeTable('events')).embedding_model).toBeUndefined();
      expect((await query.describeTable('islands')).embedding_model).toBeUndefined();
      expect((await query.describeTable('island_taxonomy')).embedding_model.type).toBe('VARCHAR(100)');
    });
  });

  it('refuses to truncate an existing taxonomy model identifier', async () => {
    await withDatabase(async query => {
      const model = 'm'.repeat(65);
      await query.bulkInsert('island_taxonomy', [{ id: 1, embedding_model: model }]);
      await expect(up(query, Sequelize)).rejects.toThrow('exceeds 64 characters');
      expect((await query.describeTable('events')).embedding_model).toBeUndefined();
      expect(await query.rawSelect('island_taxonomy', { where: { id: 1 } }, 'embedding_model')).toBe(model);
    });
  });
});
