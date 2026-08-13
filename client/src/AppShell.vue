<template>
  <div class="app-shell">
    <div class="app-shell-row">
      <div
        v-if="showPersistentSidebar"
        class="app-shell__sidebar"
      >
        <!-- Sidebar events -->
        <app-sidebar @forceReload="forceReload" @logout="$emit('logout')"></app-sidebar>
      </div>
      <div class="app-shell__main-frame">
        <div
          class="app-shell__main"
          ref="articleScrollRootRef"
        >
        <!-- MobileToolbar events -->
        <app-mobile-toolbar
          v-if="isDesktopShell === false"
          :hidden="mobileToolbarHidden"
          :refreshing="articleListReloadActive"
          @mobile="mobileClick"
          @forceReload="forceReload"
          @refresh="reloadArticleListFromDatabase"
        ></app-mobile-toolbar>
        <!-- Toolbar events -->
        <app-desktop-toolbar v-if="isDesktopShell === true" id="desktop-toolbar" @forceReload="forceReload"></app-desktop-toolbar>

        <!-- Error handling -->
        <app-error v-if="uiStore.fatalError" :type="uiStore.fatalError.type" @retry="forceReload"/>

        <!-- Add reference to home for calling child loadContent component function -->
        <app-initial-feeds v-if="showOnboarding" @completed="completeOnboarding"></app-initial-feeds>
        <app-mobile-pull-to-refresh
          v-if="showMobileArticleRefresh"
          :class="{ 'mobile-pull-to-refresh--tablet': isDesktopShell === true }"
          :refreshing="databaseRefreshActive"
          :scroll-root="articleScrollRoot"
          @refresh="refreshArticlesFromDatabase"
          @show-mobile-toolbar="showMobileToolbar"
        />
        <app-article-feed
          v-if="showArticleFeed"
          ref="articleFeed"
          :scroll-root="articleScrollRoot"
          :show-feed-refresh-progress="showPersistentSidebar === false"
          @forceReload="forceReload"
          @mobile-toolbar-visibility="setMobileToolbarVisibility"
          @refresh-feeds="refreshFeeds"
        ></app-article-feed>
        <!-- Show chat assistant -->
        <app-chat-assistant v-if="uiStore.chatAssistantOpen"></app-chat-assistant>
        </div>
        <div v-if="connectivityStatus" class="app-shell__overlay-host">
          <connectivity-status
            :recovering="connectivityRecovering"
            :status="connectivityStatus"
            @retry="recoverConnectivity"
          />
        </div>
      </div>
    </div>
    <!-- Mobile events -->
    <app-mobile-menu-overlay v-if="isDesktopShell === false" :mobile="mobile" @mobile="mobileClick" @refresh="refreshFeeds"></app-mobile-menu-overlay>
    <action-error-notice
      v-if="actionErrorMessage"
      :key="actionErrorId"
      :message="actionErrorMessage"
      @dismiss="dismissActionError"
    />

    <component :is="activeDialogComponent" v-if="activeDialogComponent" />

  </div>
</template>

<style scoped>
/*
 * Shell responsive contract (kept in sync with config/responsiveLayout.js):
 * 0–767px mobile, 768–879px hybrid, and 880px+ desktop.
 */
.app-shell,
.app-shell__main,
.app-shell__sidebar {
  overscroll-behavior-y: contain;
}

.app-shell__main {
  --shell-filter-control-height: 34px;
  --shell-toolbar-height: 56px;
  --main-scrollbar-thumb: var(--scrollbar-thumb-strong);
}

.app-shell__main-frame {
  min-width: 0;
}

.app-shell__overlay-host {
  position: fixed;
  inset: 0;
  z-index: var(--layer-overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
}

.app-shell__overlay-host :deep(.connectivity-status) {
  pointer-events: auto;
}

/* Landscape phones and portrait tablets */
@media (max-width: 879px) {
  #desktop-toolbar {
    display: none;
  }

  .app-shell__main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  .app-shell__overlay-host {
    padding: 12px;
  }

}

@media (max-width: 767px) {
  .app-shell__sidebar {
    display: none;
  }
}

@media (min-width: 880px) {
  :deep(.mobile-toolbar) {
    display: none;
  }

  .app-shell__main {
    display: flex;
    flex-direction: column;
  }
}

/* Persistent sidebar and independently scrolling article pane. */
@media (min-width: 768px) {
  .app-shell-row {
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    height: 100vh;
    height: 100dvh;
  }

  .app-shell__sidebar {
    position: sticky;
    top: 0;
    align-self: start;
    height: 100vh;
    height: 100dvh;
    font-weight: 500;
    background-color: var(--sidebar-background);
    border-right: 1px solid var(--border-subtle);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--color-transparent) var(--color-transparent);
    transition: scrollbar-color var(--motion-duration-normal) var(--motion-easing-standard);
  }

  .app-shell__main-frame {
    display: grid;
    grid-template-areas: 'main-pane';
    height: 100%;
    min-height: 0;
  }

  .app-shell__main,
  .app-shell__overlay-host {
    grid-area: main-pane;
  }

  .app-shell__overlay-host {
    position: relative;
    inset: auto;
    min-height: 0;
  }

  .app-shell__sidebar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .app-shell__sidebar::-webkit-scrollbar-track {
    background: var(--color-transparent);
  }

  .app-shell__sidebar::-webkit-scrollbar-thumb {
    background-color: var(--color-transparent);
    border-radius: 999px;
    transition: background-color var(--motion-duration-normal) var(--motion-easing-standard);
  }

  .app-shell__sidebar:hover,
  .app-shell__sidebar:focus-within {
    scrollbar-color: var(--sidebar-scrollbar-thumb) var(--color-transparent);
  }

  .app-shell__sidebar:hover::-webkit-scrollbar-thumb,
  .app-shell__sidebar:focus-within::-webkit-scrollbar-thumb {
    background-color: var(--sidebar-scrollbar-thumb);
  }

  .app-shell__main {
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  .app-shell__main::-webkit-scrollbar {
    display: none;
  }

  :global(:root[data-theme='dark'] .app-shell__sidebar) {
    background-color: var(--sidebar-background);
    --sidebar-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
  }
}

/* Exposes the desktop shell scrollbar when the shell itself owns scrolling. */
@media (min-width: 880px) {
  .app-shell__main {
    scrollbar-color: var(--main-scrollbar-thumb) var(--color-transparent);
    scrollbar-width: thin;
  }

  .app-shell__main::-webkit-scrollbar {
    display: block;
    width: 6px;
  }

  .app-shell__main::-webkit-scrollbar-track {
    background: var(--color-transparent);
  }

  .app-shell__main::-webkit-scrollbar-thumb {
    background-color: var(--main-scrollbar-thumb);
    border-radius: 999px;
  }
}

.app-shell__sidebar {
  --sidebar-scrollbar-thumb: var(--scrollbar-thumb-strong);
}

.app-shell {
  background-color: var(--surface-card);
  height: 100%;
}

:global(:root[data-theme='dark'] .app-shell) {
  background-color: var(--surface-card);
}

:global(:root[data-theme='dark'] .app-shell .app-shell__main) {
  --main-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
  background: var(--bg-bounce);
}

:global(:root[data-theme='dark'] .app-shell img) {
  filter: brightness(.8) contrast(1.2);
}

:global(:root[data-theme='dark'] .app-shell svg.icon path) {
  fill: var(--text-icon);
}

:global(:root[data-theme='dark'] .app-shell a:visited),
:global(:root[data-theme='dark'] .app-shell a:active),
:global(:root[data-theme='dark'] .app-shell a:link) {
  color: var(--color-link);
}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from './store/selection.js';
import { useOverviewStore } from './store/overview.js';
import { useUiStore } from './store/ui.js';
import { useFeedRefreshStore } from './store/feedRefresh.js';
// client/src/AppShell.vue

import { applyTheme, getPreferredTheme, setThemeMode, subscribeToSystemTheme } from './services/theme.js';
import { ACTION_ERROR_EVENT } from './services/actionNotifications.js';
import { CONNECTIVITY_ERROR_EVENT } from './api/client.js';
import { useMediaQuery } from './composables/useMediaQuery.js';
import { useShellMode } from './composables/useShellMode.js';
import { SHELL_MODE } from './config/responsiveLayout.js';

import ArticleFeed from "./components/articles/ArticleFeed.vue";
import ActionErrorNotice from './components/shared/ActionErrorNotice.vue';
import ConnectivityStatus from './components/shared/ConnectivityStatus.vue';

// This function identifies request timeouts that should preserve the current online state.
const isOverviewTimeout = error =>
  error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');

//import components
import { defineAsyncComponent } from 'vue'
const Sidebar = defineAsyncComponent(() => import("./components/sidebar/Sidebar.vue"));
const DesktopToolbar = defineAsyncComponent(() =>  import("./components/shell/DesktopToolbar.vue"));
const MobileToolbar = defineAsyncComponent(() =>  import("./components/shell/MobileToolbar.vue"));
const MobilePullToRefresh = defineAsyncComponent(() => import("./components/shell/MobilePullToRefresh.vue"));
const MobileMenuOverlay = defineAsyncComponent(() =>  import("./components/shell/MobileMenuOverlay.vue"));
const ChatAssistant = defineAsyncComponent(() =>  import("./components/assistant/ChatAssistant.vue"));

// Each supported store identifier retains an explicit lazy import boundary.
export const DIALOG_COMPONENTS = Object.freeze({
  NewCategory: defineAsyncComponent(() => import("./components/dialogs/categories/NewCategory.vue")),
  NewFeed: defineAsyncComponent(() => import("./components/dialogs/feeds/NewFeed.vue")),
  DeleteCategory: defineAsyncComponent(() => import("./components/dialogs/categories/DeleteCategory.vue")),
  DeleteFeed: defineAsyncComponent(() => import("./components/dialogs/feeds/DeleteFeed.vue")),
  RenameCategory: defineAsyncComponent(() => import("./components/dialogs/categories/RenameCategory.vue")),
  UpdateFeed: defineAsyncComponent(() => import("./components/dialogs/feeds/UpdateFeed.vue")),
  Cleanup: defineAsyncComponent(() => import("./components/dialogs/Cleanup.vue")),
  ManageUsers: defineAsyncComponent(() => import("./components/settings/SettingsManageUsers.vue")),
  BriefingPreferences: defineAsyncComponent(() => import("./components/briefing/BriefingPreferencesModal.vue")),
  UnreadConfiguration: defineAsyncComponent(() => import("./components/dialogs/UnreadConfigurationModal.vue"))
});

//import onboarding component
const InitialFeeds = defineAsyncComponent(() =>  import("./components/onboarding/InitialFeeds.vue"));

//import error component
const Error = defineAsyncComponent(() =>  import("./components/shared/AppError.vue"));

export default {
  emits: ['logout'],
  components: {
    ActionErrorNotice,
    ConnectivityStatus,
    appSidebar: Sidebar,
    appArticleFeed: ArticleFeed,
    appDesktopToolbar: DesktopToolbar,
    appMobileToolbar: MobileToolbar,
    appMobilePullToRefresh: MobilePullToRefresh,
    appMobileMenuOverlay: MobileMenuOverlay,
    appChatAssistant: ChatAssistant,
    appError: Error,
    appInitialFeeds: InitialFeeds
  },
  // Exposes canonical shell state separately from interaction-capability queries.
  setup() {
    return {
      shellMode: useShellMode(),
      isPullToRefreshViewport: useMediaQuery(
        '(max-width: 1199px)',
        () => typeof window !== 'undefined' && window.innerWidth < 1200
      )
    };
  },
  data() {
    return {
      actionErrorId: 0,
      actionErrorMessage: '',
      actionErrorTimer: null,
      articleListReloadActive: false,
      articleScrollRoot: null,
      connectivityRecovering: false,
      connectivityRecoveryPromise: null,
      connectivityStatus: null,
      databaseRefreshActive: false,
      mobile: null,
      mobileToolbarHidden: false,
      isUnmounting: false,
      overviewIntervalId: null,
      overviewLoaded: false,
      overviewReloading: false,
      supportsTouch: false,
      unsubscribeFromSystemTheme: null
    };
  },
  // Initializes non-media responsive capability state before async components render.
  beforeMount() {
    this.supportsTouch = typeof navigator !== 'undefined'
      && Number(navigator.maxTouchPoints) > 0;
  },
  async created() {
    this.registerGlobalListeners();

    if (navigator.onLine === false) {
      this.handleBrowserOffline();
    } else {
      // Fetch all category and feed information for a complete overview including counts.
      this.getOverview(true);
      this.startOverviewPolling();
    }

    applyTheme(getPreferredTheme());
    this.unsubscribeFromSystemTheme = subscribeToSystemTheme(applyTheme);
    //add metadata properties to document
    document.title = "RSSMonster";
    document.head.querySelector("meta[name=viewport]").content = "width=device-width, initial-scale=1";
    document.head.querySelector("meta[http-equiv=X-UA-Compatible]").content = "IE=edge";
  },
  // Exposes the shell-owned article scroll surface to mounted feature components.
  mounted() {
    this.articleScrollRoot = this.$refs.articleScrollRootRef || null;
  },
  beforeUnmount() {
    this.isUnmounting = true;
    this.feedRefreshStore?.teardown?.();
    this.unsubscribeFromSystemTheme?.();
    this.removeGlobalListeners();

    if (this.actionErrorTimer !== null) {
      clearTimeout(this.actionErrorTimer);
      this.actionErrorTimer = null;
    }

    this.stopOverviewPolling();

  },
  methods: {
    // This function swaps the mounted shell components when the application breakpoint changes.
    handleResponsiveShellChange() {
      this.mobile = null;
    },
    // This function handles recoverable action error events.
    handleActionError(event) {
      this.showActionError(event.detail?.message);
    },
    // This function handles fatal application error events.
    handleAppError(event) {
      if (event.detail?.type === 'offline') {
        this.handleConnectivityError(event);
        return;
      }

      this.uiStore.setFatalError(event.detail);
    },
    // This function enters degraded mode when Axios cannot reach the backend.
    handleConnectivityError() {
      this.connectivityStatus = navigator.onLine === false
        ? 'browser-offline'
        : 'backend-unreachable';
      this.stopOverviewPolling();
    },
    // This function reacts immediately when the browser reports that its network is unavailable.
    handleBrowserOffline() {
      this.connectivityStatus = 'browser-offline';
      this.stopOverviewPolling();
    },
    // This function verifies backend access before leaving degraded mode after a browser reconnect.
    handleBrowserOnline() {
      this.connectivityStatus = 'backend-unreachable';
      void this.recoverConnectivity();
    },
    // This function restores the article surface after responsive layout settles on rotation.
    async handleOrientationChange() {
      await this.$nextTick();
      const articleFeedRefs = Array.isArray(this.$refs.articleFeed)
        ? this.$refs.articleFeed
        : [this.$refs.articleFeed];
      articleFeedRefs
        .filter(ref => ref && typeof ref.scrollArticleListToTop === 'function')
        .forEach(ref => ref.scrollArticleListToTop());
    },
    // This function registers the window listeners owned by the app shell.
    registerGlobalListeners() {
      this.removeGlobalListeners();
      window.addEventListener(ACTION_ERROR_EVENT, this.handleActionError);
      window.addEventListener(CONNECTIVITY_ERROR_EVENT, this.handleConnectivityError);
      window.addEventListener('app:error', this.handleAppError);
      window.addEventListener('offline', this.handleBrowserOffline);
      window.addEventListener('online', this.handleBrowserOnline);
      window.addEventListener('orientationchange', this.handleOrientationChange);
    },
    // This function removes the window listeners owned by the app shell.
    removeGlobalListeners() {
      window.removeEventListener(ACTION_ERROR_EVENT, this.handleActionError);
      window.removeEventListener(CONNECTIVITY_ERROR_EVENT, this.handleConnectivityError);
      window.removeEventListener('app:error', this.handleAppError);
      window.removeEventListener('offline', this.handleBrowserOffline);
      window.removeEventListener('online', this.handleBrowserOnline);
      window.removeEventListener('orientationchange', this.handleOrientationChange);
    },
    // This function starts overview polling once per app shell instance.
    startOverviewPolling() {
      if (
        this.overviewIntervalId !== null ||
        this.connectivityStatus ||
        this.isUnmounting
      ) return;

      this.overviewIntervalId = setInterval(() => {
        this.getOverview(false);
      }, 300 * 1000);
    },
    // This function stops overview polling for the app shell instance.
    stopOverviewPolling() {
      if (this.overviewIntervalId === null) return;

      clearInterval(this.overviewIntervalId);
      this.overviewIntervalId = null;
    },
    // This function displays a temporary recoverable action error.
    showActionError(message) {
      this.actionErrorMessage = message || 'Could not complete that action. Please try again.';
      this.actionErrorId += 1;

      if (this.actionErrorTimer) {
        clearTimeout(this.actionErrorTimer);
      }

      this.actionErrorTimer = setTimeout(() => {
        this.dismissActionError();
      }, 6000);
    },
    // This function dismisses the current recoverable action error.
    dismissActionError() {
      this.actionErrorMessage = '';

      if (this.actionErrorTimer) {
        clearTimeout(this.actionErrorTimer);
        this.actionErrorTimer = null;
      }
    },
    mobileClick(value) {
      this.mobile = value;
    },
    completeOnboarding() {
      // Mark onboarding as complete and refresh overview
      this.getOverview(true);
    },
    // This function refreshes overview data without conflating auth, timeout, and connectivity failures.
    async getOverview(initial) {
      if (initial) {
        void this.overviewStore.fetchSmartFolders().catch(error => {
          console.error('Error loading Smart Folders:', error);
        });
      }

      try {
        await this.overviewStore.fetchOverviewSplit({ initial });

        if (this.uiStore.fatalError?.type === 'overview') {
          this.uiStore.clearFatalError();
        }
        this.overviewLoaded = true;

      } catch (error) {
        if (!isOverviewTimeout(error)) {
          console.error('Error loading the application overview:', error);
        }
        this.handleOverviewFailure(error);
      }
    },
    // This function preserves authentication while classifying overview failures for retry.
    handleOverviewFailure(error) {
      if (isOverviewTimeout(error)) {
        console.warn('Overview request timed out, keeping current online state.', error?.message || error);
        this.overviewLoaded = true;
        return;
      }

      if (error?.response?.status === 401) {
        return;
      }

      this.overviewLoaded = true;

      if (error?.code === 'ERR_NETWORK') {
        this.handleConnectivityError();
        return;
      }

      this.stopOverviewPolling();
      this.uiStore.setFatalError({
        type: 'overview',
        message: 'Could not load the application overview'
      });
    },
    async showNotification(input) {
      if (
        !('Notification' in window) ||
        Notification.permission !== 'granted' ||
        !('serviceWorker' in navigator)
      ) return;

      try {
        const serviceWorkerRegistration = await navigator.serviceWorker.ready;
        await serviceWorkerRegistration.showNotification('New articles', {
          body: input + ' new articles arrived',
          icon: '/img/icons/android-chrome-192x192.png',
          vibrate: [300, 200, 300]
        });
      } catch (error) {
        console.error('Error showing the new article notification:', error);
      }
    },
    // This function refreshes application data for ordinary retry and toolbar reload actions.
    async forceReload() {
      if (this.connectivityStatus) {
        return this.recoverConnectivity();
      }

      if (this.overviewReloading) return;

      const articleFeedRefs = Array.isArray(this.$refs.articleFeed)
        ? this.$refs.articleFeed
        : [this.$refs.articleFeed];
      const articleReloads = articleFeedRefs
        .filter(ref => ref && typeof ref.refreshArticleIds === 'function')
        .map(ref => ref.refreshArticleIds(this.selectionStore.currentSelection));

      this.overviewReloading = true;
      try {
        // Refresh overview (this also fetches settings)
        await this.overviewStore.fetchOverviewSplit({ initial: true });
        await Promise.all(articleReloads);
        if (this.uiStore.fatalError?.type === 'overview') {
          this.uiStore.clearFatalError();
        }
        this.overviewLoaded = true;
        this.startOverviewPolling();
      } catch (error) {
        console.error('Error reloading application data:', error);
        // Keep the retry surface aligned with the actual failure type.
        this.handleOverviewFailure(error);
      } finally {
        this.overviewReloading = false;
      }
    },
    // This function coalesces recovery triggers and restores polling only after all refreshes succeed.
    recoverConnectivity() {
      if (this.connectivityRecoveryPromise) {
        return this.connectivityRecoveryPromise;
      }

      if (navigator.onLine === false) {
        this.handleBrowserOffline();
        return Promise.resolve(false);
      }

      this.connectivityStatus = 'backend-unreachable';
      this.connectivityRecovering = true;
      // This operation owns the single overview-and-article recovery sequence.
      const recoveryPromise = (async () => {
        try {
          await this.overviewStore.fetchOverviewSplit({ initial: true });
          await this.$nextTick();
          const articleFeedRefs = Array.isArray(this.$refs.articleFeed)
            ? this.$refs.articleFeed
            : [this.$refs.articleFeed];
          const articleReloads = articleFeedRefs
            .filter(ref => ref && typeof ref.refreshArticleIds === 'function')
            .map(ref => ref.refreshArticleIds(this.selectionStore.currentSelection));
          await Promise.all(articleReloads);

          if (this.isUnmounting) return false;
          if (navigator.onLine === false) {
            this.handleBrowserOffline();
            return false;
          }

          this.connectivityStatus = null;
          this.overviewLoaded = true;
          this.startOverviewPolling();
          return true;
        } catch (error) {
          if (!isOverviewTimeout(error)) {
            console.error('Error recovering application connectivity:', error);
          }

          if (error?.response?.status === 401) {
            this.connectivityStatus = null;
          } else if (error?.response) {
            this.connectivityStatus = null;
            this.handleOverviewFailure(error);
          } else if (error?.code === 'ERR_NETWORK') {
            this.handleConnectivityError();
          }
          return false;
        } finally {
          if (this.connectivityRecoveryPromise === recoveryPromise) {
            this.connectivityRecoveryPromise = null;
            this.connectivityRecovering = false;
          }
        }
      })();
      this.connectivityRecoveryPromise = recoveryPromise;
      return recoveryPromise;
    },
    // This function refreshes database-backed article results without clearing usable mobile content.
    async refreshArticlesFromDatabase() {
      if (this.databaseRefreshActive || this.articleListReloadActive) return;

      const articleFeedRefs = Array.isArray(this.$refs.articleFeed)
        ? this.$refs.articleFeed
        : [this.$refs.articleFeed];
      const refreshableFeeds = articleFeedRefs.filter(
        ref => ref && typeof ref.refreshArticleIds === 'function'
      );
      if (!refreshableFeeds.length) return;

      this.databaseRefreshActive = true;
      this.showMobileToolbar();

      try {
        const selection = { ...this.selectionStore.currentSelection };
        const refreshResults = await Promise.allSettled([
          this.overviewStore.fetchOverview({ forceUpdate: true }),
          ...refreshableFeeds.map(ref => ref.refreshArticleIds(selection))
        ]);
        const failedRefresh = refreshResults.find(result => result.status === 'rejected');
        if (failedRefresh) throw failedRefresh.reason;
      } catch (error) {
        console.error('Error refreshing articles from the database:', error);
        this.showActionError('Could not refresh articles. Please try again.');
      } finally {
        this.databaseRefreshActive = false;
      }
    },
    // This function rebuilds the mobile article list from the current selection without changing read state.
    async reloadArticleListFromDatabase() {
      if (this.articleListReloadActive || this.databaseRefreshActive) return;

      const articleFeedRefs = Array.isArray(this.$refs.articleFeed)
        ? this.$refs.articleFeed
        : [this.$refs.articleFeed];
      const reloadableFeeds = articleFeedRefs.filter(
        ref => ref && typeof ref.fetchArticleIds === 'function'
      );
      if (!reloadableFeeds.length) return;

      this.articleListReloadActive = true;
      this.showMobileToolbar();

      try {
        const selection = { ...this.selectionStore.currentSelection };
        const articleReloads = reloadableFeeds.map(ref => ref.fetchArticleIds(selection));
        const reloadResults = await Promise.allSettled([
          this.overviewStore.fetchOverview({ forceUpdate: true }),
          ...articleReloads
        ]);
        const failedReload = reloadResults.find(
          result => result.status === 'rejected' || result.value === false
        );
        if (failedReload) throw failedReload.reason || new Error('Article list reload failed');
      } catch (error) {
        console.error('Error reloading the article list from the database:', error);
        this.showActionError('Could not reload articles. Please try again.');
      } finally {
        this.articleListReloadActive = false;
      }
    },
    // This function starts application-owned feed refresh from any shell surface.
    refreshFeeds() {
      return this.feedRefreshStore.startRefresh();
    },
    // This function reveals the shell-owned mobile toolbar before a manual article refresh.
    showMobileToolbar() {
      this.mobileToolbarHidden = false;
    },
    // This function applies article-scroll visibility requests to shell-owned toolbar state.
    setMobileToolbarVisibility(isVisible) {
      this.mobileToolbarHidden = isVisible === false;
    },
    // Safely set/clear the app badge to avoid range/type errors
    async setBadge(count) {
      try {
        // Require SW and API support
        if (!('serviceWorker' in navigator) || typeof navigator.setAppBadge !== 'function') {
          return;
        }

        const n = Number(count);
        // Normalize: integers only, clamp to valid non-negative, clear on zero/invalid
        const safe = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER) : 0;

        if (safe > 0) {
          await navigator.setAppBadge(safe);
        } else {
          if (typeof navigator.clearAppBadge === 'function') {
            await navigator.clearAppBadge();
          } else {
            // Fallback: set to 0 if clear is not available
            await navigator.setAppBadge(0);
          }
        }
      } catch (e) {
        // Silently ignore badge errors (unsupported platform or range issues)
        console.warn('setBadge error:', e?.message || e);
      }
    }
  },
  watch: {
    // This function applies shell-specific cleanup when the canonical layout state changes.
    shellMode() {
      this.handleResponsiveShellChange();
    },
    // This function refreshes database-backed data once after a successful feed-refresh job.
    'feedRefreshStore.successfulCompletionId'(completionId, previousCompletionId) {
      if (completionId > previousCompletionId) {
        void this.refreshArticlesFromDatabase();
      }
    },
    // This function applies a theme mode loaded from the user's settings.
    "uiStore.themeMode": function(themeMode) {
      if (themeMode) {
        setThemeMode(themeMode);
      }
    },
    "overviewStore.unreadsSinceLastUpdate": {
      handler: function(count) {
        if (count > 0) {
          this.showNotification(count);
        }
      },
      deep: true
    },
    "overviewStore.unreadCount": {
      handler: function(count) {
        void this.setBadge(count);
      },
      deep: true
    }
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore, useFeedRefreshStore),
    isMobileShell() {
      return this.shellMode === SHELL_MODE.MOBILE;
    },
    isHybridShell() {
      return this.shellMode === SHELL_MODE.HYBRID;
    },
    isDesktopShell() {
      return this.shellMode === SHELL_MODE.DESKTOP;
    },
    showPersistentSidebar() {
      return this.shellMode !== SHELL_MODE.MOBILE;
    },
    // Resolves only explicitly supported modal identifiers to their lazy components.
    activeDialogComponent() {
      return DIALOG_COMPONENTS[this.uiStore.showModal] || null;
    },
    // Shows the article feed only when application data is available for reading.
    showArticleFeed() {
      return this.overviewLoaded
        && !this.uiStore.chatAssistantOpen
        && !this.uiStore.fatalError
        && !this.showOnboarding;
    },
    // Shows pull-to-refresh for active mobile collections and compact touch-tablet layouts.
    showMobileArticleRefresh() {
      const isTouchTabletLayout = this.supportsTouch && this.isPullToRefreshViewport;
      return this.showArticleFeed && (this.isDesktopShell === false || isTouchTabletLayout);
    },
    // Shows onboarding only after a successful empty overview load.
    showOnboarding() {
      return this.overviewLoaded
        && !this.connectivityStatus
        && !this.uiStore.fatalError
        && (this.overviewStore.categories.length === 0);
    }
  }
};
</script>
