import { describe, expect, it } from 'vitest';
import { withMigrationLock } from '../../config/migrationLock.js';

// Simulate only the mysql2 server boundary; lock orchestration remains real.
const mysqlServer = casing => {
  const locks = new Map();
  let threadId = 0;
  const connectionManager = {
    getConnection: async () => {
      const owner = ++threadId;
      return { threadId: owner, query(sql, values, callback) {
        const name = values[0];
        if (sql.includes('lower_case_table_names')) callback(null, [{ casing }]);
        else if (sql.includes('GET_LOCK')) {
          const acquired = locks.has(name) ? 0 : 1;
          if (acquired) locks.set(name, owner);
          callback(null, [{ acquired }]);
        } else if (sql.includes('IS_USED_LOCK')) callback(null, [{ owner: locks.get(name) ?? null }]);
        else if (sql.includes('RELEASE_LOCK')) {
          if (locks.get(name) === owner) locks.delete(name);
          callback(null, []);
        } else callback(new Error('Unsupported server operation'));
      } };
    },
    releaseConnection: async () => {}, destroyConnection: async () => {}
  };
  return name => ({ getDialect: () => 'mysql', getDatabaseName: () => name, connectionManager });
};

describe('MySQL migration lock identity', () => {
  it.each([1, 2])('serializes database aliases when lower_case_table_names=%s', async casing => {
    const database = mysqlServer(casing);
    await withMigrationLock(database('rssmonster'), async assertHeld => {
      await assertHeld();
      await expect(withMigrationLock(database('RSSMonster'), async () => {})).rejects.toThrow('migration lock');
      await assertHeld();
    });
    await withMigrationLock(database('RSSMonster'), async assertHeld => { await assertHeld(); });
  });

  it('allows distinct databases on a case-sensitive server', async () => {
    const database = mysqlServer(0);
    await withMigrationLock(database('rssmonster'), async first => {
      await withMigrationLock(database('RSSMonster'), async second => { await first(); await second(); });
    });
  });
});
