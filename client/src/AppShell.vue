<template>
  <div class="app-shell">
    <div class="app-shell-row">
      <div
        v-if="showPersistentSidebar || mobileRefreshSidebarActive"
        id="sidebar"
        ref="sidebarScrollRef"
        @scroll="handleSidebarScroll"
      >
        <!-- Sidebar events -->
        <app-sidebar
          :ref="setSidebarRef"
          @forceReload="forceReload"
          @logout="$emit('logout')"
        ></app-sidebar>
      </div>
      <div
        id="home"
      >
        <!-- MobileToolbar events -->
        <app-mobile-toolbar
          v-if="isDesktopShell === false"
          :refreshing="articleListReloadActive"
          @mobile="mobileClick"
          @forceReload="forceReload"
          @refresh="reloadArticleListFromDatabase"
        ></app-mobile-toolbar>
        <!-- Toolbar events -->
        <app-desktop-toolbar v-if="isDesktopShell === true" id="desktop-toolbar" @forceReload="forceReload"></app-desktop-toolbar>

        <!-- Error handling -->
        <app-error v-if="uiStore.fatalError" :type="uiStore.fatalError.type" @retry="forceReload"/>

        <connectivity-status
          v-if="connectivityStatus"
          :recovering="connectivityRecovering"
          :status="connectivityStatus"
          @retry="recoverConnectivity"
        />

        <!-- Add reference to home for calling child loadContent component function -->
        <app-initial-feeds v-if="showOnboarding" @completed="completeOnboarding"></app-initial-feeds>
        <app-mobile-pull-to-refresh
          v-if="showMobileArticleRefresh"
          :refreshing="databaseRefreshActive"
          @refresh="refreshArticlesFromDatabase"
        />
        <app-article-feed
          v-if="showArticleFeed"
          ref="articleFeed"
          :show-feed-refresh-progress="showPersistentSidebar === false"
          @forceReload="forceReload"
          @refresh-feeds="refreshFeeds"
        ></app-article-feed>
        <!-- Show chat assistant -->
        <app-chat-assistant v-if="uiStore.chatAssistantOpen"></app-chat-assistant>
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
.app-shell,
#home,
#sidebar {
  overscroll-behavior-y: contain;
}

/* Landscape phones and portrait tablets */
@media (max-width: 879px) {
  #desktop-toolbar {
    display: none;
  }

  #home {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  :deep(.mobile-toolbar) {
    position: sticky;
    z-index: 9999;
  }
}

@media (max-width: 767px) {
  #sidebar {
    display: none;
  }
}

@media (min-width: 880px) {
  :deep(.mobile-toolbar) {
    display: none;
  }
}

/* Persistent sidebar and independently scrolling article pane. */
@media (min-width: 768px) {
  #sidebar {
    height: 100%;
    font-weight: 500;
    background-color: var(--bg-surface-muted);
    border-right: 1px solid var(--border-subtle);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--color-transparent) var(--color-transparent);
    transition: scrollbar-color var(--motion-duration-normal) var(--motion-easing-standard);
  }

  #sidebar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  #sidebar::-webkit-scrollbar-track {
    background: var(--color-transparent);
  }

  #sidebar::-webkit-scrollbar-thumb {
    background-color: var(--color-transparent);
    transition: background-color var(--motion-duration-normal) var(--motion-easing-standard);
  }

  #sidebar.is-scrolling {
    scrollbar-color: var(--sidebar-scrollbar-thumb) var(--color-transparent);
  }

  #sidebar.is-scrolling::-webkit-scrollbar-thumb {
    background-color: var(--sidebar-scrollbar-thumb);
  }

  #home {
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  #home::-webkit-scrollbar {
    display: none;
  }

  :global(:root[data-theme='dark'] #sidebar) {
    background-color: var(--bg-secondary);
    --sidebar-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
  }
}

/* Uses document scrolling for the hybrid mobile toolbar and persistent sidebar layout. */
@media (min-width: 768px) and (max-width: 879px) {
  #home {
    display: block;
    height: auto;
    padding-left: 0;
    overflow: visible;
  }
}

@media (min-width: 768px) {
  #sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    max-width: var(--sidebar-width);
  }

  #home {
    width: calc(100% - var(--sidebar-width));
    margin-left: var(--sidebar-width);
  }
}

#sidebar {
  position: fixed;
  left: 0;
  --sidebar-scrollbar-thumb: var(--scrollbar-thumb-strong);
}

.app-error {
  margin-top: 50px;
  text-align: center;
}

.app-shell {
  background-color: var(--bg-primary);
}

.app-shell {
  height: 100%;
}

:global(:root[data-theme='dark'] .app-shell) {
  background-color: var(--bg-primary);
}

:global(:root[data-theme='dark'] .app-shell #home) {
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
// client/src/AppShell.vue

import { applyTheme, getPreferredTheme, setThemeMode, subscribeToSystemTheme } from './services/theme.js';
import { ACTION_ERROR_EVENT } from './services/actionNotifications.js';
import { CONNECTIVITY_ERROR_EVENT } from './api/client.js';

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
  data() {
    return {
      actionErrorId: 0,
      actionErrorMessage: '',
      actionErrorTimer: null,
      articleListReloadActive: false,
      category: {},
      connectivityRecovering: false,
      connectivityRecoveryPromise: null,
      connectivityStatus: null,
      databaseRefreshActive: false,
      feed: {},
      isDesktopShell: null,
      mobile: null,
      mobileRefreshSidebarActive: false,
      isUnmounting: false,
      overviewIntervalId: null,
      overviewLoaded: false,
      overviewReloading: false,
      pendingMobileFeedRefresh: false,
      persistentSidebarQuery: null,
      responsiveShellQuery: null,
      showPersistentSidebar: null,
      sidebarComponent: null,
      sidebarScrollTimeout: null,
      unsubscribeFromSystemTheme: null
    };
  },
  // Initializes the responsive shell before its async components are rendered.
  beforeMount() {
    this.setupResponsiveShell();
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
  beforeUnmount() {
    this.isUnmounting = true;
    this.unsubscribeFromSystemTheme?.();
    this.removeGlobalListeners();
    this.teardownResponsiveShell();

    if (this.actionErrorTimer !== null) {
      clearTimeout(this.actionErrorTimer);
      this.actionErrorTimer = null;
    }

    this.stopOverviewPolling();

    if (this.sidebarScrollTimeout !== null) {
      clearTimeout(this.sidebarScrollTimeout);
      this.sidebarScrollTimeout = null;
    }
  },
  methods: {
    // This function initializes the shell breakpoint without requiring browser globals during state creation.
    setupResponsiveShell() {
      if (typeof window === 'undefined') {
        this.isDesktopShell = true;
        this.showPersistentSidebar = true;
        return;
      }

      if (typeof window.matchMedia !== 'function') {
        this.isDesktopShell = window.innerWidth >= 880;
        this.showPersistentSidebar = window.innerWidth >= 768;
        return;
      }

      this.responsiveShellQuery = window.matchMedia('(min-width: 880px)');
      this.persistentSidebarQuery = window.matchMedia('(min-width: 768px)');
      this.isDesktopShell = this.responsiveShellQuery.matches;
      this.showPersistentSidebar = this.persistentSidebarQuery.matches;
      if (typeof this.responsiveShellQuery.addEventListener === 'function') {
        this.responsiveShellQuery.addEventListener('change', this.handleResponsiveShellChange);
        this.persistentSidebarQuery.addEventListener('change', this.handlePersistentSidebarChange);
      } else {
        this.responsiveShellQuery.addListener?.(this.handleResponsiveShellChange);
        this.persistentSidebarQuery.addListener?.(this.handlePersistentSidebarChange);
      }
    },
    // This function removes the responsive shell listener owned by this component.
    teardownResponsiveShell() {
      if (typeof this.responsiveShellQuery?.removeEventListener === 'function') {
        this.responsiveShellQuery.removeEventListener('change', this.handleResponsiveShellChange);
      } else {
        this.responsiveShellQuery?.removeListener?.(this.handleResponsiveShellChange);
      }
      if (typeof this.persistentSidebarQuery?.removeEventListener === 'function') {
        this.persistentSidebarQuery.removeEventListener('change', this.handlePersistentSidebarChange);
      } else {
        this.persistentSidebarQuery?.removeListener?.(this.handlePersistentSidebarChange);
      }
      this.responsiveShellQuery = null;
      this.persistentSidebarQuery = null;
    },
    // This function swaps the mounted shell components when the application breakpoint changes.
    handleResponsiveShellChange(event) {
      this.isDesktopShell = event.matches;
      this.mobile = null;

      if (!event.matches) {
        this.mobileRefreshSidebarActive = false;
        this.pendingMobileFeedRefresh = false;
      }
    },
    // This function keeps the persistent sidebar mounted at tablet and desktop widths.
    handlePersistentSidebarChange(event) {
      this.showPersistentSidebar = event.matches;
    },
    // This function retains the async Sidebar instance and starts a pending mobile refresh after it loads.
    setSidebarRef(instance) {
      this.sidebarComponent = instance || null;

      if (!instance || !this.pendingMobileFeedRefresh) return;

      this.pendingMobileFeedRefresh = false;
      instance.refreshFeeds();
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
    // This function rebuilds the current article selection after the viewport rotates.
    handleOrientationChange() {
      void this.reloadArticleListFromDatabase();
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
    handleSidebarScroll() {
      const sidebar = this.$refs.sidebarScrollRef;

      if (!sidebar) return;

      sidebar.classList.add('is-scrolling');

      if (this.sidebarScrollTimeout) {
        clearTimeout(this.sidebarScrollTimeout);
      }

      this.sidebarScrollTimeout = setTimeout(() => {
        sidebar.classList.remove('is-scrolling');
        this.sidebarScrollTimeout = null;
      }, 1000);
    },
    mobileClick(value) {
      this.mobile = value;
    },
    completeOnboarding() {
      // Mark onboarding as complete and refresh overview
      this.getOverview(true);
    },
    lookupFeedById(feedId) {
      for (let x = 0; x < this.overviewStore.categories.length; x++) {
        for (let i = 0; i < this.overviewStore.categories[x].feeds.length; i++) {
          if (this.overviewStore.categories[x].feeds[i].id === feedId) {
            return this.overviewStore.categories[x].feeds[i];
          }
        }
      }
    },
    lookupCategoryById(categoryId) {
      for (let x = 0; x < this.overviewStore.categories.length; x++) {
        if (this.overviewStore.categories[x].id === categoryId) {
          return this.overviewStore.categories[x];
        }
      }
    },
    updateSelection(data) {
      //only update the local values of some categories exist
      if (this.overviewStore.categories.length) {
        //set the feed to empty when the store changes, e.g. change can be that only a category is selected
        this.feed = {};

        //lookup category name based on the categoryId received
        if (data.categoryId) {
          const category = this.overviewStore.categories.filter(function(a) {
            return a.id == data.categoryId;
          })[0];
          this.category = category;
        }
        //lookup feed name based on the feedId
        if (data.feedId) {
          this.feed = this.lookupFeedById(data.feedId);
        }
      }
    },
    // This function refreshes overview data without conflating auth, timeout, and connectivity failures.
    async getOverview(initial) {
      try {
        await this.overviewStore.fetchOverviewSplit({ initial });

        if (this.uiStore.fatalError?.type === 'overview') {
          this.uiStore.clearFatalError();
        }
        this.overviewLoaded = true;

        // Initial load: sync local selection
        if (initial === true) {
          this.updateSelection(this.selectionStore.currentSelection);
        }
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
      document.getElementById('mobile-toolbar')?.classList.remove('hide');

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
      document.getElementById('mobile-toolbar')?.classList.remove('hide');

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
    // This function starts feed refresh immediately or loads its Sidebar controller on mobile.
    refreshFeeds() {
      if (this.sidebarComponent) {
        this.sidebarComponent.refreshFeeds();
        return;
      }

      this.pendingMobileFeedRefresh = true;
      this.mobileRefreshSidebarActive = true;
    },
    // Safely set/clear the app badge to avoid range/type errors
    setBadge(count) {
      try {
        // Require SW and API support
        if (!('serviceWorker' in navigator) || typeof navigator.setAppBadge !== 'function') {
          return;
        }

        const n = Number(count);
        // Normalize: integers only, clamp to valid non-negative, clear on zero/invalid
        const safe = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER) : 0;

        if (safe > 0) {
          navigator.setAppBadge(safe);
        } else {
          if (typeof navigator.clearAppBadge === 'function') {
            navigator.clearAppBadge();
          } else {
            // Fallback: set to 0 if clear is not available
            navigator.setAppBadge(0);
          }
        }
      } catch (e) {
        // Silently ignore badge errors (unsupported platform or range issues)
        console.warn('setBadge error:', e?.message || e);
      }
    }
  },
  //watch the store.currentSelection, set local data (category, feed) based on current selection
  watch: {
    // This function applies a theme mode loaded from the user's settings.
    "uiStore.themeMode": function(themeMode) {
      if (themeMode) {
        setThemeMode(themeMode);
      }
    },
    "selectionStore.currentSelection": {
      handler: function(data) {
        this.updateSelection(data);
      },
      deep: true
    },
    "selectionStore.currentSelection.categoryId": {
      handler: function() {
        this.feed = {};
      },
      deep: true
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
        this.setBadge(count);
      },
      deep: true
    }
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore),
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
    // Shows pull-to-refresh only for the active mobile article collection.
    showMobileArticleRefresh() {
      return this.isDesktopShell === false && this.showArticleFeed;
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
