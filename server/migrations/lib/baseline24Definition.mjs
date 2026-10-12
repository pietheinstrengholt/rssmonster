// Frozen migration authority for schema version 2.4.0; never derive runtime DDL from live models.
export const BASELINE_24 = '20261012010000-baseline-2.4.mjs';
export const CUTOFF_24 = '2728be062c885ea67f6849e0595a4ca5b126a8fa';
export const MIGRATION_STATE_TABLE = 'RSSMonsterMigrationState';

// Reconcile definitions lost by historical SQLite table rebuilds with the original
// migrations and MySQL constraints. Fresh creation and recognized legacy adoption
// use the same corrected definitions.
const sqliteCorrections = {
  users: {
    indexes: [
      'CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`)',
      'CREATE UNIQUE INDEX `users_feverCredentialHash_unique` ON `users` (`feverCredentialHash`)'
    ]
  },
  smart_folders: {
    autoIncrement: true,
    cascade: true,
    indexes: [
      'CREATE INDEX `smart_folders_userId_idx` ON `smart_folders` (`userId`)',
      'CREATE INDEX `smart_folders_userId_name_idx` ON `smart_folders` (`userId`, `name`)'
    ]
  },
  island_taxonomy: {
    autoIncrement: true,
    statusCheck: true,
    indexes: [
      'CREATE INDEX `island_taxonomy_category_idx` ON `island_taxonomy` (`categoryName`)',
      'CREATE INDEX `island_taxonomy_status_idx` ON `island_taxonomy` (`status`)'
    ]
  }
};

export const reconcileSqliteTable = table => {
  const correction = sqliteCorrections[table.name];
  let create = table.create;
  if (correction?.autoIncrement) create = create.replace('INTEGER PRIMARY KEY,', 'INTEGER PRIMARY KEY AUTOINCREMENT,');
  if (correction?.cascade) create = create.replace('REFERENCES `users` (`id`)', 'REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE');
  if (correction?.statusCheck) create = create.replace("`status` TEXT NOT NULL", "`status` TEXT CHECK (`status` IN ('active','hidden','archived')) NOT NULL");
  return { ...table, create, indexes: [...table.indexes, ...(correction?.indexes || [])].sort() };
};

// SHOW CREATE TABLE retains names, prefix lengths, expressions, checks, defaults,
// character sets and collations. Defer foreign keys until every table exists,
// including the Article/Event cycle, without disabling referential integrity.
export const captureBaseline24 = async sequelize => {
  const query = sequelize.getQueryInterface();
  const dialect = sequelize.getDialect();
  if (!['mysql', 'sqlite'].includes(dialect)) throw new Error('Baseline 2.4 supports MySQL and SQLite.');
  const names = (await query.showAllTables()).filter(name => !['sequelizemeta', MIGRATION_STATE_TABLE.toLowerCase(), 'sqlite_sequence'].includes(name.toLowerCase())).sort();
  const tables = [];
  for (const name of names) {
    if (dialect === 'mysql') {
      const [rows] = await sequelize.query(`SHOW CREATE TABLE ${query.quoteIdentifier(name)}`);
      // Normalize table counters and unquoted charset clauses only. SQL-looking
      // text inside defaults, identifiers and comments must remain part of the hash.
      const ddl = rows[0]['Create Table'].replace(/^(\) ENGINE=\w+) AUTO_INCREMENT=\d+(?= )/m, '$1')
        .replace(/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`| CHARACTER SET utf8mb4(?= COLLATE utf8mb4_)/g, token => token.startsWith(' CHARACTER SET') ? '' : token);
      const isForeignKey = line => /^\s+CONSTRAINT .+ FOREIGN KEY \(/.test(line);
      const foreignKeys = ddl.split('\n').filter(isForeignKey).map(line =>
        `ALTER TABLE ${query.quoteIdentifier(name)} ADD ${line.trim().replace(/,$/, '')}`);
      const create = ddl.split('\n').filter(line => !isForeignKey(line)).join('\n').replace(/,\n\)/, '\n)');
      tables.push({ name, create, indexes: [], foreignKeys });
    } else {
      const [rows] = await sequelize.query('SELECT type, sql FROM sqlite_master WHERE tbl_name = :name AND sql IS NOT NULL ORDER BY type DESC, name', { replacements: { name } });
      tables.push({ name, create: rows.find(row => row.type === 'table').sql, indexes: rows.filter(row => row.type === 'index').map(row => row.sql).sort(), foreignKeys: [] });
    }
  }
  return { version: '2.4.0', cutoffCommit: CUTOFF_24, dialect, tables };
};
