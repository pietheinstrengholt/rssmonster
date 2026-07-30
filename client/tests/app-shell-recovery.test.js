import { describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';

// This function creates the component state needed by overview recovery methods.
const createRecoveryContext = () => ({
  offlineStatus: true,
  overviewIntervalId: null,
  overviewLoaded: true,
  overviewReloading: false,
  $refs: {},
  $store: {
    data: {
      clearFatalError: vi.fn(),
      currentSelection: { status: 'unread' },
      fatalError: { type: 'offline' },
      fetchOverviewSplit: vi.fn(),
      setFatalError: vi.fn()
    }
  },
  startOverviewPolling: vi.fn(),
  stopOverviewPolling: vi.fn(),
  updateSelection: vi.fn()
});

// This function connects overview methods that call each other on a component instance.
const connectRecoveryMethods = context => {
  context.handleOverviewFailure = error =>
    AppShell.methods.handleOverviewFailure.call(context, error);
  return context;
};

describe('AppShell offline recovery', () => {
  it('keeps the current online state after a polling timeout', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const timeout = new Error('timeout of 15000ms exceeded');
    timeout.code = 'ECONNABORTED';
    context.offlineStatus = false;
    context.$store.data.fatalError = null;
    context.$store.data.fetchOverviewSplit.mockRejectedValue(timeout);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.$store.data.setFatalError).not.toHaveBeenCalled();
  });

  it('retains authentication and enters offline mode after a connection failure', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$store.data.fetchOverviewSplit.mockRejectedValue(new Error('Network Error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.offlineStatus).toBe(true);
    expect(context.$store.data.setFatalError).toHaveBeenCalledWith({
      message: 'Backend unreachable',
      type: 'offline'
    });
  });

  it('leaves 401 session cleanup to the root authentication flow', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.offlineStatus = false;
    context.$store.data.fatalError = null;
    context.$store.data.fetchOverviewSplit.mockRejectedValue({
      response: { status: 401 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.$store.data.setFatalError).not.toHaveBeenCalled();
    expect(context.offlineStatus).toBe(false);
  });

  it('keeps the session online and exposes 5xx failures as retryable overview errors', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$store.data.fatalError = null;
    context.$store.data.fetchOverviewSplit.mockRejectedValue({
      response: { status: 503 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.offlineStatus).toBe(false);
    expect(context.$store.data.setFatalError).toHaveBeenCalledWith({
      message: 'Could not load the application overview',
      type: 'overview'
    });
  });

  it('restarts polling after a successful reconnect', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$store.data.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.forceReload.call(context);

    expect(context.$store.data.clearFatalError).toHaveBeenCalledOnce();
    expect(context.$store.data.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.$store.data.setFatalError).not.toHaveBeenCalled();
  });

  it('synchronizes the current selection after an initial overview succeeds', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$store.data.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.getOverview.call(context, true);

    expect(context.$store.data.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.updateSelection)
      .toHaveBeenCalledWith(context.$store.data.currentSelection);
  });

  it('reloads every mounted article feed after reconnecting', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const firstFeed = { fetchArticleIds: vi.fn() };
    const secondFeed = { fetchArticleIds: vi.fn() };
    context.$refs.articleFeed = [firstFeed, null, secondFeed];
    context.$store.data.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.forceReload.call(context);

    expect(firstFeed.fetchArticleIds)
      .toHaveBeenCalledWith(context.$store.data.currentSelection);
    expect(secondFeed.fetchArticleIds)
      .toHaveBeenCalledWith(context.$store.data.currentSelection);
  });

  it('returns to fatal offline state when reconnecting fails', async () => {
    const failure = new Error('backend connection failed');
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$store.data.fetchOverviewSplit.mockRejectedValue(failure);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.forceReload.call(context);

    expect(context.$store.data.setFatalError).toHaveBeenCalledWith({
      message: 'Backend unreachable',
      type: 'offline'
    });
    expect(context.startOverviewPolling).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Error reloading application data:',
      failure
    );
  });

  it('coalesces repeated retries and starts polling once after recovery', async () => {
    let resolveOverview;
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$store.data.fetchOverviewSplit.mockReturnValue(new Promise(resolve => {
      resolveOverview = resolve;
    }));

    const firstRetry = AppShell.methods.forceReload.call(context);
    const repeatedRetry = AppShell.methods.forceReload.call(context);

    expect(context.$store.data.fetchOverviewSplit).toHaveBeenCalledOnce();
    expect(context.startOverviewPolling).not.toHaveBeenCalled();

    resolveOverview();
    await Promise.all([firstRetry, repeatedRetry]);

    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.overviewReloading).toBe(false);
  });
});
