import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configureDesktopStorage, resolveDesktopStorage } from '../storage.js';
import { configureRuntime } from '../runtime.js';
import { localInferenceEnvironment } from '../inference-config.js';

const fixture = t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'rssmonster-storage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const paths = { userData: path.join(directory, 'AppData', 'RSSMonster'), sessionData: path.join(directory, 'old-session') };
  const app = {
    isPackaged: true,
    getPath: name => paths[name],
    setPath: (name, value) => {
      assert.ok(existsSync(value), `${name} must exist before setPath`);
      paths[name] = value;
    },
    setAppLogsPath: value => { paths.logs = value; }
  };
  const executableDirectory = path.join(directory, 'USB Drive', 'RSSMonster');
  const options = { platform: 'win32', environment: { PORTABLE_EXECUTABLE_DIR: executableDirectory } };
  return { directory, app, paths, executableDirectory, options };
};

test('installed desktop preserves its existing userData and Electron paths', t => {
  const { app, paths } = fixture(t);
  const original = { ...paths };
  assert.deepEqual(resolveDesktopStorage(app, { platform: 'win32', environment: {} }), {
    portable: false, dataDirectory: original.userData
  });
  assert.equal(configureDesktopStorage(app, { platform: 'win32', environment: {} }), original.userData);
  assert.deepEqual(paths, original);
  assert.equal(existsSync(original.userData), false);
});

test('only packaged Windows apps use the portable launcher environment', t => {
  const { app, paths, options } = fixture(t);
  for (const platform of ['darwin', 'linux']) {
    assert.equal(configureDesktopStorage(app, { ...options, platform }), paths.userData);
  }
  app.isPackaged = false;
  assert.equal(configureDesktopStorage(app, options), paths.userData);
});

test('portable first launch creates data recursively beside the original launcher, including spaces', t => {
  const { app, paths, executableDirectory, options } = fixture(t);
  const expected = path.join(executableDirectory, 'data');
  assert.equal(existsSync(executableDirectory), false);
  assert.deepEqual(resolveDesktopStorage(app, options), { portable: true, dataDirectory: expected });
  // Neither the extracted Electron executable nor the caller's working directory is consulted.
  app.getPath = () => { throw new Error('Portable startup must not consult default paths'); };
  assert.equal(configureDesktopStorage(app, options), expected);
  assert.equal(paths.userData, expected);
  assert.equal(paths.sessionData, expected);
  assert.equal(paths.crashDumps, path.join(expected, 'Crashpad'));
  assert.equal(paths.logs, path.join(expected, 'logs'));
  assert.equal(existsSync(path.join(executableDirectory, '..', '..', 'AppData')), false);
  assert.ok(readdirSync(expected).every(name => !name.startsWith('.write-test-')));
});

test('portable runtime reuses database, secrets and models after the folder moves', async t => {
  const { app, paths, directory, executableDirectory, options } = fixture(t);
  const originalEnvironment = { ...process.env };
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  });
  const dataDirectory = configureDesktopStorage(app, options);
  await configureRuntime(dataDirectory);
  assert.equal(process.env.DB_STORAGE, path.join(dataDirectory, 'rssmonster.sqlite'));
  assert.equal(process.env.AI_WORKER_HEALTH_FILE, path.join(dataDirectory, 'ai-worker-health.json'));
  const modelCache = localInferenceEnvironment(dataDirectory, {}).INFERENCE_MODEL_CACHE_DIR;
  assert.equal(modelCache, path.join(dataDirectory, 'models'));
  mkdirSync(modelCache);
  writeFileSync(path.join(modelCache, 'existing-model'), 'model fixture');
  writeFileSync(process.env.DB_STORAGE, 'existing database fixture');
  const secrets = readFileSync(path.join(dataDirectory, 'secrets.json'), 'utf8');
  assert.equal(configureDesktopStorage(app, options), dataDirectory);
  await configureRuntime(dataDirectory);
  assert.equal(readFileSync(path.join(dataDirectory, 'secrets.json'), 'utf8'), secrets);
  const moved = path.join(directory, 'Moved RSSMonster');
  await rename(executableDirectory, moved);
  const movedData = configureDesktopStorage(app, { ...options, environment: { PORTABLE_EXECUTABLE_DIR: moved } });
  await configureRuntime(movedData);
  assert.equal(process.env.DB_STORAGE, path.join(movedData, 'rssmonster.sqlite'));
  assert.equal(readFileSync(process.env.DB_STORAGE, 'utf8'), 'existing database fixture');
  assert.equal(readFileSync(path.join(movedData, 'secrets.json'), 'utf8'), secrets);
  assert.equal(readFileSync(path.join(movedData, 'models', 'existing-model'), 'utf8'), 'model fixture');
  assert.equal(paths.userData, movedData);
});

test('portable mode rejects relative launcher paths instead of depending on cwd', t => {
  const { app, options } = fixture(t);
  assert.throws(() => configureDesktopStorage(app, { ...options, environment: { PORTABLE_EXECUTABLE_DIR: 'relative' } }), /absolute path/);
});

test('portable resolution is unchanged from another working directory', t => {
  const { app, directory, executableDirectory, options } = fixture(t);
  const previous = process.cwd();
  try {
    process.chdir(directory);
    assert.equal(configureDesktopStorage(app, options), path.join(executableDirectory, 'data'));
  } finally {
    process.chdir(previous);
  }
});

test('failure to create portable data reports a writable-location error without fallback', t => {
  const { app, paths, executableDirectory, options } = fixture(t);
  mkdirSync(executableDirectory, { recursive: true });
  writeFileSync(path.join(executableDirectory, 'data'), 'blocked');
  const original = { ...paths };
  assert.throws(() => configureDesktopStorage(app, options), /Portable RSSMonster requires a writable folder.*Move the RSSMonster folder/);
  assert.deepEqual(paths, original);
  assert.equal(existsSync(original.userData), false);
});

test('existing read-only portable data fails before Electron paths change', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, t => {
  const { app, paths, executableDirectory, options } = fixture(t);
  const dataDirectory = path.join(executableDirectory, 'data');
  mkdirSync(dataDirectory, { recursive: true });
  chmodSync(dataDirectory, 0o500);
  const original = { ...paths };
  try {
    assert.throws(() => configureDesktopStorage(app, options), /requires a writable folder/);
    assert.deepEqual(paths, original);
  } finally {
    chmodSync(dataDirectory, 0o700);
  }
});
