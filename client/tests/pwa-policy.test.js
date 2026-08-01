import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_ASSET_CACHE_MAX_ENTRIES,
  OPTIONAL_ASSET_RUNTIME_CACHE,
  PRECACHE_GLOB_PATTERNS,
  PRECACHED_PNG_ICONS,
  isOptionalHashedAssetRequest
} from '../pwa-policy.js';
import { parsePrecacheEntries } from '../scripts/check-pwa-precache.js';

// This function creates the Workbox route input used to verify optional asset boundaries.
const createRouteInput = (url, destination) => ({
  request: { destination },
  url: new URL(url)
});

describe('PWA cache policy', () => {
  it('keeps stable entry and responsive-shell patterns without broad asset globs', () => {
    expect(PRECACHE_GLOB_PATTERNS).toEqual(expect.arrayContaining([
      'index.html',
      'assets/index-*.js',
      'assets/AppShell-*.js',
      'assets/authenticatedShell-*.js',
      'assets/Sidebar-*.js',
      'assets/DesktopToolbar-*.js',
      'assets/MobileToolbar-*.js',
      'assets/MobileMenuOverlay-*.js',
      'assets/ArticleReaderLayout-*.js'
    ]));
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('**/*.js');
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('**/*.css');
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('**/*.png');
  });

  it('selects only the standard 192px and 512px install icons', () => {
    expect(PRECACHED_PNG_ICONS).toEqual([
      'img/icons/android-chrome-192x192.png',
      'img/icons/android-chrome-512x512.png'
    ]);
  });

  it('runtime-caches only same-origin hashed scripts and styles under assets', () => {
    const origin = globalThis.location.origin;

    expect(isOptionalHashedAssetRequest(
      createRouteInput(`${origin}/assets/Settings-AbCd1234.js`, 'script')
    )).toBe(true);
    expect(isOptionalHashedAssetRequest(
      createRouteInput(`${origin}/assets/Settings-AbCd1234.css`, 'style')
    )).toBe(true);
    expect(isOptionalHashedAssetRequest(
      createRouteInput(`${origin}/api/articles-AbCd1234.js`, 'script')
    )).toBe(false);
    expect(isOptionalHashedAssetRequest(
      createRouteInput('https://cdn.example/assets/Settings-AbCd1234.js', 'script')
    )).toBe(false);
    expect(isOptionalHashedAssetRequest(
      createRouteInput(`${origin}/assets/data-AbCd1234.json`, '')
    )).toBe(false);
    expect(OPTIONAL_ASSET_RUNTIME_CACHE.handler).toBe('CacheFirst');
    expect(OPTIONAL_ASSET_RUNTIME_CACHE.options.expiration.maxEntries)
      .toBe(OPTIONAL_ASSET_CACHE_MAX_ENTRIES);
  });

  it('extracts precache entries independently of minified whitespace and hashes', () => {
    const source = 'x.precacheAndRoute( [ {"url":"index.html","revision":"abc"},'
      + '{"url":"assets/index-XyZ12345.js","revision":null} ], {});';

    expect(parsePrecacheEntries(source)).toEqual([
      { url: 'index.html', revision: 'abc' },
      { url: 'assets/index-XyZ12345.js', revision: null }
    ]);
  });
});
