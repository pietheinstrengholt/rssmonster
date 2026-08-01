import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_DYNAMIC_MODULES,
  OPTIONAL_ASSET_CACHE_MAX_ENTRIES,
  OPTIONAL_ASSET_CACHE_NAME,
  OPTIONAL_CHUNK_PREFIXES,
  OPTIONAL_DYNAMIC_MODULES,
  PRECACHE_BUDGETS,
  PRECACHED_PNG_ICONS
} from '../pwa-policy.js';

const scriptPath = fileURLToPath(import.meta.url);
const clientRoot = resolve(dirname(scriptPath), '..');
const defaultDistDirectory = resolve(clientRoot, 'dist');

// This function extracts Workbox's JSON precache manifest without depending on minified whitespace or hashes.
export const parsePrecacheEntries = source => {
  const callIndex = source.indexOf('precacheAndRoute(');
  const arrayStart = source.indexOf('[', callIndex);

  if (callIndex === -1 || arrayStart === -1) {
    throw new Error('Could not find the Workbox precache manifest in sw.js.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '[') depth += 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        const manifestSource = source.slice(arrayStart, index + 1)
          .replace(/([{,])url:/g, '$1"url":')
          .replace(/([{,])revision:/g, '$1"revision":');
        return JSON.parse(manifestSource);
      }
    }
  }

  throw new Error('The Workbox precache manifest is incomplete.');
};

// This function follows manifest imports and CSS ownership for a required application-shell chunk.
export const collectManifestFiles = (manifest, chunkKey, visited = new Set()) => {
  if (!chunkKey || visited.has(chunkKey)) return [];
  visited.add(chunkKey);

  const chunk = manifest[chunkKey];
  if (!chunk) return [];

  return [
    chunk.file,
    ...(chunk.css || []),
    ...(chunk.imports || []).flatMap(importedKey => collectManifestFiles(manifest, importedKey, visited))
  ].filter(Boolean);
};

// This function identifies every generated file required by the entry and explicit core lazy boundaries.
export const identifyRequiredPrecacheFiles = manifest => {
  const entryRecord = Object.entries(manifest).find(([, chunk]) =>
    chunk.isEntry && chunk.src === 'index.html'
  );

  if (!entryRecord) {
    throw new Error('Could not identify the index.html entry in the Vite manifest.');
  }

  const requiredFiles = new Set([
    'index.html',
    'manifest.webmanifest',
    'registerSW.js',
    ...PRECACHED_PNG_ICONS,
    ...collectManifestFiles(manifest, entryRecord[0])
  ]);

  CORE_DYNAMIC_MODULES.forEach(moduleKey => {
    if (!manifest[moduleKey]) {
      throw new Error(`Core PWA module is missing from the Vite manifest: ${moduleKey}`);
    }
    collectManifestFiles(manifest, moduleKey).forEach(file => requiredFiles.add(file));
  });

  return [...requiredFiles].sort();
};

// This function groups raw precache measurements into the requested JavaScript, CSS, PNG, and other categories.
export const measurePrecache = (distDirectory, urls) => {
  const groups = {
    js: { count: 0, bytes: 0 },
    css: { count: 0, bytes: 0 },
    png: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 }
  };
  let rawBytes = 0;

  urls.forEach(url => {
    const assetPath = resolve(distDirectory, url);
    if (!existsSync(assetPath)) throw new Error(`Precaching missing build asset: ${url}`);

    const bytes = statSync(assetPath).size;
    const extension = extname(url).slice(1);
    const group = groups[extension] || groups.other;
    group.count += 1;
    group.bytes += bytes;
    rawBytes += bytes;
  });

  return { count: urls.length, rawBytes, groups };
};

// This function checks generated artifacts against the core-shell boundary and bounded-cache policy.
export const createPwaPrecacheReport = ({ distDirectory = defaultDistDirectory } = {}) => {
  const manifestPath = resolve(distDirectory, '.vite/manifest.json');
  const serviceWorkerPath = resolve(distDirectory, 'sw.js');
  if (!existsSync(manifestPath) || !existsSync(serviceWorkerPath)) {
    throw new Error('Production PWA artifacts are missing. Run npm run build first.');
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  const urls = parsePrecacheEntries(serviceWorker).map(entry => entry.url).sort();
  const urlSet = new Set(urls);
  const requiredFiles = identifyRequiredPrecacheFiles(manifest);
  const missingCoreFiles = requiredFiles.filter(file => !urlSet.has(file));
  const optionalFiles = OPTIONAL_DYNAMIC_MODULES.flatMap(moduleKey => {
    const chunk = manifest[moduleKey];
    return chunk ? [chunk.file, ...(chunk.css || [])].filter(Boolean) : [];
  });
  const unexpectedOptionalFiles = [...new Set([
    ...optionalFiles.filter(file => urlSet.has(file)),
    ...urls.filter(url => OPTIONAL_CHUNK_PREFIXES.some(prefix => url.startsWith(prefix)))
  ])].sort();
  const pngIcons = urls.filter(url => url.endsWith('.png'));
  const measurement = measurePrecache(distDirectory, urls);
  const failures = [];

  if (missingCoreFiles.length) failures.push(`Missing core shell files: ${missingCoreFiles.join(', ')}`);
  if (unexpectedOptionalFiles.length) {
    failures.push(`Optional chunks found in precache: ${unexpectedOptionalFiles.join(', ')}`);
  }
  if (JSON.stringify(pngIcons) !== JSON.stringify([...PRECACHED_PNG_ICONS].sort())) {
    failures.push(`Unexpected PNG icon selection: ${pngIcons.join(', ') || '(none)'}`);
  }
  if (measurement.count > PRECACHE_BUDGETS.maxEntries) {
    failures.push(`Precache entry count ${measurement.count} exceeds ${PRECACHE_BUDGETS.maxEntries}.`);
  }
  if (measurement.rawBytes > PRECACHE_BUDGETS.maxRawBytes) {
    failures.push(`Precache raw size ${measurement.rawBytes} exceeds ${PRECACHE_BUDGETS.maxRawBytes} bytes.`);
  }
  if (!serviceWorker.includes(OPTIONAL_ASSET_CACHE_NAME)
    || !serviceWorker.includes(`maxEntries:${OPTIONAL_ASSET_CACHE_MAX_ENTRIES}`)) {
    failures.push('The bounded optional-asset runtime cache is missing from sw.js.');
  }

  return {
    failures,
    measurement,
    pngIcons,
    unexpectedOptionalFiles
  };
};

// This function formats byte counts consistently for the PWA artifact report.
const formatBytes = bytes => `${(bytes / 1024).toFixed(2)} KiB`;

// This function renders the PWA footprint and exclusions for local and CI review.
export const formatPwaPrecacheReport = report => {
  const lines = [
    `PWA precache: ${report.measurement.count} entries / ${formatBytes(report.measurement.rawBytes)} raw`
  ];

  Object.entries(report.measurement.groups).forEach(([extension, group]) => {
    lines.push(`- ${extension.toUpperCase()}: ${group.count} entries / ${formatBytes(group.bytes)}`);
  });
  lines.push(`- Selected PNG icons: ${report.pngIcons.join(', ')}`);
  lines.push(
    `- Unexpected optional chunks: ${report.unexpectedOptionalFiles.join(', ') || 'none'}`
  );

  if (report.failures.length) {
    lines.push('', 'PWA precache policy failed:');
    report.failures.forEach(failure => lines.push(`- ${failure}`));
  } else {
    lines.push('', 'PWA precache policy is within budget.');
  }

  return lines.join('\n');
};

// This function runs the generated-artifact guard as a command-line program.
const run = () => {
  try {
    const report = createPwaPrecacheReport();
    console.log(formatPwaPrecacheReport(report));
    if (report.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(`PWA precache check failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (resolve(process.argv[1] || '') === scriptPath) run();
