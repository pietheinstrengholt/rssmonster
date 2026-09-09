import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, Platform, archFromString } from 'electron-builder';
import configuration from './electron-builder.js';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(desktopDirectory, '../server');
const stageDirectory = path.join(desktopDirectory, '.stage');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

const npm = (args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
    cwd, stdio: 'inherit'
  });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} failed (${code})`)));
});

export const prepareApplication = async () => {
  const server = await readJson(path.join(serverDirectory, 'package.json'));
  const desktop = await readJson(path.join(desktopDirectory, 'package.json'));
  const lock = await readJson(path.join(serverDirectory, 'package-lock.json'));
  await rm(stageDirectory, { recursive: true, force: true });
  await mkdir(path.join(stageDirectory, 'desktop'), { recursive: true });
  await mkdir(path.join(stageDirectory, 'server'), { recursive: true });

  // Install a clean production tree without copying the developer's node_modules or data.
  const dependencies = { ...server.dependencies, ...desktop.dependencies };
  delete dependencies['sequelize-cli'];
  delete dependencies.mysql2;
  const manifest = {
    name: desktop.name,
    version: server.version,
    description: 'RSSMonster desktop RSS reader',
    author: server.author,
    license: server.license,
    homepage: 'https://github.com/pietheinstrengholt/rssmonster',
    type: 'module',
    main: 'desktop/main.js',
    dependencies
  };
  await writeJson(path.join(stageDirectory, 'package.json'), manifest);
  // Seed npm's resolution from the existing server lock, retaining its pinned runtime versions.
  lock.name = manifest.name;
  lock.version = manifest.version;
  lock.packages[''] = manifest;
  await writeJson(path.join(stageDirectory, 'package-lock.json'), lock);
  await npm(['install', '--package-lock-only', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], stageDirectory);
  await npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stageDirectory);

  for (const file of ['main.js', 'runtime.js', 'database.js']) {
    await cp(path.join(desktopDirectory, file), path.join(stageDirectory, 'desktop', file));
  }
  await cp(path.join(desktopDirectory, 'dist'), path.join(stageDirectory, 'desktop/dist'), { recursive: true });
  await cp(path.resolve(desktopDirectory, '../LICENSE.md'), path.join(stageDirectory, 'LICENSE.md'));
  await cp(path.join(serverDirectory, 'app.js'), path.join(stageDirectory, 'server/app.js'));
  await writeJson(path.join(stageDirectory, 'server/package.json'), { type: 'module', version: server.version });
  for (const directory of ['config', 'controllers', 'middleware', 'models', 'routes', 'services', 'utils', 'migrations']) {
    await cp(path.join(serverDirectory, directory), path.join(stageDirectory, 'server', directory), {
      recursive: true,
      filter: async source => {
        const name = path.basename(source);
        if (name.startsWith('.') || name === 'semanticVectorFixtures.js') return false;
        return (await stat(source)).isDirectory() || /\.(js|cjs|json)$/.test(name);
      }
    });
  }
  // HTTP controllers, status services and a migration import these shared modules.
  for (const file of [
    'scripts/calculateFeedTrust.js', 'scripts/runIslandsCommand.js',
    'seeders/20260520104500-island-taxonomy.js', 'seeders/package.json',
    'src/workers/crawlWorkerHealth.js', 'src/workers/aiWorkerHealth.js', 'src/workers/workerHealth.js'
  ]) {
    const destination = path.join(stageDirectory, 'server', file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(serverDirectory, file), destination);
  }
  return { version: server.version, electronVersion: desktop.devDependencies.electron };
};

const packageApplication = async () => {
  const platformName = process.argv[2] || process.platform;
  const platform = { darwin: Platform.MAC, mac: Platform.MAC, win32: Platform.WINDOWS, win: Platform.WINDOWS, linux: Platform.LINUX }[platformName];
  if (!platform) throw new Error(`Unsupported build platform: ${platformName}`);
  const arch = process.argv[3] || process.arch;
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported build architecture: ${arch}`);
  await npm(['run', 'build'], desktopDirectory);
  const { electronVersion } = await prepareApplication();
  // Explicitly disable certificate discovery even on machines with signing credentials installed.
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  const artifacts = await build({
    projectDir: desktopDirectory,
    targets: platform.createTarget(undefined, archFromString(arch)),
    config: { ...configuration, electronVersion },
    publish: 'never'
  });
  console.log('Desktop artifacts:', artifacts.join('\n'));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await packageApplication();
}
