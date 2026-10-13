import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPackage } from '@electron/asar';
import { verifyPackagedRuntime } from '../verify-package.js';
import configuration from '../electron-builder.js';

test('packaged migration dependency matches the shared runner API', async () => {
  const desktop = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const serverLock = JSON.parse(await readFile(new URL('../../server/package-lock.json', import.meta.url), 'utf8'));
  assert.equal(desktop.dependencies.umzug, serverLock.packages['node_modules/umzug'].version);
});

test('Windows produces separate installer and portable artifacts', () => {
  assert.deepEqual(configuration.win.target, ['nsis', 'portable']);
  assert.equal(configuration.nsis.artifactName, '${productName}-Setup-${version}-${arch}.${ext}');
  assert.equal(configuration.portable.artifactName, '${productName}-Portable-${version}-${arch}.${ext}');
});

for (const omitted of [null, 'parser', 'migration', 'historical-migration', 'migration-helper', 'baseline-mysql', 'baseline-sqlite', 'baseline-bootstrap', 'baseline-definition', 'history-mysql', 'legacy-mysql', 'history-sqlite', 'migration-lock', 'migration-schema', 'migration-state', 'migration-runner', 'migration-converter', 'migration-scope', 'migration-seeder', 'seeder-scope', 'inference', 'storage', 'crawler', 'tray']) {
  test(`packaged runtime ${omitted ? `rejects missing ${omitted}` : 'contains parser and ESM migrations'}`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-package-regression-'));
    try {
      const source = path.join(directory, 'source');
      const migrations = path.join(directory, 'migrations');
      const resources = path.join(directory, 'resources');
      await Promise.all([source, migrations, resources].map(dir => mkdir(dir)));
      await writeFile(path.join(migrations, '20260911000000-settings.mjs'), 'export const up = () => {};');
      await mkdir(path.join(migrations, 'pre-2.4'));
      await writeFile(path.join(migrations, 'pre-2.4/20260810000000-baseline-core.js'), '');
      const files = ['desktop/service-process.js', 'server/src/workers/aiWorker.js',
        'desktop/settings.js', 'desktop/background.js', 'desktop/api.js', 'desktop/tray.js', 'desktop/crawl-process.js',
        'server/src/workers/nightlyArchiving.js', 'server/scripts/runSemanticPipeline.js'];
      if (omitted !== 'crawler') files.push('server/src/workers/crawlWorker.js');
      if (omitted !== 'tray') files.push('desktop/resources/tray.png');
      if (omitted !== 'storage') files.push('desktop/storage.js');
      if (omitted !== 'inference') files.push('inference/src/index.js');
      if (omitted !== 'parser') files.push('node_modules/feedsmith/dist/node_modules/trousse/dist/is.mjs');
      if (omitted !== 'migration') files.push('server/migrations/20260911000000-settings.mjs');
      if (omitted !== 'historical-migration') files.push('server/migrations/pre-2.4/20260810000000-baseline-core.js');
      if (omitted !== 'migration-helper') files.push('server/migrations/lib/articleStateMigration.mjs');
      if (omitted !== 'baseline-mysql') files.push('server/migrations/lib/baseline24-mysql.json');
      if (omitted !== 'baseline-sqlite') files.push('server/migrations/lib/baseline24-sqlite.json');
      if (omitted !== 'baseline-bootstrap') files.push('server/migrations/lib/baseline24Bootstrap.mjs');
      if (omitted !== 'baseline-definition') files.push('server/migrations/lib/baseline24Definition.mjs');
      if (omitted !== 'history-mysql') files.push('server/migrations/lib/history24-mysql.json');
      if (omitted !== 'legacy-mysql') files.push('server/migrations/lib/legacy24-mysql.json');
      if (omitted !== 'history-sqlite') files.push('server/migrations/lib/history24-sqlite.json');
      if (omitted !== 'migration-lock') files.push('server/config/migrationLock.js');
      if (omitted !== 'migration-schema') files.push('server/config/migrationSchema.js');
      if (omitted !== 'migration-state') files.push('server/config/migrationState.js');
      if (omitted !== 'migration-runner') files.push('server/config/migrateDatabase.js');
      if (omitted !== 'migration-converter') files.push('server/utils/baselineMigrationTable.cjs');
      if (omitted !== 'migration-scope') files.push('server/migrations/package.json');
      if (omitted !== 'migration-seeder') files.push('server/seeders/20260520104500-island-taxonomy.js');
      if (omitted !== 'seeder-scope') files.push('server/seeders/package.json');
      for (const file of files) {
        await mkdir(path.dirname(path.join(source, file)), { recursive: true });
        await writeFile(path.join(source, file), 'export {};');
      }
      await createPackage(source, path.join(resources, 'app.asar'));
      if (omitted) await assert.rejects(verifyPackagedRuntime(resources, migrations), /missing required files/);
      else await verifyPackagedRuntime(resources, migrations);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
