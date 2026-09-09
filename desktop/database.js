import Umzug from 'umzug';
import { fileURLToPath } from 'node:url';

// Match sequelize-cli's migration order, arguments and SequelizeMeta storage.
export const migrateDatabase = async db => {
  const migrator = new Umzug({
    storage: 'sequelize',
    storageOptions: { sequelize: db.sequelize },
    migrations: {
      path: fileURLToPath(new URL('../server/migrations', import.meta.url)),
      pattern: /^\d.*\.js$/,
      params: [db.sequelize.getQueryInterface(), db.Sequelize]
    },
    logging: console.log
  });
  await db.sequelize.authenticate();
  await migrator.up();
};
