import assert from 'node:assert/strict';
import { configureRuntime, startRuntime } from '../../runtime.js';
import { createDatabaseMigrator } from '../../../server/config/migrateDatabase.js';

const [userData, phase] = process.argv.slice(2);
if (phase === 'prepare') {
  await configureRuntime(userData);
  const { default: db } = await import('../../../server/models/index.js');
  try {
    await createDatabaseMigrator(db).up({ to: '20260910001000-allow-oidc-only-users.js' });
    const query = db.sequelize.getQueryInterface();
    const now = new Date();
    await query.bulkInsert('users', [{ id: 41, username: 'legacy-desktop', password: 'retained-password', feverCredentialHash: 'retained-fever', lastLogin: now, createdAt: now, updatedAt: now }]);
    await query.bulkInsert('categories', [{ id: 42, userId: 41, name: 'Retained category', createdAt: now, updatedAt: now }]);
    await query.bulkInsert('feeds', [43, 100].map(id => ({ id, userId: 41, categoryId: 42, feedName: 'Retained feed', url: `https://example.test/${id}.xml`, feedTags: '[]', createdAt: now, updatedAt: now })));
    await query.bulkDelete('feeds', { id: 100 });
    await query.bulkInsert('articles', [{ id: 44, userId: 41, feedId: 43, title: 'Retained article', contentOriginal: '<p>Retained content</p>', favoriteInd: 1, clickedAmount: 3, sentimentScore: 88, publishedAt: now, createdAt: now, updatedAt: now }]);
    await query.bulkInsert('settings', [{ userId: 41, status: 'favorite', viewMode: 'full', createdAt: now, updatedAt: now }]);
  } finally { await db.sequelize.close(); }
} else {
  const runtime = await startRuntime(userData);
  const { default: db } = await import('../../../server/models/index.js');
  try {
    assert.equal(db.sequelize.options.transactionType, db.Sequelize.Transaction.TYPES.IMMEDIATE);
    assert.equal((await fetch(`${runtime.origin}/api/health`)).status, 200);
    const [users] = await db.sequelize.query('SELECT username, password, feverCredentialHash FROM users WHERE id = 41');
    assert.deepEqual(users, [{ username: 'legacy-desktop', password: 'retained-password', feverCredentialHash: 'retained-fever' }]);
    const [articles] = await db.sequelize.query('SELECT title, contentOriginal, savedInd, openedOriginalCount, toneScore FROM articles WHERE id = 44');
    assert.deepEqual(articles, [{ title: 'Retained article', contentOriginal: '<p>Retained content</p>', savedInd: 1, openedOriginalCount: 3, toneScore: 88 }]);
    assert.deepEqual((await db.sequelize.query('SELECT status, viewMode FROM user_settings WHERE userId = 41'))[0], [{ status: 'saved', viewMode: 'expanded' }]);
    assert.equal((await db.sequelize.query('SELECT name FROM SequelizeMeta'))[0].length, 75);
    assert.deepEqual((await db.sequelize.query('SELECT inProgress, baselineVersion FROM RSSMonsterMigrationState'))[0], [{ inProgress: null, baselineVersion: '2.4.0' }]);
    for (const model of Object.values(db).filter(value => value?.rawAttributes)) await model.findAll({ limit: 1 });
    if (phase === 'upgrade') {
      const feed = await db.Feed.create({ userId: 41, categoryId: 42, feedName: 'Next feed', url: 'https://example.test/new.xml' });
      assert.ok(feed.id > 100);
    }
  } finally { await runtime.stop(); }
}
process.exit(0);
