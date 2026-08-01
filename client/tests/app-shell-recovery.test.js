import { describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

// This function creates the component state needed by overview recovery methods.
const createRecoveryContext = () => {
  const stores = createFocusedStores({
    overview: {
      fetchOverview: vi.fn(),
      fetchOverviewSplit: vi.fn()
    },
    selection: {
      currentSelection: { status: 'unread' }
    },
    ui: {
      clearFatalError: vi.fn(),
      fatalError: { type: 'offline' },
      setFatalError: vi.fn()
    }
  });
  return {
    ...stores,
    offlineStatus: true,
    overviewIntervalId: null,
    overviewLoaded: true,
    overviewReloading: false,
    databaseRefreshActive: false,
    $refs: {},
    startOverviewPolling: vi.fn(),
    stopOverviewPolling: vi.fn(),
    showActionError: vi.fn(),
    updateSelection: vi.fn()
  };
};

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
    context.uiStore.fatalError = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(timeout);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('retains authentication and enters offline mode after a connection failure', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(new Error('Network Error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.offlineStatus).toBe(true);
    expect(context.uiStore.setFatalError).toHaveBeenCalledWith({
      message: 'Backend unreachable',
      type: 'offline'
    });
  });

  it('leaves 401 session cleanup to the root authentication flow', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.offlineStatus = false;
    context.uiStore.fatalError = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue({
      response: { status: 401 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(context.offlineStatus).toBe(false);
  });

  it('keeps the session online and exposes 5xx failures as retryable overview errors', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.uiStore.fatalError = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue({
      response: { status: 503 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.offlineStatus).toBe(false);
    expect(context.uiStore.setFatalError).toHaveBeenCalledWith({
      message: 'Could not load the application overview',
      type: 'overview'
    });
  });

  it('restarts polling after a successful reconnect', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.forceReload.call(context);

    expect(context.uiStore.clearFatalError).toHaveBeenCalledOnce();
    expect(context.overviewStore.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
  });

  it('synchronizes the current selection after an initial overview succeeds', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.getOverview.call(context, true);

    expect(context.overviewStore.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(context.offlineStatus).toBe(false);
    expect(context.overviewLoaded).toBe(true);
    expect(context.updateSelection)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
  });

  it('reloads every mounted article feed after reconnecting', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const firstFeed = { fetchArticleIds: vi.fn() };
    const secondFeed = { fetchArticleIds: vi.fn() };
    context.$refs.articleFeed = [firstFeed, null, secondFeed];
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.forceReload.call(context);

    expect(firstFeed.fetchArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(secondFeed.fetchArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
  });

  it('refreshes database articles and overview counts without using the recovery reload path', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const articleFeed = { refreshArticleIds: vi.fn().mockResolvedValue(true) };
    context.$refs.articleFeed = articleFeed;
    context.overviewStore.fetchOverview.mockResolvedValue(true);

    await AppShell.methods.refreshArticlesFromDatabase.call(context);

    expect(context.overviewStore.fetchOverview).toHaveBeenCalledWith({ forceUpdate: true });
    expect(articleFeed.refreshArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(context.overviewStore.fetchOverviewSplit).not.toHaveBeenCalled();
    expect(context.databaseRefreshActive).toBe(false);
  });

  it('preserves the shell and shows a recoverable notice when database refresh fails', async () => {
    const failure = new Error('refresh unavailable');
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$refs.articleFeed = {
      refreshArticleIds: vi.fn().mockRejectedValue(failure)
    };
    context.overviewStore.fetchOverview.mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.refreshArticlesFromDatabase.call(context);

    expect(context.showActionError)
      .toHaveBeenCalledWith('Could not refresh articles. Please try again.');
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(context.databaseRefreshActive).toBe(false);
  });

  it('reloads the article feed while an overview reload is already running', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const articleFeed = { fetchArticleIds: vi.fn().mockResolvedValue() };
    context.$refs.articleFeed = articleFeed;
    context.overviewReloading = true;

    await AppShell.methods.forceReload.call(context);

    expect(articleFeed.fetchArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(context.overviewStore.fetchOverviewSplit).not.toHaveBeenCalled();
  });

  it('returns to fatal offline state when reconnecting fails', async () => {
    const failure = new Error('backend connection failed');
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(failure);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.forceReload.call(context);

    expect(context.uiStore.setFatalError).toHaveBeenCalledWith({
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
    context.overviewStore.fetchOverviewSplit.mockReturnValue(new Promise(resolve => {
      resolveOverview = resolve;
    }));

    const firstRetry = AppShell.methods.forceReload.call(context);
    const repeatedRetry = AppShell.methods.forceReload.call(context);

    expect(context.overviewStore.fetchOverviewSplit).toHaveBeenCalledOnce();
    expect(context.startOverviewPolling).not.toHaveBeenCalled();

    resolveOverview();
    await Promise.all([firstRetry, repeatedRetry]);

    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.overviewReloading).toBe(false);
  });
});
