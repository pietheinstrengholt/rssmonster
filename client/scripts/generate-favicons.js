// scripts/generate-favicons.js
import { favicons } from 'favicons';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(clientDir, 'src/assets/images/monster.png');
const publicDir = path.join(clientDir, 'public');
const outputDir = path.join(clientDir, 'public/img/icons');
const LIGHT_PAGE_COLOR = '#F8FAFC';

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
  theme_color: LIGHT_PAGE_COLOR,
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

// This function limits install metadata to the two standard PWA icon sizes while retaining generated files on disk.
const selectManifestIcons = contents => {
  const manifest = JSON.parse(contents.toString());
  manifest.background_color = LIGHT_PAGE_COLOR;
  manifest.theme_color = LIGHT_PAGE_COLOR;
  manifest.icons = manifest.icons.filter(icon => icon.sizes === '192x192' || icon.sizes === '512x512');
  return `${JSON.stringify(manifest, null, 2)}\n`;
};

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

await Promise.all([
  ...response.images.map((image) =>
    fs.writeFile(path.join(outputDir, image.name), image.contents)
  ),
  ...response.files.flatMap((file) => {
    const fileNames = file.name === 'manifest.webmanifest'
      ? [file.name, 'site.webmanifest']
      : [file.name];
    const contents = file.name === 'manifest.webmanifest'
      ? selectManifestIcons(file.contents)
      : file.contents;

    return fileNames.map((fileName) =>
      fs.writeFile(path.join(publicDir, fileName), contents)
    );
  }),
]);

console.log('Favicons generated.');
