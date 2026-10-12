import { canonicalArticleExpression, canonicalArticleState } from './lib/articleStateMigration.mjs';

const columns = {
  articles: { favoriteInd: 'savedInd', favoritedAt: 'savedAt', clickedAmount: 'openedOriginalCount', lastClickedAt: 'lastOpenedOriginalAt' },
  feeds: { feedClickAvg: 'feedOpenedOriginalAvg', feedClickRatio: 'feedOpenedOriginalRatio' },
  archiving_settings: { neverDeleteFavorites: 'neverDeleteSaved', neverDeleteClickedArticles: 'neverDeleteOpenedOriginalArticles' }
};

// Bounded keyset batches preserve timestamps and avoid loading whole audit histories into memory.
async function rewriteField(queryInterface, table, field, convert, json = false) {
  const { sequelize } = queryInterface;
  const quote = name => queryInterface.quoteIdentifier(name);
  let after = 0;
  while (true) {
    const [rows] = await sequelize.query(`SELECT ${quote('id')}, ${quote(field)} FROM ${quote(table)} WHERE ${quote('id')} > :after ORDER BY ${quote('id')} LIMIT 200`, { replacements: { after } });
    if (!rows.length) return;
    for (const row of rows) {
      if (row[field] == null) continue;
      const previous = json && typeof row[field] === 'string' ? JSON.parse(row[field]) : row[field];
      const next = convert(previous);
      if (JSON.stringify(previous) === JSON.stringify(next)) continue;
      await sequelize.query(`UPDATE ${quote(table)} SET ${quote(field)} = :value WHERE ${quote('id')} = :id`, {
        replacements: { id: row.id, value: json ? JSON.stringify(next) : next }
      });
    }
    after = rows.at(-1).id;
  }
}

async function renameColumns(queryInterface, tables) {
  for (const [table, aliases] of Object.entries(tables)) {
    const existing = await queryInterface.describeTable(table);
    for (const [legacy, canonical] of Object.entries(aliases)) {
      if (!existing[legacy]) continue;
      if (existing[canonical]) throw new Error(`Both ${table}.${legacy} and ${canonical} exist; resolve the schema before retrying.`);
      if (queryInterface.sequelize.getDialect() === 'sqlite') {
        // Native rename preserves indexes and foreign keys; Sequelize's table rebuild drops indexes.
        const quote = name => queryInterface.quoteIdentifier(name);
        await queryInterface.sequelize.query(`ALTER TABLE ${quote(table)} RENAME COLUMN ${quote(legacy)} TO ${quote(canonical)}`);
      } else {
        await queryInterface.renameColumn(table, legacy, canonical);
      }
    }
  }
}

// Historical-schema tests using current Article/Feed models need the same column contract.
export const renameReadingStateColumns = queryInterface => renameColumns(queryInterface, { articles: columns.articles, feeds: columns.feeds });

export async function up(queryInterface) {
  await renameColumns(queryInterface, columns);
  const quote = name => queryInterface.quoteIdentifier(name);
  const renameValues = async (table, field, pairs) => {
    for (const [legacy, canonical] of pairs) {
      await queryInterface.sequelize.query(`UPDATE ${quote(table)} SET ${quote(field)} = :canonical WHERE ${quote(field)} = :legacy`, {
        replacements: { legacy, canonical }
      });
    }
  };
  const states = [['favorite', 'saved'], ['star', 'saved'], ['clicked', 'openedOriginal']];
  await renameValues('user_settings', 'status', states);
  await renameValues('actions', 'actionType', states);
  await renameValues('article_sync_actions', 'kind', [['set-favorite', 'set-saved']]);
  await rewriteField(queryInterface, 'smart_folders', 'query', canonicalArticleExpression);
  await rewriteField(queryInterface, 'generated_feeds', 'expression', canonicalArticleExpression);
  await rewriteField(queryInterface, 'islands', 'positiveSignals', canonicalArticleState, true);
  await rewriteField(queryInterface, 'islands', 'populationAudit', canonicalArticleState, true);
}

export async function down() {
  throw new Error('Saved/opened-original contracts include behavioral evidence and replay receipts. Restore a pre-upgrade backup to roll back.');
}
