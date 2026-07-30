import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';

// This function creates the minimal context needed by AppShell lifecycle methods.
const createLifecycleContext = () => {
  const context = {
    actionErrorTimer: null,
    handleActionError: vi.fn(),
    handleAppError: vi.fn(),
    overviewIntervalId: null,
    sidebarScrollTimeout: null,
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
      detail: { type: 'offline' }
    }));

    expect(context.handleActionError).toHaveBeenCalledOnce();
    expect(context.handleAppError).toHaveBeenCalledOnce();

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
    expect(removeEventListenerSpy.mock.calls.some(([type]) => type === 'auth:expired')).toBe(false);
    expect(context.unsubscribeFromSystemTheme).toHaveBeenCalledOnce();
    expect(context.overviewIntervalId).toBeNull();
    expect(context.sidebarScrollTimeout).toBeNull();
    expect(context.actionErrorTimer).toBeNull();
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

  it('routes offline events into the fatal flow and stops polling', () => {
    const context = {
      offlineStatus: false,
      overviewLoaded: false,
      stopOverviewPolling: vi.fn(),
      $store: {
        data: {
          setFatalError: vi.fn()
        }
      }
    };
    const fatalError = {
      message: 'Backend unavailable',
      type: 'offline'
    };

    AppShell.methods.handleAppError.call(context, { detail: fatalError });

    expect(context.$store.data.setFatalError).toHaveBeenCalledWith(fatalError);
    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.offlineStatus).toBe(true);
    expect(context.overviewLoaded).toBe(true);
  });
});
