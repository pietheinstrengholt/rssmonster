import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';
import { CONNECTIVITY_ERROR_EVENT } from '../src/api/client.js';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';

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
    persistentSidebarQuery: null,
    responsiveShellQuery: null,
    overviewIntervalId: null,
    sidebarScrollTimeout: null,
    unsubscribeFromSystemTheme: vi.fn()
  };

  context.getOverview = vi.fn();
  context.removeGlobalListeners = () => AppShell.methods.removeGlobalListeners.call(context);
  context.stopOverviewPolling = () => AppShell.methods.stopOverviewPolling.call(context);
  context.teardownResponsiveShell = () => AppShell.methods.teardownResponsiveShell.call(context);

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
    [true, true, true, true],
    [false, true, false, true],
    [false, false, false, false]
  ])('initializes desktop=%s and sidebar=%s responsive shell states', (
    desktopMatches,
    sidebarMatches,
    expectedDesktopShell,
    expectedPersistentSidebar
  ) => {
    const desktopMediaQuery = {
      matches: desktopMatches,
      addEventListener: vi.fn(),
      addListener: undefined
    };
    const sidebarMediaQuery = {
      matches: sidebarMatches,
      addEventListener: vi.fn(),
      addListener: undefined
    };
    vi.stubGlobal('matchMedia', vi.fn(query => (
      query === '(min-width: 880px)' ? desktopMediaQuery : sidebarMediaQuery
    )));
    const context = {
      handlePersistentSidebarChange: vi.fn(),
      handleResponsiveShellChange: vi.fn(),
      isDesktopShell: null,
      persistentSidebarQuery: null,
      responsiveShellQuery: null,
      showPersistentSidebar: null
    };

    AppShell.methods.setupResponsiveShell.call(context);

    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 880px)');
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
    expect(context.isDesktopShell).toBe(expectedDesktopShell);
    expect(context.showPersistentSidebar).toBe(expectedPersistentSidebar);
    expect(desktopMediaQuery.addEventListener).toHaveBeenCalledWith(
      'change',
      context.handleResponsiveShellChange
    );
    expect(sidebarMediaQuery.addEventListener).toHaveBeenCalledWith(
      'change',
      context.handlePersistentSidebarChange
    );
  });

  it('switches shell state when the responsive breakpoint changes', () => {
    const context = {
      isDesktopShell: true,
      mobile: true,
      mobileRefreshSidebarActive: true,
      pendingMobileFeedRefresh: true
    };

    AppShell.methods.handleResponsiveShellChange.call(context, { matches: false });

    expect(context).toMatchObject({
      isDesktopShell: false,
      mobile: null,
      mobileRefreshSidebarActive: false,
      pendingMobileFeedRefresh: false
    });
  });

  it('removes the responsive breakpoint listener during teardown', () => {
    const desktopMediaQuery = {
      removeEventListener: vi.fn(),
      removeListener: undefined
    };
    const sidebarMediaQuery = {
      removeEventListener: vi.fn(),
      removeListener: undefined
    };
    const context = {
      handlePersistentSidebarChange: vi.fn(),
      handleResponsiveShellChange: vi.fn(),
      persistentSidebarQuery: sidebarMediaQuery,
      responsiveShellQuery: desktopMediaQuery
    };

    AppShell.methods.teardownResponsiveShell.call(context);

    expect(desktopMediaQuery.removeEventListener).toHaveBeenCalledWith(
      'change',
      context.handleResponsiveShellChange
    );
    expect(sidebarMediaQuery.removeEventListener).toHaveBeenCalledWith(
      'change',
      context.handlePersistentSidebarChange
    );
    expect(context.persistentSidebarQuery).toBeNull();
    expect(context.responsiveShellQuery).toBeNull();
  });

  it('loads the Sidebar controller only when mobile feed refresh is requested', () => {
    const refreshFeeds = vi.fn();
    const context = {
      mobileRefreshSidebarActive: false,
      pendingMobileFeedRefresh: false,
      sidebarComponent: null
    };

    AppShell.methods.refreshFeeds.call(context);

    expect(context.mobileRefreshSidebarActive).toBe(true);
    expect(context.pendingMobileFeedRefresh).toBe(true);

    AppShell.methods.setSidebarRef.call(context, { refreshFeeds });

    expect(refreshFeeds).toHaveBeenCalledOnce();
    expect(context.pendingMobileFeedRefresh).toBe(false);
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
    context.sidebarScrollTimeout = setTimeout(() => {}, 1000);
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
    expect(context.persistentSidebarQuery).toBeNull();
    expect(context.responsiveShellQuery).toBeNull();
    expect(context.overviewIntervalId).toBeNull();
    expect(context.sidebarScrollTimeout).toBeNull();
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
