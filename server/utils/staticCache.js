import { isAbsolute, relative, resolve, sep } from 'node:path';

export const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const REVALIDATED_ENTRY_CACHE_CONTROL = 'no-cache';

const REVALIDATED_ENTRY_FILES = new Set([
  'index.html',
  'manifest.webmanifest',
  'registerSW.js',
  'sw.js'
]);

// This function selects cache behavior only for Vite assets and root PWA control files.
export const cacheControlForStaticFile = (filePath, staticDirectory) => {
  const relativePath = relative(staticDirectory, filePath);

  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)) {
    return undefined;
  }

  const pathSegments = relativePath.split(sep);
  if (pathSegments[0] === 'assets' && pathSegments.length > 1) {
    return IMMUTABLE_ASSET_CACHE_CONTROL;
  }

  if (pathSegments.length === 1 && REVALIDATED_ENTRY_FILES.has(pathSegments[0])) {
    return REVALIDATED_ENTRY_CACHE_CONTROL;
  }

  return undefined;
};

// This function creates the Express static hook for the configured build directory.
export const createStaticCacheHeaders = (staticDirectory = resolve('dist')) =>
  (response, filePath) => {
    const cacheControl = cacheControlForStaticFile(filePath, staticDirectory);
    if (cacheControl) response.setHeader('Cache-Control', cacheControl);
  };
