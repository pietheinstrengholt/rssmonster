// Historical semantic relationships are disposable; articles, Events, Islands and behavior are not.
const joins = ['island_topics', 'article_topics', 'event_topics'];

// Split a SQLite table definition without splitting expressions or quoted identifiers.
const definitionParts = sql => {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) index++;
        else quote = null;
      }
    } else if (['"', "'", '`', '['].includes(character)) quote = character === '[' ? ']' : character;
    else if (character === '(') depth++;
    else if (character === ')') depth--;
    else if (character === ',' && depth === 0) {
      parts.push(sql.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, sql.slice(start)];
};

// Follow the existing SQLite rebuild convention, preserving constraints, indexes and allocated IDs.
const removeSqliteColumn = async (queryInterface, table, transaction) => {
  const { sequelize } = queryInterface;
  const options = { replacements: { table }, transaction };
  const [definitions] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = :table", options);
  const definition = definitions[0]?.sql;
  if (!definition) throw new Error(`Missing SQLite definition for ${table}.`);
  const opening = definition.indexOf('(');
  const closing = definition.lastIndexOf(')');
  const parts = definitionParts(definition.slice(opening + 1, closing));
  const retained = parts.filter(part => !/\btopicId\b/i.test(part));
  const backup = `${table}_without_topics`;
  const [objects] = await sequelize.query("SELECT sql FROM sqlite_master WHERE tbl_name = :table AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name", options);
  const [sequences] = await sequelize.query('SELECT seq FROM sqlite_sequence WHERE name = :table', options);
  const columns = Object.keys(await queryInterface.describeTable(table, { transaction })).filter(name => name !== 'topicId');
  const names = columns.map(name => queryInterface.quoteIdentifier(name)).join(', ');
  await sequelize.query(`CREATE TABLE ${queryInterface.quoteIdentifier(backup)} (${retained.join(',')})${definition.slice(closing + 1)}`, { transaction });
  await sequelize.query(`INSERT INTO ${queryInterface.quoteIdentifier(backup)} (${names}) SELECT ${names} FROM ${queryInterface.quoteIdentifier(table)}`, { transaction });
  await queryInterface.dropTable(table, { transaction });
  await queryInterface.renameTable(backup, table, { transaction });
  for (const object of objects) {
    if (!/\btopicId\b/i.test(object.sql)) await sequelize.query(object.sql, { transaction });
  }
  if (sequences.length) {
    await sequelize.query('UPDATE sqlite_sequence SET seq = MAX(seq, :seq) WHERE name = :table', {
      ...options, replacements: { table, seq: sequences[0].seq }
    });
  }
};

// Rewrite only standalone query operators, preserving quoted search content.
const migrateGrouping = query => {
  let result = '';
  let quote = null;
  for (let index = 0; index < query.length; index++) {
    const character = query[index];
    if (character === '\\' && quote && index + 1 < query.length) {
      result += character + query[++index];
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if ((index === 0 || /\s/.test(query[index - 1])) && /^grouping:topic(?=\s|$)/i.test(query.slice(index))) {
      result += 'grouping:event';
      index += 'grouping:topic'.length - 1;
      continue;
    }
    result += character;
  }
  return result;
};

const cleanMetadata = async (queryInterface, Sequelize, tables, transaction) => {
  const options = { transaction };
  if (tables.has('processing_jobs')) {
    await queryInterface.bulkDelete('processing_jobs', {
      type: 'semantic_label',
      [Sequelize.Op.and]: Sequelize.where(Sequelize.json('payload.targetType'), 'topic')
    }, options);
  }
  if (tables.has('settings')) await queryInterface.bulkUpdate('settings', { grouping: 'event' }, { grouping: 'topic' }, options);
  // Only remove obsolete relationship metadata; keep every behavioral snapshot and article identifier.
  for (const [table, column] of [['islands', 'populationAudit'], ['smart_folders', 'query']]) {
    if (!tables.has(table)) continue;
    let afterId = 0;
    while (true) {
      const rows = await queryInterface.select(null, table, {
        attributes: ['id', column], where: { id: { [Sequelize.Op.gt]: afterId } },
        order: [['id', 'ASC']], limit: 200, ...options
      });
      if (!rows.length) break;
      for (const row of rows) {
        let value = row[column];
        if (column === 'query') value = migrateGrouping(value);
        else {
          if (typeof value === 'string') value = JSON.parse(value);
          if (!Array.isArray(value)) continue;
          value = value.map(entry => {
            const copy = { ...entry };
            delete copy.topicIds;
            return copy;
          });
          value = JSON.stringify(value);
        }
        await queryInterface.bulkUpdate(table, { [column]: value }, { id: row.id }, options);
      }
      afterId = rows.at(-1).id;
    }
  }
};

export const up = async (queryInterface, Sequelize) => {
  const { sequelize } = queryInterface;
  const tables = new Set(await queryInterface.showAllTables());
  const sqlite = sequelize.getDialect() === 'sqlite';
  const remove = async transaction => {
    for (const table of joins) if (tables.has(table)) await queryInterface.dropTable(table, { transaction });
    for (const table of ['articles', 'events']) {
      if (!tables.has(table) || !(await queryInterface.describeTable(table, { transaction })).topicId) continue;
      if (sqlite) await removeSqliteColumn(queryInterface, table, transaction);
      else {
        const references = await queryInterface.getForeignKeyReferencesForTable(table);
        for (const reference of references) {
          if (reference.columnName === 'topicId') await queryInterface.removeConstraint(table, reference.constraintName);
        }
        for (const index of await queryInterface.showIndex(table)) {
          if (index.fields.some(field => field.attribute === 'topicId')) await queryInterface.removeIndex(table, index.name);
        }
        await queryInterface.removeColumn(table, 'topicId');
      }
    }
    if (tables.has('topics')) await queryInterface.dropTable('topics', { transaction });
    await cleanMetadata(queryInterface, Sequelize, tables, transaction);
    if (sqlite) {
      const [violations] = await sequelize.query('PRAGMA foreign_key_check', { transaction });
      if (violations.length) throw new Error('Foreign key validation failed after semantic schema migration.');
    }
  };
  if (!sqlite) return remove();
  // SQLite PRAGMAs are connection-local. A managed transaction may open a new
  // connection with foreign keys enabled, so bind the entire rebuild to one
  // connection and disable constraints before BEGIN on that same connection.
  const transaction = new Sequelize.Transaction(sequelize);
  const connection = await sequelize.connectionManager.getConnection({ uuid: transaction.id });
  transaction.connection = connection;
  connection.uuid = transaction.id;
  const options = { transaction };
  const [foreignKeys] = await sequelize.query('PRAGMA foreign_keys', options);
  const enabled = foreignKeys.foreign_keys === 1;
  let begun = false;
  try {
    if (enabled) await sequelize.query('PRAGMA foreign_keys = OFF', options);
    await sequelize.query('BEGIN IMMEDIATE TRANSACTION', options);
    begun = true;
    await remove(transaction);
    await sequelize.query('COMMIT', options);
    begun = false;
  } catch (error) {
    if (begun) await sequelize.query('ROLLBACK', options);
    throw error;
  } finally {
    if (enabled) await sequelize.query('PRAGMA foreign_keys = ON', options);
    await sequelize.connectionManager.releaseConnection(connection);
  }
};

export const down = async () => {
  throw new Error('Removed Topic data cannot be reconstructed. Restore a pre-upgrade database backup to roll back.');
};
