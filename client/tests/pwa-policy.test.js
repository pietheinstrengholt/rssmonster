import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_ASSET_CACHE_MAX_ENTRIES,
  OPTIONAL_ASSET_RUNTIME_CACHE,
  PRECACHE_GLOB_PATTERNS,
  PRECACHED_PNG_ICONS,
  isOptionalHashedAssetRequest
} from '../pwa-policy.js';
import {
  identifyRequiredPrecacheFiles,
  parsePrecacheEntries
} from '../scripts/check-pwa-precache.js';

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
      'assets/AppDropdown-*.js',
      'assets/AppDropdown-*.css',
      'assets/FeedRefreshProgress-*.js',
      'assets/FeedRefreshProgress-*.css',
      'assets/settings-api-*.js',
      'assets/authenticatedShell-*.js',
      'assets/Sidebar-*.js',
      'assets/DesktopToolbar-*.js',
      'assets/MobileToolbar-*.js',
      'assets/MobileMenuOverlay-*.js',
      'assets/ArticleReaderLayout-*.js',
      'assets/AppError-*.css',
      'assets/articleSelectionOptions-*.js',
      'assets/date-*.js',
      'assets/useMediaQuery-*.js'
    ]));
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('**/*.js');
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('**/*.css');
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('**/*.png');
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('assets/settings-*.js');
    expect(PRECACHE_GLOB_PATTERNS).not.toContain('assets/articles-*.js');
  });

  it('selects only the standard 192px and 512px install icons', () => {
    expect(PRECACHED_PNG_ICONS).toEqual([
      'img/icons/android-chrome-192x192.png',
      'img/icons/android-chrome-512x512.png',
      'img/icons/android-chrome-maskable-192x192.png',
      'img/icons/android-chrome-maskable-512x512.png'
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

  it('requires transitive core CSS and shared JavaScript without following optional imports', () => {
    const manifest = {
      'index.html': {
        file: 'assets/index-AbCd1234.js',
        isEntry: true,
        src: 'index.html'
      }
    };

    const coreModules = {
      'src/AppShell.vue': {
        file: 'assets/AppShell-AbCd1234.js',
        imports: ['index.html']
      },
      'src/components/articles/ArticleReaderLayout.vue': {
        file: 'assets/ArticleReaderLayout-AbCd1234.js',
        imports: ['_articleSelectionOptions-AbCd1234.js']
      },
      'src/components/articles/SmartFoldersGridOverview.vue': {
        file: 'assets/SmartFoldersGridOverview-AbCd1234.js'
      },
      'src/components/onboarding/InitialFeeds.vue': {
        file: 'assets/InitialFeeds-AbCd1234.js'
      },
      'src/components/shared/AppError.vue': {
        file: 'assets/AppError-AbCd1234.js',
        css: ['assets/AppError-AbCd1234.css']
      },
      'src/components/shell/DesktopToolbar.vue': {
        file: 'assets/DesktopToolbar-AbCd1234.js',
        imports: ['_articleSelectionOptions-AbCd1234.js'],
        dynamicImports: ['src/components/settings/Settings.vue']
      },
      'src/components/shell/MobileMenuOverlay.vue': {
        file: 'assets/MobileMenuOverlay-AbCd1234.js'
      },
      'src/components/shell/MobileToolbar.vue': {
        file: 'assets/MobileToolbar-AbCd1234.js'
      },
      'src/components/sidebar/Sidebar.vue': {
        file: 'assets/Sidebar-AbCd1234.js'
      },
      'src/services/authenticatedShell.js': {
        file: 'assets/authenticatedShell-AbCd1234.js'
      },
      '_articleSelectionOptions-AbCd1234.js': {
        file: 'assets/articleSelectionOptions-AbCd1234.js'
      },
      'src/components/settings/Settings.vue': {
        file: 'assets/Settings-AbCd1234.js'
      }
    };

    const requiredFiles = identifyRequiredPrecacheFiles({ ...manifest, ...coreModules });

    expect(requiredFiles).toContain('assets/AppError-AbCd1234.css');
    expect(requiredFiles).toContain('assets/articleSelectionOptions-AbCd1234.js');
    expect(requiredFiles).not.toContain('assets/Settings-AbCd1234.js');
  });
});
