import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';

// This function creates the minimal context needed by AppShell lifecycle methods.
const createLifecycleContext = () => {
  const context = {
    actionErrorTimer: null,
    handleActionError: vi.fn(),
    handleAppError: vi.fn(),
    handleAuthExpired: vi.fn(),
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
    expect(removeEventListenerSpy).toHaveBeenCalledWith('auth:expired', context.handleAuthExpired);
    expect(context.unsubscribeFromSystemTheme).toHaveBeenCalledOnce();
    expect(context.overviewIntervalId).toBeNull();
    expect(context.sidebarScrollTimeout).toBeNull();
    expect(context.actionErrorTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
