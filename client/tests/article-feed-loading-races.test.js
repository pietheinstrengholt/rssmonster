import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import {
  fetchArticleDetails,
  fetchArticleIds,
  fetchNewerArticleCount,
  fetchArticlePage,
  markArticlesAsRead
} from '../src/api/articles';
import { useSelectionStore } from '../src/store/selection.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles', () => ({
  fetchArticleDetails: vi.fn(),
  fetchArticleIds: vi.fn(),
  fetchNewerArticleCount: vi.fn(),
  fetchArticlePage: vi.fn(),
  markAllAsRead: vi.fn(),
  markArticleSeen: vi.fn(),
  markArticleUnread: vi.fn(),
  markArticlesAsRead: vi.fn(),
  markAsFavorite: vi.fn(),
  markManyAsFavorite: vi.fn(),
  markManyClicked: vi.fn()
}));

// This function creates a promise whose completion order is controlled by the test.
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

// This function creates the component state needed by article loading methods.
const createLoadingContext = (dataStore = {
  currentSelection: { status: 'unread', viewMode: 'full', sort: 'desc' },
  increaseReadCount: vi.fn()
}) => {
  const stores = createFocusedStores({
    overview: {
      increaseReadCount: dataStore.increaseReadCount || vi.fn()
    },
    selection: {
      currentSelection: dataStore.currentSelection
    }
  });
  if (dataStore.$id === 'selection') {
    stores.selectionStore = dataStore;
  }
  const context = {
    ...stores,
    ...ArticleFeed.data(),
    fetchCount: 20,
    $nextTick: callback => callback ? callback() : Promise.resolve(),
    observeArticles: vi.fn(),
    observeLoadMoreSentinel: vi.fn()
  };

  context.resetVisibilityTracking = () => ArticleFeed.methods.resetVisibilityTracking.call(context);
  context.resetReadTracking = () => ArticleFeed.methods.resetReadTracking.call(context);
  context.resetPaginationState = () => ArticleFeed.methods.resetPaginationState.call(context);
  context.resetCollectionState = () => ArticleFeed.methods.resetCollectionState.call(context);
  context.getContent = requestId => ArticleFeed.methods.getContent.call(context, requestId);
  context.refreshArticleIds = data => ArticleFeed.methods.refreshArticleIds.call(context, data);
  context.retryPagination = () => ArticleFeed.methods.retryPagination.call(context);
  context.scrollArticleListToTop = vi.fn();
  context.updateArticleStatusLocal = article =>
    ArticleFeed.methods.updateArticleStatusLocal.call(context, article);

  return context;
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchArticlePage.mockImplementation((...args) => fetchArticleIds(...args));
});

describe('ArticleFeed loading races', () => {
  it('installs an initial cursor page without materializing the complete result manifest', async () => {
    fetchArticlePage.mockResolvedValueOnce({
      data: {
        paginationVersion: 1,
        totalCount: 42,
        sourceCount: 3,
        snapshot: { snapshotMaxArticleId: 900 },
        page: {
          itemIds: [9, 8],
          articles: [{ id: 9 }, { id: 8 }],
          hasMore: true,
          nextCursor: 'next-page'
        }
      }
    });
    const context = createLoadingContext();

    await ArticleFeed.methods.fetchArticleIds.call(context, context.selectionStore.currentSelection);

    expect(context.container).toEqual([9, 8]);
    expect(context.articles).toEqual([{ id: 9 }, { id: 8 }]);
    expect(context.totalCount).toBe(42);
    expect(context.hasMore).toBe(true);
    expect(context.nextCursor).toBe('next-page');
    expect(context.snapshotMaxArticleId).toBe(900);
    expect(fetchArticleDetails).not.toHaveBeenCalled();
  });

  it('appends and deduplicates a subsequent cursor page', async () => {
    fetchArticlePage.mockResolvedValueOnce({
      data: {
        paginationVersion: 1,
        totalCount: 3,
        sourceCount: 1,
        snapshot: { snapshotMaxArticleId: 20 },
        page: {
          itemIds: [2, 3],
          articles: [{ id: 2 }, { id: 3 }],
          hasMore: false,
          nextCursor: null
        }
      }
    });
    const context = createLoadingContext();
    context.container = [1, 2];
    context.articles = [{ id: 1 }, { id: 2 }];
    context.usesCursorPagination = true;
    context.hasMore = true;
    context.nextCursor = 'cursor-one';

    await context.getContent();

    expect(fetchArticlePage).toHaveBeenCalledWith(context.selectionStore.currentSelection, {
      pageSize: 20,
      cursor: 'cursor-one'
    });
    expect(context.container).toEqual([1, 2, 3]);
    expect(context.articles).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(context.hasMore).toBe(false);
  });

  it('finishes cleanly when a cursor page becomes empty after deletions', async () => {
    fetchArticlePage.mockResolvedValueOnce({
      data: {
        paginationVersion: 1,
        totalCount: 2,
        snapshot: { snapshotMaxArticleId: 20 },
        page: { itemIds: [], articles: [], hasMore: false, nextCursor: null }
      }
    });
    const context = createLoadingContext();
    context.usesCursorPagination = true;
    context.hasMore = true;
    context.nextCursor = 'cursor-after-delete';

    await context.getContent();

    expect(context.container).toEqual([]);
    expect(context.hasMore).toBe(false);
    expect(context.isLoading).toBe(false);
  });

  it('restarts the snapshot after a restartable continuation cursor failure', async () => {
    const expired = Object.assign(new Error('expired cursor'), {
      response: {
        status: 410,
        data: { error: { code: 'CURSOR_EXPIRED', restartRequired: true } }
      }
    });
    fetchArticlePage
      .mockRejectedValueOnce(expired)
      .mockResolvedValueOnce({
        data: {
          paginationVersion: 1,
          totalCount: 1,
          sourceCount: 1,
          snapshot: { snapshotMaxArticleId: 30 },
          page: {
            itemIds: [3],
            articles: [{ id: 3, title: 'Fresh snapshot' }],
            hasMore: false,
            nextCursor: null
          }
        }
      });
    const context = createLoadingContext();
    context.container = [1, 2];
    context.articles = [{ id: 1 }, { id: 2 }];
    context.usesCursorPagination = true;
    context.hasMore = true;
    context.nextCursor = 'expired-cursor';

    await context.getContent();

    expect(fetchArticlePage).toHaveBeenNthCalledWith(1, context.selectionStore.currentSelection, {
      pageSize: 20,
      cursor: 'expired-cursor'
    });
    expect(fetchArticlePage).toHaveBeenNthCalledWith(2, context.selectionStore.currentSelection, {
      pageSize: 20
    });
    expect(context.container).toEqual([3]);
    expect(context.articles).toEqual([{ id: 3, title: 'Fresh snapshot' }]);
    expect(context.nextCursor).toBeNull();
    expect(context.hasMore).toBe(false);
    expect(context.paginationError).toBeNull();
  });

  it('stops sentinel retries and exposes a manual retry after a continuation failure', async () => {
    const failure = new Error('temporary cursor failure');
    fetchArticlePage
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({
        data: {
          paginationVersion: 1,
          totalCount: 1,
          snapshot: { snapshotMaxArticleId: 40 },
          page: {
            itemIds: [4],
            articles: [{ id: 4 }],
            hasMore: false,
            nextCursor: null
          }
        }
      });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = createLoadingContext();
    context.usesCursorPagination = true;
    context.hasMore = true;
    context.nextCursor = 'failed-cursor';
    context.hasLoadedContent = true;

    await context.getContent();
    ArticleFeed.methods.handleLoadMoreIntersections.call(context, [{ isIntersecting: true }]);

    expect(fetchArticlePage).toHaveBeenCalledOnce();
    expect(context.hasMore).toBe(false);
    expect(context.nextCursor).toBeNull();
    expect(context.paginationError).toBe('Could not load more articles.');

    await context.retryPagination();

    expect(fetchArticlePage).toHaveBeenCalledTimes(2);
    expect(context.container).toEqual([4]);
    expect(context.paginationError).toBeNull();
  });

  it('shows newer articles only when the active selection has matches after the snapshot', async () => {
    fetchNewerArticleCount
      .mockResolvedValueOnce({ data: { newerArticleCount: 0 } })
      .mockResolvedValueOnce({ data: { newerArticleCount: 2 } });
    const context = createLoadingContext();
    context.snapshotMaxArticleId = 100;
    context.overviewStore.unreadsSinceLastUpdate = 3;

    await ArticleFeed.methods.checkForNewerArticles.call(context);

    expect(fetchNewerArticleCount).toHaveBeenCalledWith(
      context.selectionStore.currentSelection,
      100
    );
    expect(context.newerArticlesAvailable).toBe(false);
    expect(context.newerArticleCount).toBe(0);

    await ArticleFeed.methods.checkForNewerArticles.call(context);

    expect(context.newerArticlesAvailable).toBe(true);
    expect(context.newerArticleCount).toBe(2);
  });

  it('preserves rendered articles until a database refresh can replace them atomically', async () => {
    const refreshRequest = deferred();
    fetchArticleIds.mockReturnValueOnce(refreshRequest.promise);
    const context = createLoadingContext();
    context.container = [1];
    context.articles = [{ id: 1, title: 'Existing article' }];
    context.hasLoadedContent = true;

    const refresh = ArticleFeed.methods.refreshArticleIds.call(
      context,
      context.selectionStore.currentSelection
    );

    expect(context.articles).toEqual([{ id: 1, title: 'Existing article' }]);
    expect(context.hasLoadedContent).toBe(true);

    refreshRequest.resolve({
      data: {
        itemIds: [2],
        firstPage: [{ id: 2, title: 'New article' }],
        sourceCount: 1
      }
    });
    await refresh;

    expect(context.container).toEqual([2]);
    expect(context.articles).toEqual([{ id: 2, title: 'New article' }]);
    expect(context.currentViewSourceCount).toBe(1);
    expect(context.distance).toBe(1);
    expect(context.hasLoadedContent).toBe(true);
    expect(context.scrollArticleListToTop).toHaveBeenCalledOnce();
  });

  it('refreshes a legacy collection without enumerating the component instance', async () => {
    fetchArticleIds.mockResolvedValueOnce({
      data: {
        itemIds: [2, 3],
        sourceCount: 1
      }
    });
    fetchArticleDetails.mockResolvedValueOnce({
      data: [{ id: 2, title: 'Fetched legacy article' }]
    });
    const context = createLoadingContext();
    const componentInstance = new Proxy(context, {
      ownKeys: () => {
        throw new Error('component instance keys must not be enumerated');
      }
    });

    await ArticleFeed.methods.refreshArticleIds.call(
      componentInstance,
      context.selectionStore.currentSelection
    );

    expect(fetchArticleDetails).toHaveBeenCalledWith([2, 3], 'desc');
    expect(context.container).toEqual([2]);
    expect(context.articles).toEqual([{ id: 2, title: 'Fetched legacy article' }]);
    expect(context.legacyItemIds).toEqual([2, 3]);
    expect(context.distance).toBe(2);
    expect(context.hasMore).toBe(false);
  });

  it('keeps existing articles and reports a current database refresh failure', async () => {
    const failure = new Error('refresh unavailable');
    fetchArticleIds.mockRejectedValueOnce(failure);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = createLoadingContext();
    context.container = [1];
    context.articles = [{ id: 1, title: 'Existing article' }];
    context.hasLoadedContent = true;

    await expect(ArticleFeed.methods.refreshArticleIds.call(
      context,
      context.selectionStore.currentSelection
    )).rejects.toBe(failure);

    expect(context.container).toEqual([1]);
    expect(context.articles).toEqual([{ id: 1, title: 'Existing article' }]);
    expect(context.hasLoadedContent).toBe(true);
    expect(context.isLoading).toBe(false);
  });

  it('does not let a stale database refresh replace a newer selection', async () => {
    const refreshRequest = deferred();
    fetchArticleIds
      .mockReturnValueOnce(refreshRequest.promise)
      .mockResolvedValueOnce({
        data: {
          itemIds: [2],
          firstPage: [{ id: 2, title: 'New selection' }]
        }
      });
    const context = createLoadingContext();
    context.container = [1];
    context.articles = [{ id: 1, title: 'Existing article' }];

    const refresh = ArticleFeed.methods.refreshArticleIds.call(context, { feedId: '1', sort: 'desc' });
    await ArticleFeed.methods.fetchArticleIds.call(context, { feedId: '2', sort: 'desc' });
    refreshRequest.resolve({
      data: {
        itemIds: [3],
        firstPage: [{ id: 3, title: 'Stale refresh' }]
      }
    });
    await refresh;

    expect(context.container).toEqual([2]);
    expect(context.articles).toEqual([{ id: 2, title: 'New selection' }]);
  });

  it('keeps only the newest article ID response after rapid selection changes', async () => {
    const olderRequest = deferred();
    const newerRequest = deferred();
    fetchArticleIds
      .mockReturnValueOnce(olderRequest.promise)
      .mockReturnValueOnce(newerRequest.promise);
    const context = createLoadingContext();

    const olderLoad = ArticleFeed.methods.fetchArticleIds.call(context, { feedId: '1' });
    const newerLoad = ArticleFeed.methods.fetchArticleIds.call(context, { feedId: '2' });

    newerRequest.resolve({
      data: {
        itemIds: [202],
        firstPage: [{ id: 202, title: 'New selection' }],
        sourceCount: 1
      }
    });
    await newerLoad;
    olderRequest.resolve({
      data: {
        itemIds: [101],
        firstPage: [{ id: 101, title: 'Stale selection' }],
        sourceCount: 9
      }
    });
    await olderLoad;

    expect(context.container).toEqual([202]);
    expect(context.articles).toEqual([{ id: 202, title: 'New selection' }]);
    expect(context.currentViewSourceCount).toBe(1);
    expect(context.isLoading).toBe(false);
  });

  it('resets remaining pool state for a full reload without marking articles as read', async () => {
    fetchArticleIds.mockResolvedValueOnce({
      data: {
        itemIds: [2, 3],
        firstPage: [{ id: 2, title: 'Still unread' }]
      }
    });
    const context = createLoadingContext();
    context.container = [1, 2, 3];
    context.articles = [{ id: 1 }, { id: 2 }];
    context.pool = new Set([1]);

    await ArticleFeed.methods.fetchArticleIds.call(
      context,
      context.selectionStore.currentSelection
    );

    expect(context.container).toEqual([2]);
    expect(context.legacyItemIds).toEqual([2, 3]);
    expect(context.pool).toEqual(new Set());
    expect(context.scrollArticleListToTop).toHaveBeenCalledTimes(2);
    expect(markArticlesAsRead).not.toHaveBeenCalled();
  });

  it('resets both article-pane and page scroll roots for a rebuilt collection', () => {
    const articlePane = document.createElement('main');
    const scrollToTop = vi.fn();
    articlePane.scrollTop = 240;
    document.documentElement.scrollTop = 240;
    document.body.scrollTop = 240;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const context = {
      $refs: { articleLayout: { scrollToTop } },
      scrollContainer: articlePane,
      scrollResetFrameId: null,
      scrollResetTimeoutId: null
    };
    ArticleFeed.methods.scrollArticleListToTop.call(context);

    expect(scrollToTop).toHaveBeenCalledOnce();
    expect(articlePane.scrollTop).toBe(0);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });

    window.cancelAnimationFrame(context.scrollResetFrameId);
    window.clearTimeout(context.scrollResetTimeoutId);
    scrollTo.mockRestore();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('resets the browser scroll surface when window scrollY is already zero', () => {
    document.documentElement.scrollTop = 12;
    document.body.scrollTop = 12;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const context = {
      $refs: {},
      scrollContainer: null,
      scrollResetFrameId: null,
      scrollResetTimeoutId: null
    };
    ArticleFeed.methods.scrollArticleListToTop.call(context);

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });

    window.cancelAnimationFrame(context.scrollResetFrameId);
    window.clearTimeout(context.scrollResetTimeoutId);
    scrollTo.mockRestore();
  });

  it('reapplies the scroll reset after browser layout frames settle', () => {
    const frames = [];
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        frames.push(callback);
        return frames.length;
      });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const context = {
      $refs: {},
      scrollContainer: null,
      scrollResetFrameId: null,
      scrollResetTimeoutId: null
    };

    ArticleFeed.methods.scrollArticleListToTop.call(context);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    document.documentElement.scrollTop = 9;
    frames.shift()();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledTimes(2);

    document.documentElement.scrollTop = 5;
    frames.shift()();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(context.scrollResetFrameId).toBeNull();

    requestAnimationFrame.mockRestore();
    window.clearTimeout(context.scrollResetTimeoutId);
    scrollTo.mockRestore();
  });

  it('reapplies the scroll reset after the iOS viewport settles', () => {
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const context = {
      $refs: {},
      scrollContainer: null,
      scrollResetFrameId: null,
      scrollResetTimeoutId: null
    };

    ArticleFeed.methods.scrollArticleListToTop.call(context);
    document.documentElement.scrollTop = 11;
    vi.advanceTimersByTime(250);

    expect(document.documentElement.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledTimes(4);
    expect(context.scrollResetTimeoutId).toBeNull();

    window.cancelAnimationFrame(context.scrollResetFrameId);
    scrollTo.mockRestore();
    vi.useRealTimers();
  });

  it('does not append stale detail responses after the selection changes', async () => {
    const staleDetails = deferred();
    fetchArticleIds
      .mockResolvedValueOnce({ data: { itemIds: [101] } })
      .mockResolvedValueOnce({
        data: {
          itemIds: [202],
          firstPage: [{ id: 202, title: 'Current article' }]
        }
      });
    fetchArticleDetails.mockReturnValueOnce(staleDetails.promise);
    const context = createLoadingContext();

    const staleLoad = ArticleFeed.methods.fetchArticleIds.call(context, { feedId: '1' });
    await vi.waitFor(() => expect(fetchArticleDetails).toHaveBeenCalledOnce());

    await ArticleFeed.methods.fetchArticleIds.call(context, { feedId: '2' });
    staleDetails.resolve({ data: [{ id: 101, title: 'Stale article' }] });
    await staleLoad;

    expect(context.container).toEqual([202]);
    expect(context.articles).toEqual([{ id: 202, title: 'Current article' }]);
    expect(context.distance).toBe(1);
  });

  it('finishes loading when an ID response needs a separate empty detail page', async () => {
    fetchArticleIds.mockResolvedValueOnce({ data: { itemIds: [1, 2] } });
    fetchArticleDetails.mockResolvedValueOnce({ data: [] });
    const context = createLoadingContext();

    await ArticleFeed.methods.fetchArticleIds.call(context, { categoryId: '%' });

    expect(fetchArticleDetails).toHaveBeenCalledWith([1, 2], 'desc');
    expect(context.distance).toBe(2);
    expect(context.hasLoadedContent).toBe(true);
    expect(context.isLoading).toBe(false);
  });

  // This test exercises the article-detail contract through a real Pinia data store.
  it('requests article details with the normalized sort from the real data store', async () => {
    setActivePinia(createPinia());
    const selectionStore = useSelectionStore();
    selectionStore.setCurrentSelection({ sort: 'TrUsT' });
    fetchArticleDetails.mockResolvedValueOnce({ data: [] });
    const context = createLoadingContext(selectionStore);
    context.legacyItemIds = [7];
    context.hasMore = true;

    await context.getContent();

    expect(selectionStore.currentSelection.sort).toBe('trust');
    expect(fetchArticleDetails).toHaveBeenCalledWith([7], 'trust');
  });

  it('loads another page only when the sentinel intersects and loading is ready', () => {
    const context = createLoadingContext();
    context.container = [1, 2];
    context.distance = 1;
    context.hasMore = true;
    context.hasLoadedContent = true;
    context.getContent = vi.fn();

    ArticleFeed.methods.handleLoadMoreIntersections.call(context, [{ isIntersecting: false }]);
    context.isLoading = true;
    ArticleFeed.methods.handleLoadMoreIntersections.call(context, [{ isIntersecting: true }]);
    context.isLoading = false;
    context.hasLoadedContent = false;
    ArticleFeed.methods.handleLoadMoreIntersections.call(context, [{ isIntersecting: true }]);
    context.hasLoadedContent = true;
    ArticleFeed.methods.handleLoadMoreIntersections.call(context, [{ isIntersecting: true }]);

    expect(context.getContent).toHaveBeenCalledOnce();
  });

  it('releases the loading guard after a detail failure so pagination can retry', async () => {
    const failure = new Error('temporary detail failure');
    fetchArticleDetails
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ data: [{ id: 1, title: 'Recovered article' }] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = createLoadingContext();
    context.legacyItemIds = [1];
    context.hasMore = true;

    await context.getContent();

    expect(context.isLoading).toBe(false);
    expect(context.distance).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      'Error fetching article details:',
      failure
    );

    await context.getContent();

    expect(context.articles).toEqual([{ id: 1, title: 'Recovered article' }]);
    expect(context.distance).toBe(1);
    expect(context.isLoading).toBe(false);
  });

  it('loads a recommendation through article details and selects it in the existing Reader', async () => {
    fetchArticleDetails.mockResolvedValueOnce({
      data: [{ id: 9, title: 'Recommended article' }]
    });
    const selectArticle = vi.fn();
    const context = createLoadingContext();
    context.isReaderLayoutActive = true;
    context.$refs = { articleLayout: { selectArticle } };
    context.loadReaderRecommendationArticle = articleId => (
      ArticleFeed.methods.loadReaderRecommendationArticle.call(context, articleId)
    );

    await ArticleFeed.methods.openReaderRecommendation.call(context, 9);

    expect(fetchArticleDetails).toHaveBeenCalledWith([9], 'desc');
    expect(context.articles).toEqual([{
      id: 9,
      title: 'Recommended article',
      readerRecommendationInd: true
    }]);
    expect(selectArticle).toHaveBeenCalledWith(9);
  });

  it('reconciles every article returned as read by the server', async () => {
    const context = createLoadingContext();
    context.articles = [
      { id: 1, status: 'unread' },
      { id: 2, status: 'unread' }
    ];

    ArticleFeed.methods.applyArticleSeenResponse.call(context, {
      id: 1,
      status: 'read',
      readArticles: [
        { id: 1, status: 'read' },
        { id: 2, status: 'read' }
      ]
    }, { updateReadCounts: true });
    await flushPromises();

    expect(context.articles.map(article => article.status)).toEqual(['read', 'read']);
    expect(context.overviewStore.increaseReadCount).toHaveBeenCalledTimes(2);
  });
});
