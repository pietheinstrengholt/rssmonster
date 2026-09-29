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
    '/node_modules/feedsmith/dist/node_modules/trousse/dist/is.mjs',
    ...(await readdir(migrationsDirectory))
      .filter(name => /^\d.*\.(?:mjs|js)$/.test(name))
      .map(name => `/server/migrations/${name}`)
  ];
  const missing = required.filter(name => !entries.has(name));
  assert.equal(missing.length, 0, `Packaged runtime is missing required files:\n${missing.join('\n')}`);
};
