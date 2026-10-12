import { createHash } from 'node:crypto';
import { captureBaseline24 } from '../migrations/lib/baseline24Definition.mjs';
import baselineSqlite from '../migrations/lib/baseline24-sqlite.json' with { type: 'json' };

// Native SQLite RENAME quotes identifiers differently from CREATE. Normalize
// identifier quoting and whitespace only, keeping single-quoted values intact.
export const normalizeMigrationSchema = definition => {
  if (definition.dialect !== 'sqlite') return definition;
  const normalize = sql => sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\s+/g, token => {
    if (token.startsWith("'")) return token;
    if (token.startsWith('"')) return '`' + token.slice(1, -1).replaceAll('""', '"').replaceAll('`', '``') + '`';
    return token.startsWith('`') ? token : ' ';
  });
  return { ...definition, tables: definition.tables.map(table => ({ ...table, create: normalize(table.create), indexes: table.indexes.map(normalize).sort() })) };
};
export const schemaHash = definition => createHash('sha256').update(JSON.stringify(normalizeMigrationSchema(definition))).digest('hex');

export const rememberSqliteSequences = async (sequelize, retained) => {
  if (sequelize.getDialect() !== 'sqlite') return;
  const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'");
  if (!tables.length) return;
  const [rows] = await sequelize.query('SELECT name, CAST(seq AS TEXT) AS seq FROM sqlite_sequence');
  for (const row of rows) {
    if (!/^\d+$/.test(row.seq)) throw new Error(`Invalid SQLite auto-increment sequence for ${row.name}. Refusing speculative recovery.`);
    if (BigInt(row.seq) > BigInt(retained.get(row.name) || '0')) retained.set(row.name, row.seq);
  }
};

// Table-copy rebuilds can retain all rows but forget IDs deleted above MAX(id).
// Restore observed counters without altering schema or lowering any sequence.
export const restoreSqliteSequences = async (sequelize, retained) => {
  if (sequelize.getDialect() !== 'sqlite' || !retained.size) return;
  const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type = 'table' AND UPPER(sql) LIKE '%AUTOINCREMENT%'");
  for (const { name } of tables) {
    if (!retained.has(name)) continue;
    const replacements = { name, seq: retained.get(name) };
    await sequelize.query('UPDATE sqlite_sequence SET seq = MAX(seq, CAST(:seq AS INTEGER)) WHERE name = :name', { replacements });
    await sequelize.query('INSERT INTO sqlite_sequence (name, seq) SELECT :name, CAST(:seq AS INTEGER) WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = :name)', { replacements });
  }
};

export const inspectMigrationSchema = async sequelize => {
  const definition = await captureBaseline24(sequelize);
  const [objects] = await sequelize.query(sequelize.getDialect() === 'sqlite'
    ? "SELECT type, name FROM sqlite_master WHERE type IN ('view', 'trigger') ORDER BY type, name"
    : "SELECT 'view' AS type, TABLE_NAME AS name FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = DATABASE() UNION ALL SELECT 'trigger', TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()");
  if (objects.length) throw new Error(`Unrecognized database objects: ${objects.map(row => `${row.type} ${row.name}`).join(', ')}. No speculative schema repair is permitted.`);
  return { definition, hash: schemaHash(definition) };
};

export const validateMigrationData = async sequelize => {
  if (sequelize.getDialect() === 'sqlite') {
    const [violations] = await sequelize.query('PRAGMA foreign_key_check');
    if (violations.length) throw new Error(`Database contains foreign-key violations (${violations.length}). Resolve the data inconsistency before baseline adoption.`);
  } else {
    const [keys] = await sequelize.query("SELECT TABLE_NAME AS childTable, COLUMN_NAME AS childColumn, REFERENCED_TABLE_NAME AS parentTable, REFERENCED_COLUMN_NAME AS parentColumn, CONSTRAINT_NAME AS constraintName FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION");
    const groups = Map.groupBy(keys, row => `${row.childTable}.${row.constraintName}`);
    const quote = name => sequelize.getQueryInterface().quoteIdentifier(name);
    for (const [name, fields] of groups) {
      const joined = fields.map(row => `child.${quote(row.childColumn)} = parent.${quote(row.parentColumn)}`).join(' AND ');
      const nonNull = fields.map(row => `child.${quote(row.childColumn)} IS NOT NULL`).join(' AND ');
      const [orphans] = await sequelize.query(`SELECT 1 FROM ${quote(fields[0].childTable)} child LEFT JOIN ${quote(fields[0].parentTable)} parent ON ${joined} WHERE ${nonNull} AND parent.${quote(fields[0].parentColumn)} IS NULL LIMIT 1`);
      if (orphans.length) throw new Error(`Database contains foreign-key violations in ${name}. Resolve the data inconsistency before baseline adoption.`);
    }
  }
};

// Only call after exact recognition of the frozen historical SQLite endpoint.
// No data is rewritten: duplicate/invalid rows prevent adoption, rather than
// choosing winners or silently dropping incompatible user state.
export const validateHistoricalSqliteData = async sequelize => {
  for (const column of ['username', 'feverCredentialHash']) {
    const [duplicates] = await sequelize.query(`SELECT 1 FROM users WHERE \`${column}\` IS NOT NULL GROUP BY \`${column}\` HAVING COUNT(*) > 1 LIMIT 1`);
    if (duplicates.length) throw new Error(`Cannot adopt baseline 2.4: duplicate users.${column} values violate baseline uniqueness. No rows were changed.`);
  }
  const [invalid] = await sequelize.query("SELECT 1 FROM island_taxonomy WHERE status NOT IN ('active','hidden','archived') LIMIT 1");
  if (invalid.length) throw new Error('Cannot adopt baseline 2.4: invalid island_taxonomy.status values. No rows were changed.');
  await validateMigrationData(sequelize);
};

export const reconcileHistoricalSqlite = async sequelize => {
  await validateHistoricalSqliteData(sequelize);
  await sequelize.transaction(async transaction => {
    for (const name of ['smart_folders', 'island_taxonomy']) {
      const table = baselineSqlite.tables.find(table => table.name === name);
      const temporary = `${name}_baseline24_adoption`;
      const create = table.create.replace(new RegExp('^CREATE TABLE [`"]' + name + '[`"]'), `CREATE TABLE \`${temporary}\``);
      await sequelize.query(create, { transaction });
      await sequelize.query(`INSERT INTO \`${temporary}\` SELECT * FROM \`${name}\``, { transaction });
      await sequelize.query(`DROP TABLE \`${name}\``, { transaction });
      await sequelize.query(`ALTER TABLE \`${temporary}\` RENAME TO \`${name}\``, { transaction });
      for (const index of table.indexes) await sequelize.query(index, { transaction });
    }
    for (const index of baselineSqlite.tables.find(table => table.name === 'users').indexes.filter(sql => /users_(username|feverCredentialHash)_unique/.test(sql))) {
      await sequelize.query(index, { transaction });
    }
    const [violations] = await sequelize.query('PRAGMA foreign_key_check', { transaction });
    if (violations.length) throw new Error('SQLite foreign-key validation failed during baseline adoption; corrections rolled back.');
  });
};
