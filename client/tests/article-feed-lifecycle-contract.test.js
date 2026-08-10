import { describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import {
  articleFeedPaginationMethods,
  createArticleFeedPaginationState
} from '../src/components/articles/feed/pagination.js';
import {
  articleFeedReadStateMethods,
  createArticleFeedReadState
} from '../src/components/articles/feed/readState.js';
import {
  articleFeedVisibilityMethods,
  createArticleFeedVisibilityState
} from '../src/components/articles/feed/visibilityTracking.js';

describe('ArticleFeed collection lifecycle contract', () => {
  // Verifies shell listeners remain component events instead of falling through the fragment root.
  it('declares its shell event contract', () => {
    expect(ArticleFeed.emits).toEqual([
      'forceReload',
      'mobile-toolbar-visibility',
      'refresh-feeds'
    ]);
  });

  // Verifies layouts receive deliberate presentation models instead of raw pagination internals.
  it('keeps Reader and stream layout props small and responsibility-based', () => {
    expect(Object.keys(ArticleReaderLayout.props)).toEqual([
      'articles',
      'container',
      'collectionSummary',
      'collectionProgress'
    ]);
    expect(Object.keys(ArticleListView.props)).toEqual([
      'scrollRoot',
      'articles',
      'container',
      'collectionSummary',
      'collectionProgress',
      'viewMode',
      'activeMinimalArticleId'
    ]);

    for (const removedProp of [
      'pool',
      'remainingItems',
      'fetchCount',
      'distance',
      'hasLoadedContent',
      'isFlushed'
    ]) {
      expect(ArticleListView.props).not.toHaveProperty(removedProp);
      expect(ArticleReaderLayout.props).not.toHaveProperty(removedProp);
    }
  });

  // Verifies pagination reset no longer reaches into visibility or read-tracking state.
  it('resets only pagination-owned state', () => {
    const context = {
      ...createArticleFeedPaginationState(),
      pool: new Set([1]),
      visibleMap: new Map([[1, true]])
    };
    context.articles = [{ id: 1 }];
    context.container = [1];
    context.distance = 1;
    context.currentViewSourceCount = 4;
    context.activeRequestId = 7;

    articleFeedPaginationMethods.resetPaginationState.call(context);

    expect(context).toMatchObject({
      activeRequestId: 7,
      articles: [],
      container: [],
      currentViewSourceCount: null,
      distance: 0
    });
    expect(context.pool).toEqual(new Set([1]));
    expect(context.visibleMap).toEqual(new Map([[1, true]]));
  });

  // Verifies visibility reset owns observer cleanup without changing pagination or read state.
  it('clears only visibility observations and timing state', () => {
    const firstElement = document.createElement('article');
    const secondElement = document.createElement('article');
    const visibilityObserver = {
      takeRecords: vi.fn(),
      unobserve: vi.fn()
    };
    const context = {
      ...createArticleFeedVisibilityState(),
      articles: [{ id: 1 }],
      pool: new Set([1]),
      visibilityObserver
    };
    context.observedArticleElements.set('1', firstElement);
    context.observedArticleElements.set('2', secondElement);
    context.visibleMap.set(1, true);
    context.visibleSince.set(1, 100);
    context.visibleDuration.set(1, 200);

    articleFeedVisibilityMethods.resetVisibilityTracking.call(context);

    expect(visibilityObserver.takeRecords).toHaveBeenCalledOnce();
    expect(visibilityObserver.unobserve).toHaveBeenCalledWith(firstElement);
    expect(visibilityObserver.unobserve).toHaveBeenCalledWith(secondElement);
    expect(context.observedArticleElements.size).toBe(0);
    expect(context.visibleMap.size).toBe(0);
    expect(context.visibleSince.size).toBe(0);
    expect(context.visibleDuration.size).toBe(0);
    expect(context.articles).toEqual([{ id: 1 }]);
    expect(context.pool).toEqual(new Set([1]));
  });

  // Verifies read reset owns pending operations and leaves pagination and visibility untouched.
  it('clears only read-tracking state', () => {
    const context = {
      ...createArticleFeedReadState(),
      articles: [{ id: 1 }],
      visibleMap: new Map([[1, true]])
    };
    context.pool.add(1);
    context.activeMinimalArticleId = 1;
    context.pendingReadStatusArticleIds.add(1);
    context.pendingSeenArticleIds.add(1);
    context.seenPersistenceAttempts.set(1, 2);
    context.isFlushed = true;

    articleFeedReadStateMethods.resetReadTracking.call(context);

    expect(context.pool).toEqual(new Set());
    expect(context.activeMinimalArticleId).toBeNull();
    expect(context.pendingReadStatusArticleIds.size).toBe(0);
    expect(context.pendingSeenArticleIds.size).toBe(0);
    expect(context.seenPersistenceAttempts.size).toBe(0);
    expect(context.isFlushed).toBe(false);
    expect(context.articles).toEqual([{ id: 1 }]);
    expect(context.visibleMap).toEqual(new Map([[1, true]]));
  });

  // Verifies ArticleFeed explicitly coordinates every owner-specific reset operation.
  it('orchestrates visibility, read tracking, and pagination resets', () => {
    const context = {
      resetVisibilityTracking: vi.fn(),
      resetReadTracking: vi.fn(),
      resetPaginationState: vi.fn()
    };

    ArticleFeed.methods.resetCollectionState.call(context);

    expect(context.resetVisibilityTracking).toHaveBeenCalledOnce();
    expect(context.resetReadTracking).toHaveBeenCalledOnce();
    expect(context.resetPaginationState).toHaveBeenCalledOnce();
  });

  // Verifies observer DOM access is delegated to the currently active article layout.
  it('delegates article, sentinel, and viewport access through the layout contract', () => {
    const articleElement = document.createElement('article');
    const sentinel = document.createElement('div');
    const articleLayout = {
      getArticleElement: vi.fn().mockReturnValue(articleElement),
      getLoadMoreSentinel: vi.fn().mockReturnValue(sentinel),
      getReadingViewportTop: vi.fn().mockReturnValue(58)
    };
    const context = { $refs: { articleLayout } };

    expect(ArticleFeed.methods.getArticleElement.call(context, 4)).toBe(articleElement);
    expect(ArticleFeed.methods.getLoadMoreSentinel.call(context)).toBe(sentinel);
    expect(ArticleFeed.methods.getReadingViewportTop.call(context)).toBe(58);
    expect(articleLayout.getArticleElement).toHaveBeenCalledWith(4);
  });

  // Verifies visibility observers consume the explicit layout element contract.
  it('observes articles and the load sentinel supplied by the layout', () => {
    const articleElement = document.createElement('article');
    const sentinel = document.createElement('div');
    const visibilityObserver = { observe: vi.fn(), unobserve: vi.fn() };
    const loadMoreObserver = { disconnect: vi.fn(), observe: vi.fn() };
    const context = {
      ...createArticleFeedVisibilityState(),
      articles: [{ id: 9 }],
      getArticleElement: vi.fn().mockReturnValue(articleElement),
      getLoadMoreSentinel: vi.fn().mockReturnValue(sentinel),
      visibilityObserver,
      loadMoreObserver
    };

    articleFeedVisibilityMethods.observeArticles.call(context);
    articleFeedVisibilityMethods.observeLoadMoreSentinel.call(context);

    expect(context.getArticleElement).toHaveBeenCalledWith(9);
    expect(visibilityObserver.observe).toHaveBeenCalledWith(articleElement);
    expect(loadMoreObserver.disconnect).toHaveBeenCalledOnce();
    expect(loadMoreObserver.observe).toHaveBeenCalledWith(sentinel);
  });
});
