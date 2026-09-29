// Desktop and server installations share migration ordering and SequelizeMeta history.
export { migrateDatabase } from '../server/config/migrateDatabase.js';

// Desktop's HTTP server and AI worker share SQLite. Acquire the write lock before
// reading in a transaction, avoiding failed deferred read-to-write upgrades.
export const configureDesktopDatabase = db => {
  db.sequelize.options.transactionType = db.Sequelize.Transaction.TYPES.IMMEDIATE;
};
