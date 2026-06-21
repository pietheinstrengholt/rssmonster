// scripts/generate-favicons.js
import { favicons } from 'favicons';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(clientDir, 'src/assets/images/monster.png');
const outputDir = path.join(clientDir, 'public/img/icons');

const configuration = {
  path: '/img/icons',
  appName: 'RSSMonster',
  appShortName: 'RSSMonster',
  appDescription: 'Self-hosted RSS reader',
  developerName: null,
  developerURL: null,
  dir: 'auto',
  lang: 'en-US',
  background: '#ffffff',
  theme_color: '#EA650D',
  appleStatusBarStyle: 'default',
  display: 'standalone',
  orientation: 'any',
  scope: '/',
  start_url: '/',
  version: '1.0',
  logging: false,
  pixel_art: false,
  loadManifestWithCredentials: false,
  icons: {
    favicons: true,
    android: true,
    appleIcon: true,
    appleStartup: false,
    windows: false,
    yandex: false,
  },
};

const response = await favicons(source, configuration);

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

await Promise.all([
  ...response.images.map((image) =>
    fs.writeFile(path.join(outputDir, image.name), image.contents)
  ),
  ...response.files.map((file) =>
    fs.writeFile(path.join(outputDir, file.name), file.contents)
  ),
]);

console.log('Favicons generated.');
