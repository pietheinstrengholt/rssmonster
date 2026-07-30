import { describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';

// This function creates the component state needed by overview recovery methods.
const createRecoveryContext = () => ({
  offlineStatus: true,
  overviewIntervalId: null,
  overviewLoaded: true,
  $refs: {},
  $store: {
    auth: {
      setToken: vi.fn()
    },
    data: {
      clearFatalError: vi.fn(),
      currentSelection: { status: 'unread' },
      fetchOverviewSplit: vi.fn(),
      setFatalError: vi.fn()
    }
  },
  startOverviewPolling: vi.fn(),
  stopOverviewPolling: vi.fn(),
  updateSelection: vi.fn()
});

describe('AppShell offline recovery', () => {
  it('keeps the current online state after a polling timeout', async () => {
    const context = createRecoveryContext();
    const timeout = new Error('timeout of 15000ms exceeded');
    timeout.code = 'ECONNABORTED';
    context.offlineStatus = false;
    context.$store.data.fetchOverviewSplit.mockRejectedValue(timeout);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.$store.auth.setToken).not.toHaveBeenCalled();
  });

  it('enters offline mode and stops polling after a connection failure', async () => {
    const context = createRecoveryContext();
    context.$store.data.fetchOverviewSplit.mockRejectedValue(new Error('Network Error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.offlineStatus).toBe(true);
    expect(context.$store.auth.setToken).toHaveBeenCalledWith(null);
  });

  it('restarts polling after a successful reconnect', async () => {
    const context = createRecoveryContext();
    context.$store.data.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.forceReload.call(context);

    expect(context.$store.data.clearFatalError).toHaveBeenCalledOnce();
    expect(context.$store.data.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.$store.data.setFatalError).not.toHaveBeenCalled();
  });
});
