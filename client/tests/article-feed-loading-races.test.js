import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleFeed from '../src/components/ArticleFeed.vue';
import {
  fetchArticleDetails,
  fetchArticleIds
} from '../src/api/articles';

vi.mock('../src/api/articles', () => ({
  fetchArticleDetails: vi.fn(),
  fetchArticleIds: vi.fn(),
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
const createLoadingContext = () => {
  const context = {
    ...ArticleFeed.data(),
    fetchCount: 20,
    $nextTick: callback => callback(),
    $store: {
      data: {
        currentSelection: { status: 'unread', viewMode: 'full' },
        getSelectedSort: 'desc',
        increaseReadCount: vi.fn()
      }
    },
    observeArticles: vi.fn(),
    observeLoadMoreSentinel: vi.fn()
  };

  context.resetPool = () => ArticleFeed.methods.resetPool.call(context);
  context.getContent = requestId => ArticleFeed.methods.getContent.call(context, requestId);
  context.updateArticleStatusLocal = article =>
    ArticleFeed.methods.updateArticleStatusLocal.call(context, article);

  return context;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ArticleFeed loading races', () => {
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
    expect(context.$store.data.increaseReadCount).toHaveBeenCalledTimes(2);
  });
});
