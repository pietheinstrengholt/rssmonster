import Umzug from 'umzug';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Retain historical filenames and SequelizeMeta while accepting new ESM migrations.
export const migrateDatabase = async db => {
  const migrator = new Umzug({
    storage: 'sequelize', storageOptions: { sequelize: db.sequelize },
    migrations: {
      path: fileURLToPath(new URL('../migrations', import.meta.url)),
      pattern: /^\d.*\.(?:mjs|js)$/,
      params: [db.sequelize.getQueryInterface(), db.Sequelize],
      customResolver: filename => ({
        up: async (...args) => { const migration = await import(pathToFileURL(filename)); return (migration.default || migration).up(...args); },
        down: async (...args) => { const migration = await import(pathToFileURL(filename)); return (migration.default || migration).down(...args); }
      })
    }, logging: console.log
  });
  await db.sequelize.authenticate();
  await migrator.up();
};
