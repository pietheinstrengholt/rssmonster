'use strict';

// Removes MySQL prefix lengths because SQLite indexes the complete value.
const normalizeIndexFields = fields => fields.replace(/(`[^`]+`)\(\d+\)/g, '$1');

// Converts one MySQL column definition into SQLite-compatible affinity syntax.
const normalizeColumn = definition => {
  const columnName = definition.match(/^`([^`]+)`/)?.[1];
  let normalized = definition.replace(/ COLLATE utf8mb4_unicode_ci/g, '');

  if (columnName) {
    normalized = normalized.replace(
      /\benum\(([^)]*)\)/i,
      `TEXT CHECK (\`${columnName}\` IN ($1))`
    );
  }

  return normalized
    .replace(/\bmediumtext\b|\btinytext\b/gi, 'TEXT')
    .replace(/\bbigint unsigned\b/gi, 'BIGINT')
    .replace(/\bint unsigned\b/gi, 'INTEGER')
    .replace(/\btinyint\(1\)\b|\btinyint\b|\bint\b/gi, 'INTEGER')
    .replace(/\bfloat\b/gi, 'REAL')
    .replace(/\bdatetime\b/gi, 'DATETIME');
};

// Parses a baseline table statement into SQLite table and index operations.
const buildSqliteTable = mysqlSql => {
  const lines = mysqlSql.split('\n');
  const tableMatch = lines[0].match(/^CREATE TABLE `([^`]+)` \($/);

  if (!tableMatch) {
    throw new Error('Unable to identify baseline table name.');
  }

  const tableName = tableMatch[1];
  const definitions = [];
  const indexes = [];
  let autoIncrementPrimaryKey;

  for (const rawLine of lines.slice(1, -1)) {
    const line = rawLine.trim().replace(/,$/, '');
    const autoIncrementMatch = line.match(/^`([^`]+)` .*\bAUTO_INCREMENT\b/i);
    const uniqueIndexMatch = line.match(/^UNIQUE KEY `([^`]+)` \((.*)\)$/i);
    const indexMatch = line.match(/^KEY `([^`]+)` \((.*)\)$/i);
    const primaryKeyMatch = line.match(/^PRIMARY KEY \((.*)\)$/i);

    if (autoIncrementMatch) {
      autoIncrementPrimaryKey = autoIncrementMatch[1];
      definitions.push(`\`${autoIncrementPrimaryKey}\` INTEGER PRIMARY KEY AUTOINCREMENT`);
    } else if (uniqueIndexMatch) {
      indexes.push({
        name: uniqueIndexMatch[1],
        fields: normalizeIndexFields(uniqueIndexMatch[2]),
        unique: true
      });
    } else if (indexMatch) {
      indexes.push({
        name: indexMatch[1],
        fields: normalizeIndexFields(indexMatch[2]),
        unique: false
      });
    } else if (primaryKeyMatch) {
      if (!autoIncrementPrimaryKey) definitions.push(`PRIMARY KEY (${primaryKeyMatch[1]})`);
    } else {
      definitions.push(normalizeColumn(line));
    }
  }

  return {
    tableName,
    sql: `CREATE TABLE \`${tableName}\` (\n  ${definitions.join(',\n  ')}\n)`,
    indexes
  };
};

// Creates one canonical baseline table without changing the existing MySQL DDL.
const createBaselineTable = async (queryInterface, mysqlSql) => {
  if (queryInterface.sequelize.getDialect() !== 'sqlite') {
    await queryInterface.sequelize.query(mysqlSql);
    return;
  }

  const { tableName, sql, indexes } = buildSqliteTable(mysqlSql);
  await queryInterface.sequelize.query(sql);

  for (const index of indexes) {
    const expression = index.fields
      .replace(/_utf8mb4/g, '')
      .replace(/\\'/g, "'");

    if (/^\(.*\)$/s.test(expression)) {
      const unique = index.unique ? 'UNIQUE ' : '';
      await queryInterface.sequelize.query(
        `CREATE ${unique}INDEX \`${index.name}\` ON \`${tableName}\` (${expression})`
      );
      continue;
    }

    const fields = [...expression.matchAll(/`([^`]+)`/g)].map(match => match[1]);
    await queryInterface.addIndex(tableName, fields, {
      name: index.name,
      unique: index.unique
    });
  }
};

// Adds a baseline constraint while preserving indexes across SQLite table rebuilds.
const addBaselineConstraint = async (queryInterface, tableName, options) => {
  if (queryInterface.sequelize.getDialect() !== 'sqlite') {
    await queryInterface.addConstraint(tableName, options);
    return;
  }

  const [savedIndexes] = await queryInterface.sequelize.query(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL",
    { replacements: [tableName] }
  );

  for (const index of savedIndexes) {
    if (/\bCASE\b/i.test(index.sql)) {
      await queryInterface.sequelize.query(`DROP INDEX \`${index.name}\``);
    }
  }

  await queryInterface.addConstraint(tableName, options);
  const [currentIndexes] = await queryInterface.sequelize.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = ?",
    { replacements: [tableName] }
  );
  const currentNames = new Set(currentIndexes.map(index => index.name));

  for (const index of savedIndexes) {
    if (!currentNames.has(index.name)) {
      await queryInterface.sequelize.query(index.sql);
    }
  }
};

module.exports = { addBaselineConstraint, createBaselineTable };
