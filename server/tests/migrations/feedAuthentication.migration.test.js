import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923008000-add-feed-authentication.mjs';
import { up as expand, down as shrink } from '../../migrations/20260923009000-expand-feed-authentication-password.mjs';

it('adds nullable authentication fields and preserves feeds on rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'feed_authentication_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true } });
  try {
    await query.bulkInsert(table, [{ id: 1 }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2 }]);
    for (const row of await query.select(null, table)) {
      expect(row).toMatchObject({ authenticationType: null, authenticationUsername: null, authenticationPassword: null });
    }
    const credentials = { authenticationType: 'basic', authenticationUsername: 'reader', authenticationPassword: 'test-password' };
    await query.bulkUpdate(table, credentials, { id: 1 });
    expect((await query.select(null, table, { where: { id: 1 } }))[0]).toMatchObject(credentials);
    const resizeAdapter = { sequelize: db.sequelize, changeColumn: (_name, column, options) => query.changeColumn(table, column, options) };
    await expand(resizeAdapter, DataTypes);
    await query.bulkUpdate(table, { authenticationPassword: 'x'.repeat(600) }, { id: 1 });
    expect((await query.select(null, table, { where: { id: 1 } }))[0].authenticationPassword).toHaveLength(600);
    await query.bulkUpdate(table, credentials, { id: 1 });
    await shrink(resizeAdapter, DataTypes);
    expect((await query.select(null, table, { where: { id: 1 } }))[0]).toMatchObject(credentials);
    await down(adapter);
    const schema = await query.describeTable(table);
    for (const column of Object.keys(credentials)) expect(schema).not.toHaveProperty(column);
    expect(await query.select(null, table)).toHaveLength(2);
  } finally {
    await query.dropTable(table);
  }
});
