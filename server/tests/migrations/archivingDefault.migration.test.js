import { DataTypes, Sequelize } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up as createSettings, down as dropSettings } from '../../migrations/20260919000000-add-archiving-settings.mjs';
import { up, down } from '../../migrations/20260920000000-set-archiving-default-to-seven-years.mjs';

// Exercise both the configured database and SQLite's table rebuild.
it.each(['configured', 'sqlite'])('changes only future defaults on %s and preserves ownership through rollback', async dialect => {
  const sqlite = dialect === 'sqlite' || db.sequelize.getDialect() === 'sqlite';
  const sequelize = sqlite ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) : db.sequelize;
  const query = sequelize.getQueryInterface();
  const table = sqlite ? 'archiving_settings' : 'archiving_default_migration_test';
  const adapter = {
    sequelize,
    createTable: (_name, columns, options) => query.createTable(table, columns, options),
    addIndex: (name, fields, options) => query.addIndex(table, fields, { ...options, name: options.name.replace(name, table) }),
    changeColumn: (_name, column, options) => query.changeColumn(table, column, options),
    dropTable: () => query.dropTable(table)
  };
  if (sqlite) await query.createTable('users', { id: { type: DataTypes.INTEGER, primaryKey: true } });
  const users = sqlite ? [1, 2, 3] : (await db.User.bulkCreate([1, 2, 3].map(index => ({
    username: `archive-default-${Date.now()}-${index}`, password: 'test-password'
  })))).map(user => user.id);
  if (sqlite) await query.bulkInsert('users', users.map(id => ({ id })));
  const row = userId => ({ userId, createdAt: new Date(), updatedAt: new Date() });
  try {
    await createSettings(adapter, DataTypes);
    await query.bulkInsert(table, [row(users[0])]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [row(users[1])]);
    const settings = await query.select(null, table, { order: [['userId', 'ASC']] });
    expect(settings.map(item => [item.maximumArticleAge, item.maximumArticleAgeUnit])).toEqual([[7, 'days'], [7, 'years']]);
    await expect(query.bulkInsert(table, [row(users[1])])).rejects.toThrow();
    await down(adapter, DataTypes);
    await query.bulkInsert(table, [row(users[2])]);
    expect((await query.select(null, table, { order: [['userId', 'ASC']] })).map(item => item.maximumArticleAgeUnit))
      .toEqual(['days', 'years', 'days']);
    await expect(query.bulkInsert(table, [row(users[2])])).rejects.toThrow();
    await query.bulkDelete('users', { id: users });
    expect(await query.select(null, table)).toEqual([]);
    await expect(query.bulkInsert(table, [row(users[0])])).rejects.toThrow();
  } finally {
    await dropSettings(adapter);
    if (sqlite) await sequelize.close();
    else await db.User.destroy({ where: { id: users } });
  }
});
