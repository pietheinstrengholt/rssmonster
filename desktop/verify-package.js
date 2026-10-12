import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPackage } from '@electron/asar';

// Check the actual archive before installers are produced, not just the source runtime.
export const verifyPackagedRuntime = async (
  resourcesDirectory,
  migrationsDirectory = fileURLToPath(new URL('../server/migrations', import.meta.url))
) => {
  const entries = new Set(listPackage(path.join(resourcesDirectory, 'app.asar')).map(name => name.replaceAll('\\', '/')));
  const required = [
    '/desktop/storage.js',
    '/desktop/settings.js',
    '/desktop/background.js',
    '/desktop/api.js',
    '/desktop/tray.js',
    '/desktop/crawl-process.js',
    '/desktop/resources/tray.png',
    '/server/src/workers/crawlWorker.js',
    '/server/src/workers/nightlyArchiving.js',
    '/server/scripts/runSemanticPipeline.js',
    '/desktop/service-process.js',
    '/inference/src/index.js',
    '/server/src/workers/aiWorker.js',
    '/node_modules/feedsmith/dist/node_modules/trousse/dist/is.mjs',
    '/server/migrations/lib/articleStateMigration.mjs',
    '/server/migrations/lib/baseline24Definition.mjs',
    '/server/migrations/lib/baseline24Bootstrap.mjs',
    '/server/migrations/lib/baseline24-mysql.json',
    '/server/migrations/lib/baseline24-sqlite.json',
    '/server/migrations/lib/history24-mysql.json',
    '/server/migrations/lib/history24-sqlite.json',
    '/server/config/migrationLock.js',
    '/server/config/migrationSchema.js',
    '/server/config/migrationState.js',
    '/server/config/migrateDatabase.js',
    '/server/utils/baselineMigrationTable.cjs',
    '/server/migrations/package.json',
    '/server/seeders/20260520104500-island-taxonomy.js',
    '/server/seeders/package.json',
    ...(await readdir(migrationsDirectory, { recursive: true }))
      .filter(name => /^\d.*\.(?:mjs|js)$/.test(path.basename(name)))
      .map(name => `/server/migrations/${name.replaceAll('\\', '/')}`)
  ];
  const missing = required.filter(name => !entries.has(name));
  assert.equal(missing.length, 0, `Packaged runtime is missing required files:\n${missing.join('\n')}`);
};
