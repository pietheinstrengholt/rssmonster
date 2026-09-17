// Run with API and workers stopped: the copy and column removal form a schema cutover.
// MySQL DDL is not transactional; retries preserve already-copied interaction state.
const dates = ['readAt', 'firstSeen', 'lastClickedAt', 'favoritedAt', 'positiveFeedbackAt', 'negativeFeedbackAt', 'lastMeaningfulReadAt', 'interestScoredAt'];
const counters = ['favoriteInd', 'clickedAmount', 'positiveInd', 'negativeInd'];
const moved = ['status', ...dates, ...counters, 'attentionBucket', 'interestScore'];

export async function up(queryInterface, Sequelize) {
  const sequelize = queryInterface.sequelize;
  const sqlite = sequelize.getDialect() === 'sqlite';
  const quote = name => queryInterface.quoteIdentifier(name);
  const tables = await queryInterface.showAllTables();
  const columns = await queryInterface.describeTable('articles');
  const indexes = await queryInterface.showIndex('articles');
  if (!indexes.some(index => index.name === 'articles_id_userId_unique')) {
    await queryInterface.addIndex('articles', ['id', 'userId'], { unique: true, name: 'articles_id_userId_unique' });
  }
  if (!tables.includes('articleInteractions')) {
    await queryInterface.createTable('articleInteractions', {
      articleId: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      readState: { type: Sequelize.ENUM('unread', 'read'), allowNull: false, defaultValue: 'unread' },
      ...Object.fromEntries(dates.map(field => [field, { type: Sequelize.DATE, allowNull: true, defaultValue: null }])),
      ...Object.fromEntries(counters.map(field => [field, { type: Sequelize.INTEGER, allowNull: ['favoriteInd', 'clickedAmount'].includes(field), defaultValue: 0 }])),
      attentionBucket: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
      interestScore: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
  }
  // A duplicate's former reading state is unknowable: use unread while keeping it suppressed.
  if (columns.status) {
    const copied = [...dates, ...counters, 'attentionBucket', 'interestScore'];
    const fields = ['articleId', 'userId', 'readState', ...copied, 'createdAt', 'updatedAt'];
    let afterId = 0;
    while (true) {
      const [rows] = await sequelize.query(`SELECT id FROM articles WHERE id > :afterId ORDER BY id LIMIT 1000`, { replacements: { afterId } });
      if (!rows.length) break;
      const lastId = rows.at(-1).id;
      const values = ['a.id', 'a.userId', "CASE WHEN a.status = 'read' THEN 'read' ELSE 'unread' END",
        ...copied.map(field => columns[field] ? `a.${quote(field)}` : dates.includes(field) ? 'NULL' : '0'), 'a.createdAt', 'a.updatedAt'];
      await sequelize.query(`INSERT INTO ${quote('articleInteractions')} (${fields.map(quote).join(', ')})
        SELECT ${values.join(', ')} FROM articles a WHERE a.id > :afterId AND a.id <= :lastId
        AND NOT EXISTS (SELECT 1 FROM ${quote('articleInteractions')} i WHERE i.articleId = a.id)`, { replacements: { afterId, lastId } });
      afterId = lastId;
    }
  }
  const [missing] = await sequelize.query(`SELECT COUNT(*) AS count FROM articles a LEFT JOIN ${quote('articleInteractions')} i
    ON i.articleId = a.id AND i.userId = a.userId WHERE i.articleId IS NULL`);
  if (Number(missing[0].count)) throw new Error('Article interaction copy is incomplete; old columns have not been removed.');
  const constraints = await queryInterface.showConstraint('articleInteractions');
  if (!constraints.some(constraint => constraint.constraintName === 'articleInteractions_article_owner_fk')) {
    await queryInterface.addConstraint('articleInteractions', {
      fields: ['articleId', 'userId'], type: 'foreign key', name: 'articleInteractions_article_owner_fk',
      references: { table: 'articles', fields: ['id', 'userId'] }, onDelete: 'CASCADE', onUpdate: 'CASCADE'
    });
  }
  const stateIndexes = await queryInterface.showIndex('articleInteractions');
  for (const field of ['readState', 'favoriteInd', 'firstSeen']) {
    const name = `articleInteractions_userId_${field}_articleId`;
    if (!stateIndexes.some(index => index.name === name)) await queryInterface.addIndex('articleInteractions', ['userId', field, 'articleId'], { name });
  }
  for (const index of indexes) {
    if (index.fields.some(field => moved.includes(field.attribute))) await queryInterface.removeIndex('articles', index.name);
  }
  // Native SQLite DROP COLUMN preserves unrelated indexes, constraints and child rows.
  // Sequelize's table-copy fallback can turn a composite unique key into per-column keys.
  for (const field of moved) {
    if (!columns[field]) continue;
    if (sqlite) await sequelize.query(`ALTER TABLE articles DROP COLUMN ${quote(field)}`);
    else await queryInterface.removeColumn('articles', field);
  }
  if (sqlite) {
    const [violations] = await sequelize.query('PRAGMA foreign_key_check');
    if (violations.length) throw new Error('Article interaction migration left foreign-key violations.');
  }
}

export async function down() {
  throw new Error('Interaction state cannot safely be merged into the old schema online. Restore a pre-upgrade backup to roll back.');
}
