import { Sequelize, DataTypes } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up } from '../../migrations/20260916001000-split-article-interactions.mjs';

let sequelize;
beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false });
  const qi = sequelize.getQueryInterface();
  await qi.createTable('articles', {
    id: { type: DataTypes.INTEGER, primaryKey: true }, userId: DataTypes.INTEGER,
    title: DataTypes.TEXT, status: DataTypes.STRING, favoriteInd: DataTypes.INTEGER,
    clickedAmount: DataTypes.INTEGER, firstSeen: DataTypes.DATE, readAt: DataTypes.DATE,
    favoritedAt: DataTypes.DATE, interestScore: DataTypes.FLOAT,
    createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE
  });
  await qi.addIndex('articles', ['userId', 'status'], { name: 'old_read_index' });
  await qi.createTable('tags', { id: { type: DataTypes.INTEGER, primaryKey: true },
    articleId: { type: DataTypes.INTEGER, references: { model: 'articles', key: 'id' }, onDelete: 'CASCADE' } });
  await sequelize.query(`INSERT INTO articles VALUES
    (1, 10, 'Read article', 'read', 1, 3, '2026-09-01', '2026-09-02', NULL, 0.5, '2026-08-01', '2026-09-02'),
    (2, 10, 'Duplicate', 'duplicate', 0, 0, NULL, NULL, NULL, 0, '2026-08-01', '2026-09-02')`);
  await sequelize.query('INSERT INTO tags VALUES (1, 1)');
});
afterEach(async () => sequelize.close());

describe('ArticleInteraction schema cutover', () => {
  it('preserves identity, state, unknown clocks and related rows across migration and retry', async () => {
    await up(sequelize.getQueryInterface(), DataTypes);
    await up(sequelize.getQueryInterface(), DataTypes);
    const [states] = await sequelize.query('SELECT * FROM articleInteractions ORDER BY articleId');
    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({ articleId: 1, userId: 10, readState: 'read', favoriteInd: 1, clickedAmount: 3, favoritedAt: null, interestScore: 0.5, interestScoredAt: null });
    expect(states[1]).toMatchObject({ articleId: 2, readState: 'unread', firstSeen: null });
    const [articles] = await sequelize.query('SELECT * FROM articles ORDER BY id');
    expect(articles[0]).toMatchObject({ id: 1, userId: 10, title: 'Read article' });
    expect(articles[0]).not.toHaveProperty('status');
    expect(articles[0]).not.toHaveProperty('favoriteInd');
    expect((await sequelize.query('SELECT * FROM tags'))[0]).toEqual([{ id: 1, articleId: 1 }]);
  });

  it('rejects mismatched owners and cascades deletion', async () => {
    await up(sequelize.getQueryInterface(), DataTypes);
    await expect(sequelize.query('UPDATE articleInteractions SET userId = 11 WHERE articleId = 1')).rejects.toThrow();
    await sequelize.query('DELETE FROM articles WHERE id = 1');
    expect((await sequelize.query('SELECT * FROM articleInteractions WHERE articleId = 1'))[0]).toEqual([]);
  });
});
