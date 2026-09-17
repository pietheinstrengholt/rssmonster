import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// A real SQLite database isolates dialect-specific projection behavior.
vi.mock('../../models/index.js', async () => {
  const { Sequelize } = await import('sequelize');
  const { default: ArticleModel } = await import('../../models/article.js');
  const { default: ArticleInteractionModel } = await import('../../models/articleInteraction.js');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const Article = ArticleModel(sequelize);
  const ArticleInteraction = ArticleInteractionModel(sequelize);
  Article.hasOne(ArticleInteraction, { foreignKey: 'articleId', as: 'interaction', onDelete: 'CASCADE' });
  ArticleInteraction.belongsTo(Article, { foreignKey: 'articleId', as: 'article', onDelete: 'CASCADE' });
  return { default: { sequelize, Sequelize, Article, ArticleInteraction } };
});

import db from '../../models/index.js';
import { articleRecords } from '../../services/articles/articleRecords.js';

beforeAll(() => db.sequelize.sync({ force: true }));
afterAll(() => db.sequelize.close());

describe('SQLite article interaction projection', () => {
  it('preserves Date values and ISO API timestamps for joined state', async () => {
    const observed = new Date('2026-09-01T12:00:00Z');
    const created = await articleRecords.create({ userId: 1, feedId: 1, title: 'SQLite article',
      firstSeen: observed, readAt: observed, status: 'read', favoritedAt: null });
    const article = await articleRecords.findByPk(created.id);
    const raw = await articleRecords.findByPk(created.id, { raw: true });
    expect(article.firstSeen).toEqual(observed);
    expect(raw.firstSeen).toEqual(observed);
    expect(JSON.parse(JSON.stringify(article))).toMatchObject({
      status: 'read', firstSeen: observed.toISOString(), readAt: observed.toISOString(), favoritedAt: null
    });
    await article.update({ status: 'unread', readAt: null });
    expect(article.firstSeen).toEqual(observed);
    expect(article.readAt).toBeNull();
    await expect(db.ArticleInteraction.update({ readState: 'favorite' }, { where: { articleId: article.id } })).rejects.toThrow();
  });
});
