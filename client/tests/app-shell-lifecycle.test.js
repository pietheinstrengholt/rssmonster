import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';
import { CONNECTIVITY_ERROR_EVENT } from '../src/api/client.js';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';
import { SHELL_MODE } from '../src/config/responsiveLayout.js';

// This function creates the minimal context needed by AppShell lifecycle methods.
const createLifecycleContext = () => {
  const context = {
    actionErrorTimer: null,
    handleActionError: vi.fn(),
    handleAppError: vi.fn(),
    handleBrowserOffline: vi.fn(),
    handleBrowserOnline: vi.fn(),
    handleConnectivityError: vi.fn(),
    isUnmounting: false,
    connectivityStatus: null,
    overviewIntervalId: null,
    unsubscribeFromSystemTheme: vi.fn()
  };

  context.getOverview = vi.fn();
  context.removeGlobalListeners = () => AppShell.methods.removeGlobalListeners.call(context);
  context.stopOverviewPolling = () => AppShell.methods.stopOverviewPolling.call(context);

  return context;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AppShell lifecycle', () => {
  it.each([
    [SHELL_MODE.MOBILE, true, false, false],
    [SHELL_MODE.HYBRID, false, true, false],
    [SHELL_MODE.DESKTOP, false, true, true]
  ])('derives %s shell presentation from one canonical state', (
    shellMode,
    isMobileShell,
    showPersistentSidebar,
    isDesktopShell
  ) => {
    const context = { shellMode };

    expect(AppShell.computed.isMobileShell.call(context)).toBe(isMobileShell);
    expect(AppShell.computed.isHybridShell.call(context)).toBe(shellMode === SHELL_MODE.HYBRID);
    expect(AppShell.computed.isDesktopShell.call(context)).toBe(isDesktopShell);
    expect(AppShell.computed.showPersistentSidebar.call(context)).toBe(showPersistentSidebar);
  });

  it('switches shell state when the responsive breakpoint changes', () => {
    const context = {
      mobile: true
    };

    AppShell.methods.handleResponsiveShellChange.call(context);

    expect(context.mobile).toBeNull();
  });

  it.each([
    ['iPad portrait at 820 x 1180', false, true, true, true],
    ['iPad landscape at 1180 x 820', true, true, true, true],
    ['smaller tablet at 768 x 1024', false, true, true, true],
    ['mobile at 390 x 844', false, true, true, true],
    ['desktop at 1440 x 900', true, false, false, false],
    ['non-touch desktop below 1200px', true, true, false, false]
  ])('resolves pull-to-refresh eligibility for %s', (
    _viewport,
    isDesktopShell,
    isPullToRefreshViewport,
    supportsTouch,
    expected
  ) => {
    const eligible = AppShell.computed.showMobileArticleRefresh.call({
      isDesktopShell,
      isPullToRefreshViewport,
      showArticleFeed: true,
      supportsTouch
    });

    expect(eligible).toBe(expected);
  });

  it('keeps pull-to-refresh eligible while a touch tablet rotates across the shell breakpoint', () => {
    const context = {
      isPullToRefreshViewport: true,
      mobile: null,
      showArticleFeed: true,
      supportsTouch: true
    };

    context.isDesktopShell = true;
    AppShell.methods.handleResponsiveShellChange.call(context);
    expect(AppShell.computed.showMobileArticleRefresh.call(context)).toBe(true);

    context.isDesktopShell = false;
    AppShell.methods.handleResponsiveShellChange.call(context);
    expect(AppShell.computed.showMobileArticleRefresh.call(context)).toBe(true);
  });

  it('starts feed refresh through the application-owned store without mounting Sidebar', () => {
    const startRefresh = vi.fn();
    const context = {
      feedRefreshStore: { startRefresh }
    };

    AppShell.methods.refreshFeeds.call(context);

    expect(startRefresh).toHaveBeenCalledOnce();
  });

  it('reveals the mobile toolbar through reactive shell state', () => {
    const context = { mobileToolbarHidden: true };

    AppShell.methods.showMobileToolbar.call(context);

    expect(context.mobileToolbarHidden).toBe(false);
    AppShell.methods.setMobileToolbarVisibility.call(context, false);
    expect(context.mobileToolbarHidden).toBe(true);
    AppShell.methods.setMobileToolbarVisibility.call(context, true);
    expect(context.mobileToolbarHidden).toBe(false);
  });

  it('refreshes database data once without reloading settings after crawl completion', () => {
    const context = {
      forceReload: vi.fn(),
      refreshArticlesFromDatabase: vi.fn()
    };
    const watcher = AppShell.watch['feedRefreshStore.successfulCompletionId'];

    watcher.call(context, 1, 0);
    watcher.call(context, 1, 1);

    expect(context.refreshArticlesFromDatabase).toHaveBeenCalledOnce();
    expect(context.forceReload).not.toHaveBeenCalled();
  });

  it('polls every five minutes without notification or service-worker support', () => {
    const context = createLifecycleContext();

    AppShell.methods.startOverviewPolling.call(context);
    vi.advanceTimersByTime(300 * 1000);

    expect(context.getOverview).toHaveBeenCalledOnce();
    expect(context.getOverview).toHaveBeenCalledWith(false);
  });

  it('creates overview polling only once', () => {
    const context = createLifecycleContext();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    AppShell.methods.startOverviewPolling.call(context);
    AppShell.methods.startOverviewPolling.call(context);

    expect(setIntervalSpy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps one effective copy of each global listener across registration', () => {
    const context = createLifecycleContext();

    AppShell.methods.registerGlobalListeners.call(context);
    AppShell.methods.registerGlobalListeners.call(context);
    window.dispatchEvent(new CustomEvent(ACTION_ERROR_EVENT, {
      detail: { message: 'Retry later' }
    }));
    window.dispatchEvent(new CustomEvent('app:error', {
      detail: { type: 'overview' }
    }));
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new CustomEvent(CONNECTIVITY_ERROR_EVENT));

    expect(context.handleActionError).toHaveBeenCalledOnce();
    expect(context.handleAppError).toHaveBeenCalledOnce();
    expect(context.handleBrowserOffline).toHaveBeenCalledOnce();
    expect(context.handleBrowserOnline).toHaveBeenCalledOnce();
    expect(context.handleConnectivityError).toHaveBeenCalledOnce();

    AppShell.methods.removeGlobalListeners.call(context);
  });

  it('removes global listeners and clears timers during unmount', () => {
    const context = createLifecycleContext();
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    context.overviewIntervalId = setInterval(() => {}, 300 * 1000);
    context.actionErrorTimer = setTimeout(() => {}, 6000);

    AppShell.beforeUnmount.call(context);

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      ACTION_ERROR_EVENT,
      context.handleActionError
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith('app:error', context.handleAppError);
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      CONNECTIVITY_ERROR_EVENT,
      context.handleConnectivityError
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', context.handleBrowserOffline);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', context.handleBrowserOnline);
    expect(removeEventListenerSpy.mock.calls.some(([type]) => type === 'auth:expired')).toBe(false);
    expect(context.unsubscribeFromSystemTheme).toHaveBeenCalledOnce();
    expect(context.overviewIntervalId).toBeNull();
    expect(context.actionErrorTimer).toBeNull();
    expect(context.isUnmounting).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces and automatically dismisses recoverable action notices', () => {
    const context = {
      actionErrorId: 0,
      actionErrorMessage: '',
      actionErrorTimer: null
    };
    // This function connects the timeout callback to the component method.
    context.dismissActionError = () => AppShell.methods.dismissActionError.call(context);

    AppShell.methods.showActionError.call(context, 'First failure');
    const firstTimer = context.actionErrorTimer;
    AppShell.methods.showActionError.call(context, 'Latest failure');

    expect(context.actionErrorMessage).toBe('Latest failure');
    expect(context.actionErrorId).toBe(2);
    expect(context.actionErrorTimer).not.toBe(firstTimer);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(6000);

    expect(context.actionErrorMessage).toBe('');
    expect(context.actionErrorTimer).toBeNull();
  });

  it('routes legacy offline errors into degraded mode without using the fatal channel', () => {
    const context = {
      handleConnectivityError: vi.fn(),
      uiStore: {
        setFatalError: vi.fn()
      }
    };
    const fatalError = {
      message: 'Backend unavailable',
      type: 'offline'
    };

    AppShell.methods.handleAppError.call(context, { detail: fatalError });

    expect(context.handleConnectivityError).toHaveBeenCalledOnce();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
  });

  it('routes recoverable and fatal application errors to their owned surfaces', () => {
    const context = {
      showActionError: vi.fn(),
      handleConnectivityError: vi.fn(),
      uiStore: { setFatalError: vi.fn() }
    };

    AppShell.methods.handleActionError.call(context, {
      detail: { message: 'Try the action again' }
    });
    AppShell.methods.handleAppError.call(context, {
      detail: { type: 'overview', message: 'Overview unavailable' }
    });

    expect(context.showActionError).toHaveBeenCalledWith('Try the action again');
    expect(context.uiStore.setFatalError).toHaveBeenCalledWith({
      type: 'overview', message: 'Overview unavailable'
    });
  });

  it('handles unsupported and clear-less application badge platforms', async () => {
    const originalServiceWorker = navigator.serviceWorker;
    const originalSetAppBadge = navigator.setAppBadge;
    const originalClearAppBadge = navigator.clearAppBadge;

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: undefined });
    await AppShell.methods.setBadge(4);

    const setAppBadge = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: setAppBadge });
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: undefined });
    await AppShell.methods.setBadge(0);
    expect(setAppBadge).toHaveBeenCalledWith(0);

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalServiceWorker });
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: originalSetAppBadge });
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: originalClearAppBadge });
  });

  it('applies theme and badge watcher updates only through shell services', () => {
    const context = {
      setBadge: vi.fn()
    };

    AppShell.watch['uiStore.themeMode'].call(context, 'dark');
    AppShell.watch['uiStore.themeMode'].call(context, '');
    AppShell.watch['overviewStore.unreadCount'].handler.call(context, 12);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(context.setBadge).toHaveBeenCalledWith(12);
  });

  it('shows browser-offline status immediately and stops polling', () => {
    const context = {
      connectivityStatus: null,
      stopOverviewPolling: vi.fn()
    };

    AppShell.methods.handleBrowserOffline.call(context);

    expect(context.connectivityStatus).toBe('browser-offline');
    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
  });

  it('starts one recovery check when the browser reports online', () => {
    const context = {
      connectivityStatus: 'browser-offline',
      recoverConnectivity: vi.fn().mockResolvedValue(true)
    };

    AppShell.methods.handleBrowserOnline.call(context);

    expect(context.connectivityStatus).toBe('backend-unreachable');
    expect(context.recoverConnectivity).toHaveBeenCalledOnce();
  });
});
