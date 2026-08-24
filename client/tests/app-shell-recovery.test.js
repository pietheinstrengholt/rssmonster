import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../src/AppShell.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

// This function creates the component state needed by overview recovery methods.
const createRecoveryContext = () => {
  const stores = createFocusedStores({
    overview: {
      categories: [{ id: 1, name: 'News', feeds: [] }],
      fetchOverview: vi.fn(),
      fetchOverviewSplit: vi.fn(),
      fetchSmartFolders: vi.fn().mockResolvedValue()
    },
    selection: {
      currentSelection: { status: 'unread' }
    },
    ui: {
      clearFatalError: vi.fn(),
      fatalError: null,
      setFatalError: vi.fn()
    }
  });
  return {
    ...stores,
    articleListReloadActive: false,
    connectivityRecovering: false,
    connectivityRecoveryPromise: null,
    connectivityStatus: 'backend-unreachable',
    databaseRefreshActive: false,
    isUnmounting: false,
    overviewIntervalId: null,
    overviewLoaded: true,
    overviewReloading: false,
    $refs: {},
    $nextTick: vi.fn().mockResolvedValue(),
    startOverviewPolling: vi.fn(),
    stopOverviewPolling: vi.fn(),
    showActionError: vi.fn(),
    showMobileToolbar: vi.fn(),
  };
};

// This function connects recovery methods that call each other on a component instance.
const connectRecoveryMethods = context => {
  context.handleBrowserOffline = () =>
    AppShell.methods.handleBrowserOffline.call(context);
  context.handleConnectivityError = () =>
    AppShell.methods.handleConnectivityError.call(context);
  context.handleOverviewFailure = error =>
    AppShell.methods.handleOverviewFailure.call(context, error);
  context.recoverConnectivity = () =>
    AppShell.methods.recoverConnectivity.call(context);
  return context;
};

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppShell connectivity recovery', () => {
  it('keeps the current connectivity classification after a polling timeout', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const timeout = new Error('timeout of 15000ms exceeded');
    timeout.code = 'ECONNABORTED';
    context.connectivityStatus = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(timeout);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.connectivityStatus).toBeNull();
    expect(context.overviewLoaded).toBe(true);
    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('enters backend-unreachable mode without clearing content or setting a fatal error', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const networkError = new Error('Network Error');
    networkError.code = 'ERR_NETWORK';
    context.connectivityStatus = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(networkError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.connectivityStatus).toBe('backend-unreachable');
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(context.overviewStore.categories).toEqual([{ id: 1, name: 'News', feeds: [] }]);
  });

  it('leaves 401 session cleanup to the root authentication flow', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.connectivityStatus = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue({
      response: { status: 401 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).not.toHaveBeenCalled();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(context.connectivityStatus).toBeNull();
  });

  it('retains the existing fatal overview behavior for HTTP failures', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.connectivityStatus = null;
    context.overviewStore.fetchOverviewSplit.mockRejectedValue({
      response: { status: 503 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, false);

    expect(context.stopOverviewPolling).toHaveBeenCalledOnce();
    expect(context.connectivityStatus).toBeNull();
    expect(context.uiStore.setFatalError).toHaveBeenCalledWith({
      message: 'Could not load the application overview',
      type: 'overview'
    });
  });

  it('loads initial overview and Smart Folder data without relying on the sidebar', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.connectivityStatus = null;
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();

    await AppShell.methods.getOverview.call(context, true);

    expect(context.overviewStore.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(context.overviewStore.fetchSmartFolders).toHaveBeenCalledOnce();
    expect(context.overviewLoaded).toBe(true);
  });

  it('contains Smart Folder preload failures and clears a recovered overview error', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const preloadError = new Error('folders unavailable');
    context.uiStore.fatalError = { type: 'overview' };
    context.overviewStore.fetchSmartFolders.mockRejectedValue(preloadError);
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.getOverview.call(context, true);
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledWith('Error loading Smart Folders:', preloadError);
    expect(context.uiStore.clearFatalError).toHaveBeenCalledOnce();
    expect(context.overviewLoaded).toBe(true);
  });

  it('reports ordinary reload failures through the established overview classifier', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const error = { response: { status: 503 } };
    const refreshArticleIds = vi.fn().mockResolvedValue(true);
    context.connectivityStatus = null;
    context.$refs.articleFeed = [{ refreshArticleIds }, null];
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.forceReload.call(context);

    expect(refreshArticleIds).toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(console.error).toHaveBeenCalledWith('Error reloading application data:', error);
    expect(context.uiStore.setFatalError).toHaveBeenCalledWith(expect.objectContaining({ type: 'overview' }));
    expect(context.overviewReloading).toBe(false);
  });

  it('refreshes overview and current articles before clearing status and restarting polling', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const articleFeed = { refreshArticleIds: vi.fn().mockResolvedValue(true) };
    context.$refs.articleFeed = articleFeed;
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();

    const recovered = await AppShell.methods.recoverConnectivity.call(context);

    expect(recovered).toBe(true);
    expect(context.overviewStore.fetchOverviewSplit).toHaveBeenCalledWith({ initial: true });
    expect(articleFeed.refreshArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(context.connectivityStatus).toBeNull();
    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.connectivityRecovering).toBe(false);
  });

  it('coalesces browser, API, and manual recovery triggers into one active operation', async () => {
    let resolveOverview;
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockReturnValue(new Promise(resolve => {
      resolveOverview = resolve;
    }));

    const firstRetry = AppShell.methods.recoverConnectivity.call(context);
    AppShell.methods.handleConnectivityError.call(context);
    const repeatedRetry = AppShell.methods.recoverConnectivity.call(context);
    const toolbarRetry = AppShell.methods.forceReload.call(context);

    expect(repeatedRetry).toBe(firstRetry);
    expect(context.overviewStore.fetchOverviewSplit).toHaveBeenCalledOnce();
    expect(context.startOverviewPolling).not.toHaveBeenCalled();

    resolveOverview();
    await Promise.all([firstRetry, repeatedRetry, toolbarRetry]);

    expect(context.startOverviewPolling).toHaveBeenCalledOnce();
    expect(context.connectivityRecoveryPromise).toBeNull();
  });

  it('keeps backend-unreachable status and content when recovery gets a network error', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const failure = new Error('backend connection failed');
    failure.code = 'ERR_NETWORK';
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(failure);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const recovered = await AppShell.methods.recoverConnectivity.call(context);

    expect(recovered).toBe(false);
    expect(context.connectivityStatus).toBe('backend-unreachable');
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(context.startOverviewPolling).not.toHaveBeenCalled();
    expect(context.overviewStore.categories).toHaveLength(1);
  });

  it('preserves connectivity status when recovery times out', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const timeout = new Error('timeout of 15000ms exceeded');
    timeout.code = 'ECONNABORTED';
    context.overviewStore.fetchOverviewSplit.mockRejectedValue(timeout);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const recovered = await AppShell.methods.recoverConnectivity.call(context);

    expect(recovered).toBe(false);
    expect(context.connectivityStatus).toBe('backend-unreachable');
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
    expect(context.startOverviewPolling).not.toHaveBeenCalled();
  });

  it('does not display a connectivity problem when recovery reaches a 401 response', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockRejectedValue({
      response: { status: 401 }
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const recovered = await AppShell.methods.recoverConnectivity.call(context);

    expect(recovered).toBe(false);
    expect(context.connectivityStatus).toBeNull();
    expect(context.uiStore.setFatalError).not.toHaveBeenCalled();
  });

  it('does not declare recovery successful if the browser goes offline mid-request', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.overviewStore.fetchOverviewSplit.mockResolvedValue();
    const articleFeed = {
      refreshArticleIds: vi.fn().mockImplementation(async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      })
    };
    context.$refs.articleFeed = articleFeed;

    const recovered = await AppShell.methods.recoverConnectivity.call(context);

    expect(recovered).toBe(false);
    expect(context.connectivityStatus).toBe('browser-offline');
    expect(context.startOverviewPolling).not.toHaveBeenCalled();
  });

  it('short-circuits recovery while offline and classifies HTTP recovery failures', async () => {
    const offlineContext = connectRecoveryMethods(createRecoveryContext());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    await expect(AppShell.methods.recoverConnectivity.call(offlineContext)).resolves.toBe(false);
    expect(offlineContext.connectivityStatus).toBe('browser-offline');
    expect(offlineContext.overviewStore.fetchOverviewSplit).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const httpContext = connectRecoveryMethods(createRecoveryContext());
    httpContext.overviewStore.fetchOverviewSplit.mockRejectedValue({ response: { status: 503 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(AppShell.methods.recoverConnectivity.call(httpContext)).resolves.toBe(false);
    expect(httpContext.connectivityStatus).toBeNull();
    expect(httpContext.uiStore.setFatalError).toHaveBeenCalledWith(expect.objectContaining({
      type: 'overview'
    }));
  });

  it('refreshes database articles and overview counts without clearing usable content first', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const articleFeed = { refreshArticleIds: vi.fn().mockResolvedValue(true) };
    context.$refs.articleFeed = articleFeed;
    context.overviewStore.fetchOverview.mockResolvedValue(true);

    await AppShell.methods.refreshArticlesFromDatabase.call(context);

    expect(context.overviewStore.fetchOverview).toHaveBeenCalledWith({ forceUpdate: true });
    expect(articleFeed.refreshArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(context.databaseRefreshActive).toBe(false);
  });

  it('rebuilds the full article list from the current selection without using pull refresh', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    const articleFeed = {
      fetchArticleIds: vi.fn().mockResolvedValue(true),
      refreshArticleIds: vi.fn()
    };
    context.$refs.articleFeed = articleFeed;
    context.overviewStore.fetchOverview.mockResolvedValue(true);

    await AppShell.methods.reloadArticleListFromDatabase.call(context);

    expect(context.overviewStore.fetchOverview).toHaveBeenCalledWith({ forceUpdate: true });
    expect(articleFeed.fetchArticleIds)
      .toHaveBeenCalledWith(context.selectionStore.currentSelection);
    expect(articleFeed.refreshArticleIds).not.toHaveBeenCalled();
    expect(context.articleListReloadActive).toBe(false);
    expect(context.databaseRefreshActive).toBe(false);
  });

  it('shows a recoverable notice when a full article-list reload reports failure', async () => {
    const context = connectRecoveryMethods(createRecoveryContext());
    context.$refs.articleFeed = {
      fetchArticleIds: vi.fn().mockResolvedValue(false)
    };
    context.overviewStore.fetchOverview.mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await AppShell.methods.reloadArticleListFromDatabase.call(context);

    expect(console.error).toHaveBeenCalledWith(
      'Error reloading the article list from the database:',
      expect.any(Error)
    );
    expect(context.showActionError).toHaveBeenCalledWith(
      'Could not reload articles. Please try again.'
    );
    expect(context.articleListReloadActive).toBe(false);
  });

  it('scrolls article feeds to the top without reloading data after screen rotation', async () => {
    const context = createRecoveryContext();
    const firstArticleFeed = { scrollArticleListToTop: vi.fn() };
    const secondArticleFeed = { scrollArticleListToTop: vi.fn() };
    context.$refs.articleFeed = [firstArticleFeed, secondArticleFeed];
    context.$nextTick = vi.fn().mockResolvedValue();
    context.reloadArticleListFromDatabase = vi.fn();

    await AppShell.methods.handleOrientationChange.call(context);

    expect(firstArticleFeed.scrollArticleListToTop).toHaveBeenCalledOnce();
    expect(secondArticleFeed.scrollArticleListToTop).toHaveBeenCalledOnce();
    expect(context.reloadArticleListFromDatabase).not.toHaveBeenCalled();
    expect(context.overviewStore.fetchOverview).not.toHaveBeenCalled();
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
});
