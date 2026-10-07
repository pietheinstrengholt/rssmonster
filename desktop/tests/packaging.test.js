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

for (const omitted of [null, 'parser', 'migration', 'inference', 'storage']) {
  test(`packaged runtime ${omitted ? `rejects missing ${omitted}` : 'contains parser and ESM migrations'}`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-package-regression-'));
    try {
      const source = path.join(directory, 'source');
      const migrations = path.join(directory, 'migrations');
      const resources = path.join(directory, 'resources');
      await Promise.all([source, migrations, resources].map(dir => mkdir(dir)));
      await writeFile(path.join(migrations, '20260911000000-settings.mjs'), 'export const up = () => {};');
      const files = ['desktop/service-process.js', 'server/src/workers/aiWorker.js'];
      if (omitted !== 'storage') files.push('desktop/storage.js');
      if (omitted !== 'inference') files.push('inference/src/index.js');
      if (omitted !== 'parser') files.push('node_modules/feedsmith/dist/node_modules/trousse/dist/is.mjs');
      if (omitted !== 'migration') files.push('server/migrations/20260911000000-settings.mjs');
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
