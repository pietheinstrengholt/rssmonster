// These stable build prefixes define the static application shell without coupling it to content hashes.
export const PRECACHE_GLOB_PATTERNS = Object.freeze([
  'index.html',
  'registerSW.js',
  'manifest.webmanifest',
  'assets/index-*.js',
  'assets/index-*.css',
  'assets/rolldown-runtime-*.js',
  'assets/vue-vendor-*.js',
  'assets/axios-vendor-*.js',
  'assets/settings-api-*.js',
  'assets/AppShell-*.js',
  'assets/AppShell-*.css',
  'assets/authenticatedShell-*.js',
  'assets/Sidebar-*.js',
  'assets/Sidebar-*.css',
  'assets/DesktopToolbar-*.js',
  'assets/DesktopToolbar-*.css',
  'assets/MobileToolbar-*.js',
  'assets/MobileToolbar-*.css',
  'assets/MobileMenuOverlay-*.js',
  'assets/MobileMenuOverlay-*.css',
  'assets/ArticleReaderLayout-*.js',
  'assets/ArticleReaderLayout-*.css',
  'assets/SmartFoldersGridOverview-*.js',
  'assets/SmartFoldersGridOverview-*.css',
  'assets/InitialFeeds-*.js',
  'assets/InitialFeeds-*.css',
  'assets/categories-*.js',
  'assets/AppError-*.js',
  'assets/AppError-*.css',
  'assets/articleSelectionOptions-*.js',
  'assets/useMediaQuery-*.js',
  'img/icons/android-chrome-192x192.png',
  'img/icons/android-chrome-512x512.png',
  'img/icons/android-chrome-maskable-192x192.png',
  'img/icons/android-chrome-maskable-512x512.png'
]);

// These dynamic modules cover the authenticated reader, responsive shells, saved reader modes, and startup fallbacks.
export const CORE_DYNAMIC_MODULES = Object.freeze([
  'src/AppShell.vue',
  'src/components/articles/ArticleReaderLayout.vue',
  'src/components/articles/SmartFoldersGridOverview.vue',
  'src/components/onboarding/InitialFeeds.vue',
  'src/components/shared/AppError.vue',
  'src/components/shell/DesktopToolbar.vue',
  'src/components/shell/MobileMenuOverlay.vue',
  'src/components/shell/MobileToolbar.vue',
  'src/components/sidebar/Sidebar.vue',
  'src/services/authenticatedShell.js'
]);

// Only the standard PWA install icons are installed with the offline shell.
export const PRECACHED_PNG_ICONS = Object.freeze([
  'img/icons/android-chrome-192x192.png',
  'img/icons/android-chrome-512x512.png',
  'img/icons/android-chrome-maskable-192x192.png',
  'img/icons/android-chrome-maskable-512x512.png'
]);

// These optional feature families must remain outside the install-time precache.
export const OPTIONAL_DYNAMIC_MODULES = Object.freeze([
  'node_modules/vuedraggable/dist/vuedraggable.umd.js',
  'src/components/articles/ArticleExplanationPopover.vue',
  'src/components/articles/ArticleQualityExplanation.vue',
  'src/components/articles/ArticleRecommendationExplanation.vue',
  'src/components/assistant/ChatAssistant.vue',
  'src/components/briefing/BriefingPreferencesModal.vue',
  'src/components/dialogs/Cleanup.vue',
  'src/components/dialogs/UnreadConfigurationModal.vue',
  'src/components/dialogs/categories/DeleteCategory.vue',
  'src/components/dialogs/categories/NewCategory.vue',
  'src/components/dialogs/categories/RenameCategory.vue',
  'src/components/dialogs/feeds/DeleteFeed.vue',
  'src/components/dialogs/feeds/NewFeed.vue',
  'src/components/dialogs/feeds/UpdateFeed.vue',
  'src/components/settings/Settings.vue',
  'src/components/settings/SettingsActions.vue',
  'src/components/settings/SettingsCrawlStatistics.vue',
  'src/components/settings/SettingsFeedsOverview.vue',
  'src/components/settings/SettingsGeneratedFeeds.vue',
  'src/components/settings/SettingsIslands.vue',
  'src/components/settings/SettingsManageUsers.vue',
  'src/components/settings/SettingsOfficialSources.vue',
  'src/components/settings/SettingsScores.vue',
  'src/components/settings/SettingsSmartFolders.vue',
  'src/components/settings/SettingsTopics.vue',
  'src/components/settings/shared/ExpressionEditor.vue'
]);

// These emitted prefixes cover optional shared chunks that do not have stable source keys in the Vite manifest.
export const OPTIONAL_CHUNK_PREFIXES = Object.freeze([
  'assets/ArticleExplanationPopover-',
  'assets/ArticleQualityExplanation-',
  'assets/ArticleRecommendationExplanation-',
  'assets/BaseDialog-',
  'assets/BriefingPreferencesModal-',
  'assets/CategoryIconPicker-',
  'assets/ChatAssistant-',
  'assets/Cleanup-',
  'assets/ConfirmDialog-',
  'assets/DeleteCategory-',
  'assets/DeleteFeed-',
  'assets/ExpressionEditor-',
  'assets/NewCategory-',
  'assets/NewFeed-',
  'assets/PreferencesDialogShell-',
  'assets/RenameCategory-',
  'assets/Settings-',
  'assets/SettingsActions-',
  'assets/SettingsCrawlStatistics-',
  'assets/SettingsFeedsOverview-',
  'assets/SettingsGeneratedFeeds-',
  'assets/SettingsIslands-',
  'assets/SettingsManageUsers-',
  'assets/SettingsOfficialSources-',
  'assets/SettingsScores-',
  'assets/SettingsSmartFolders-',
  'assets/SettingsTopics-',
  'assets/UnreadConfigurationModal-',
  'assets/UpdateFeed-',
  'assets/vuedraggable.'
]);

export const OPTIONAL_ASSET_CACHE_NAME = 'rssmonster-optional-hashed-assets-v1';
export const OPTIONAL_ASSET_CACHE_MAX_ENTRIES = 60;
export const OPTIONAL_ASSET_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Public RSS documents must reach the server instead of resolving to the cached application shell.
export const NAVIGATION_FALLBACK_DENYLIST = Object.freeze([
  /^\/rss(?:\/|$)/
]);

// This route matches only same-origin, content-hashed JavaScript and CSS emitted under /assets/.
export const isOptionalHashedAssetRequest = ({ request, url }) =>
  url.origin === globalThis.location.origin
  && (request.destination === 'script' || request.destination === 'style')
  && /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(url.pathname);

// This bounded cache reuses immutable optional chunks after their first successful network load.
export const OPTIONAL_ASSET_RUNTIME_CACHE = Object.freeze({
  urlPattern: isOptionalHashedAssetRequest,
  handler: 'CacheFirst',
  method: 'GET',
  options: {
    cacheName: OPTIONAL_ASSET_CACHE_NAME,
    cacheableResponse: {
      statuses: [0, 200]
    },
    expiration: {
      maxEntries: OPTIONAL_ASSET_CACHE_MAX_ENTRIES,
      maxAgeSeconds: OPTIONAL_ASSET_CACHE_MAX_AGE_SECONDS,
      purgeOnQuotaError: true
    }
  }
});

// These budgets leave modest headroom above the focused application-shell baseline.
export const PRECACHE_BUDGETS = Object.freeze({
  maxEntries: 44,
  maxRawBytes: 1_150_000
});
