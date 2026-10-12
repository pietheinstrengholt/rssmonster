import { DataTypes, Sequelize } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/pre-2.4/20261012002000-standardize-tone-score.mjs';

describe('Tone contract migration', () => {
  it('refuses conflicting columns without discarding either value', async () => {
    const qi = { describeTable: vi.fn().mockResolvedValue({ sentimentScore: {}, toneScore: {} }), renameColumn: vi.fn() };
    await expect(up(qi)).rejects.toThrow('Both articles.sentimentScore and toneScore exist');
    expect(qi.renameColumn).not.toHaveBeenCalled();
  });
  it('resumes after an earlier table was already renamed', async () => {
    const qi = { sequelize: { getDialect: () => 'mysql' },
      describeTable: vi.fn().mockImplementation(async table => table === 'articles' ? { toneScore: {} } : { minSentimentScore: {} }),
      renameColumn: vi.fn() };
    await up(qi);
    expect(qi.renameColumn.mock.calls).toEqual([['user_settings', 'minSentimentScore', 'minToneScore']]);
  });
  it.each(['configured', 'sqlite'])('preserves scores, settings, clocks and references through retries and rollback on %s', async dialect => {
    const local = dialect === 'sqlite';
    const sequelize = local ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) : db.sequelize;
    const qi = sequelize.getQueryInterface();
    const table = name => `tone_contract_${name}`;
    const names = ['articles', 'user_settings'];
    const adapter = { sequelize, describeTable: name => qi.describeTable(table(name)),
      renameColumn: (name, ...args) => qi.renameColumn(table(name), ...args),
      quoteIdentifier: name => qi.quoteIdentifier(names.includes(name) ? table(name) : name) };
    try {
      await qi.createTable(table('articles'), { id: { type: DataTypes.INTEGER, primaryKey: true },
        userId: DataTypes.INTEGER, sentimentScore: { type: DataTypes.INTEGER, defaultValue: 50 }, updatedAt: DataTypes.DATE });
      await qi.createTable(table('user_settings'), { id: { type: DataTypes.INTEGER, primaryKey: true },
        userId: DataTypes.INTEGER, minSentimentScore: { type: DataTypes.INTEGER, defaultValue: 0 }, updatedAt: DataTypes.DATE });
      await qi.createTable(table('references'), { articleId: { type: DataTypes.INTEGER,
        references: { model: table('articles'), key: 'id' } } });
      await qi.addIndex(table('articles'), ['sentimentScore'], { name: 'tone_contract_index' });
      const timestamp = new Date('2026-10-01T12:00:00Z');
      await qi.bulkInsert(table('articles'), [{ id: 11, userId: 1, sentimentScore: 40, updatedAt: timestamp },
        { id: 12, userId: 2, sentimentScore: null, updatedAt: timestamp }]);
      await qi.bulkInsert(table('user_settings'), [{ id: 1, userId: 1, minSentimentScore: 80, updatedAt: timestamp }]);
      await qi.bulkInsert(table('references'), [{ articleId: 11 }]);
      if (local) await sequelize.query('CREATE TRIGGER tone_contract_guard BEFORE UPDATE ON tone_contract_articles WHEN NEW.sentimentScore > 100 BEGIN SELECT RAISE(ABORT, \'invalid tone\'); END');
      await up(adapter);
      await up(adapter);
      const rows = await qi.select(null, table('articles'), { order: [['id', 'ASC']] });
      expect(rows.map(row => [row.id, row.userId, row.toneScore])).toEqual([[11, 1, 40], [12, 2, null]]);
      expect(rows.every(row => new Date(row.updatedAt).getTime() === timestamp.getTime())).toBe(true);
      expect((await qi.select(null, table('user_settings'), {}))[0]).toMatchObject({ userId: 1, minToneScore: 80 });
      expect((await qi.describeTable(table('articles'))).sentimentScore).toBeUndefined();
      expect((await qi.showIndex(table('articles'))).find(index => index.name === 'tone_contract_index').fields[0].attribute).toBe('toneScore');
      await qi.bulkInsert(table('articles'), [{ id: 13 }]);
      await qi.bulkInsert(table('user_settings'), [{ id: 2 }]);
      expect((await qi.select(null, table('articles'), { where: { id: 13 } }))[0].toneScore).toBe(50);
      expect((await qi.select(null, table('user_settings'), { where: { id: 2 } }))[0].minToneScore).toBe(0);
      expect(await qi.select(null, table('references'), {})).toEqual([{ articleId: 11 }]);
      await expect(qi.bulkInsert(table('references'), [{ articleId: 999 }])).rejects.toThrow();
      if (local) await expect(qi.bulkUpdate(table('articles'), { toneScore: 101 }, { id: 11 })).rejects.toMatchObject({ parent: { message: 'SQLITE_CONSTRAINT: invalid tone' } });
      await down(adapter);
      await down(adapter);
      expect((await qi.select(null, table('articles'), { where: { id: 11 } }))[0].sentimentScore).toBe(40);
      expect((await qi.select(null, table('user_settings'), { where: { id: 1 } }))[0].minSentimentScore).toBe(80);
    } finally {
      await qi.dropTable(table('references'));
      await qi.dropTable(table('user_settings'));
      await qi.dropTable(table('articles'));
      if (local) await sequelize.close();
    }
  });
});
