import { DataTypes, Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20261012000000-standardize-saved-opened-original.mjs';

describe('saved/opened-original contract migration', () => {
  it.each(['configured', 'sqlite'])('preserves state, clocks, expressions and receipts on %s, including a retry', async dialect => {
    const local = dialect === 'sqlite';
    const sequelize = local ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) : db.sequelize;
    const qi = sequelize.getQueryInterface();
    const names = ['articles', 'feeds', 'archiving_settings', 'user_settings', 'actions', 'article_sync_actions', 'smart_folders', 'generated_feeds', 'islands'];
    const table = name => `contract_migration_${name}`;
    const adapter = { sequelize, describeTable: name => qi.describeTable(table(name)),
      renameColumn: (name, ...args) => qi.renameColumn(table(name), ...args),
      quoteIdentifier: name => qi.quoteIdentifier(names.includes(name) ? table(name) : name) };
    const id = { type: DataTypes.INTEGER, primaryKey: true };
    const integer = { type: DataTypes.INTEGER, defaultValue: 0 };
    const schemas = {
      articles: { favoriteInd: integer, clickedAmount: integer, favoritedAt: DataTypes.DATE, lastClickedAt: DataTypes.DATE, userId: DataTypes.INTEGER },
      feeds: { feedClickAvg: DataTypes.FLOAT, feedClickRatio: DataTypes.FLOAT },
      archiving_settings: { neverDeleteFavorites: DataTypes.BOOLEAN, neverDeleteClickedArticles: DataTypes.BOOLEAN },
      user_settings: { status: DataTypes.STRING }, actions: { actionType: DataTypes.STRING },
      article_sync_actions: { kind: DataTypes.STRING, actionId: DataTypes.STRING, value: DataTypes.STRING, outcome: DataTypes.STRING },
      smart_folders: { query: DataTypes.TEXT }, generated_feeds: { expression: DataTypes.TEXT },
      islands: { positiveSignals: DataTypes.JSON, populationAudit: DataTypes.JSON }
    };
    try {
      for (const name of names) await qi.createTable(table(name), { id, ...schemas[name] });
      await qi.createTable(table('references'), { articleId: {
        type: DataTypes.INTEGER, references: { model: table('articles'), key: 'id' }, onDelete: 'CASCADE'
      } });
      await qi.addIndex(table('articles'), ['favoriteInd'], { name: 'contract_saved_state_index' });
      const timestamp = new Date('2026-09-14T12:00:00Z');
      await qi.bulkInsert(table('articles'), [{ id: 11, userId: 1, favoriteInd: 1, clickedAmount: 4, favoritedAt: timestamp, lastClickedAt: timestamp },
        { id: 12, userId: 2, favoriteInd: 0, clickedAmount: 0, favoritedAt: null, lastClickedAt: null }]);
      await qi.bulkInsert(table('references'), [{ articleId: 11 }]);
      await qi.bulkInsert(table('feeds'), [{ id: 1, feedClickAvg: 2.5, feedClickRatio: 0.75 }]);
      await qi.bulkInsert(table('archiving_settings'), [{ id: 1, neverDeleteFavorites: true, neverDeleteClickedArticles: false }]);
      await qi.bulkInsert(table('user_settings'), [{ id: 1, status: 'favorite' }, { id: 2, status: 'clicked' }, { id: 3, status: 'star' }]);
      await qi.bulkInsert(table('actions'), [{ id: 1, actionType: 'star' }, { id: 2, actionType: 'clicked' }]);
      await qi.bulkInsert(table('article_sync_actions'), [{ id: 1, kind: 'set-favorite', actionId: 'existing-action', value: 'true', outcome: 'applied' }]);
      const expression = 'title:"favorite:true clicked:false" favorite:true,star:false clicked:true';
      await qi.bulkInsert(table('smart_folders'), [{ id: 1, query: expression }]);
      await qi.bulkInsert(table('generated_feeds'), [{ id: 1, expression }]);
      await qi.bulkInsert(table('islands'), [{ id: 1, positiveSignals: JSON.stringify({ stars: 2, clicks: 3, deepReads: 1 }),
        populationAudit: JSON.stringify([{ sourceArticles: [{ id: 11, favoriteInd: 1, clickedAmount: 4 }], starredArticleIds: [11], clickedArticleIds: [11] }]) }]);
      await up(adapter);
      await up(adapter);
      const rows = name => qi.select(null, table(name), { order: [['id', 'ASC']] });
      const articles = await rows('articles');
      expect(articles.map(row => [row.id, row.userId, row.savedInd, row.openedOriginalCount])).toEqual([[11, 1, 1, 4], [12, 2, 0, 0]]);
      expect(new Date(articles[0].savedAt).getTime()).toBe(timestamp.getTime());
      expect(new Date(articles[0].lastOpenedOriginalAt).getTime()).toBe(timestamp.getTime());
      expect(articles[1]).toMatchObject({ savedAt: null, lastOpenedOriginalAt: null });
      expect((await qi.describeTable(table('articles'))).favoriteInd).toBeUndefined();
      expect((await qi.showIndex(table('articles'))).some(index => index.name === 'contract_saved_state_index')).toBe(true);
      expect(await qi.select(null, table('references'), {})).toEqual([{ articleId: 11 }]);
      await expect(qi.bulkInsert(table('references'), [{ articleId: 999 }])).rejects.toThrow();
      expect((await rows('user_settings')).map(row => row.status)).toEqual(['saved', 'openedOriginal', 'saved']);
      expect((await rows('actions')).map(row => row.actionType)).toEqual(['saved', 'openedOriginal']);
      const protections = (await rows('archiving_settings'))[0];
      expect((await rows('feeds'))[0]).toMatchObject({ feedOpenedOriginalAvg: 2.5, feedOpenedOriginalRatio: 0.75 });
      expect(Boolean(protections.neverDeleteSaved)).toBe(true);
      expect(Boolean(protections.neverDeleteOpenedOriginalArticles)).toBe(false);
      expect((await rows('article_sync_actions'))[0]).toMatchObject({ kind: 'set-saved', actionId: 'existing-action', value: 'true', outcome: 'applied' });
      const canonical = 'title:"favorite:true clicked:false" saved:true,saved:false openedOriginal:true';
      expect((await rows('smart_folders'))[0].query).toBe(canonical);
      expect((await rows('generated_feeds'))[0].expression).toBe(canonical);
      const island = (await rows('islands'))[0];
      const json = value => typeof value === 'string' ? JSON.parse(value) : value;
      expect(json(island.positiveSignals)).toEqual({ saves: 2, openedOriginals: 3, deepReads: 1 });
      expect(json(island.populationAudit)[0]).toMatchObject({ savedArticleIds: [11], openedOriginalArticleIds: [11], sourceArticles: [{ id: 11, savedInd: 1, openedOriginalCount: 4 }] });
      await expect(down()).rejects.toThrow('replay receipts');
    } finally {
      await qi.dropTable(table('references'));
      for (const name of names.reverse()) await qi.dropTable(table(name));
      if (local) await sequelize.close();
    }
  });
});
