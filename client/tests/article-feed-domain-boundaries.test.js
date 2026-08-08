import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import {
  articleFeedClusterInsertionMethods,
  insertClusterArticlesIntoCollection,
  insertDuplicateArticlesIntoCollection
} from '../src/components/articles/feed/clusterInsertion.js';
import { articleFeedVisibilityMethods } from '../src/components/articles/feed/visibilityTracking.js';
import { createFocusedStores } from './helpers/focusedStores.js';

// Creates the minimal feed state used by cluster insertion methods.
const createClusterContext = articles => ({
  articles,
  removeClusterArticles(payload) {
    return articleFeedClusterInsertionMethods.removeClusterArticles.call(this, payload);
  },
  removeDuplicateArticles(payload) {
    return articleFeedClusterInsertionMethods.removeDuplicateArticles.call(this, payload);
  }
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('ArticleFeed cluster insertion', () => {
  it('transforms cluster collections through explicit inputs without mutating the source array', () => {
    const articles = [
      { id: 2, title: 'Existing title', status: 'read' },
      { id: 1, title: 'Parent' },
      { id: 3, title: 'Following article' }
    ];

    const result = insertClusterArticlesIntoCollection(articles, {
      articleId: 1,
      articles: [
        { id: 1, title: 'Parent' },
        { id: 2, title: 'Server title' },
        { id: 4, title: 'New related article' }
      ]
    });

    expect(result.map(article => article.id)).toEqual([1, 2, 4, 3]);
    expect(result[1]).toMatchObject({
      title: 'Server title',
      status: 'read',
      clusterParentId: 1
    });
    expect(articles.map(article => article.id)).toEqual([2, 1, 3]);
  });

  it('reports an explicit missing-parent error while returning the remaining collection', () => {
    const reportError = vi.fn();

    const result = insertDuplicateArticlesIntoCollection(
      [{ id: 2, duplicateParentId: 9 }, { id: 3 }],
      { articleId: 9, articles: [{ id: 4 }] },
      reportError
    );

    expect(result).toEqual([{ id: 3 }]);
    expect(reportError).toHaveBeenCalledWith('Could not find canonical article in articles list');
  });

  it('re-homes existing related articles after their parent in server order', () => {
    const parent = { id: 1, title: 'Parent' };
    const existingRelated = { id: 2, title: 'Existing title', status: 'read' };
    const context = createClusterContext([
      existingRelated,
      parent,
      { id: 3, title: 'Following article' }
    ]);

    articleFeedClusterInsertionMethods.insertClusterArticles.call(context, {
      articleId: 1,
      articles: [
        parent,
        { id: 2, title: 'Server title' },
        { id: 4, title: 'New related article' }
      ]
    });

    expect(context.articles.map(article => article.id)).toEqual([1, 2, 4, 3]);
    expect(context.articles[1]).toMatchObject({
      id: 2,
      title: 'Server title',
      status: 'read',
      isEventArticle: true,
      clusterParentId: 1
    });
  });

  it('replaces only duplicate children belonging to the expanded parent', () => {
    const context = createClusterContext([
      { id: 1, title: 'Canonical' },
      { id: 8, duplicateParentId: 1 },
      { id: 9, duplicateParentId: 2 },
      { id: 3, title: 'Following article' }
    ]);

    articleFeedClusterInsertionMethods.insertDuplicateArticles.call(context, {
      articleId: 1,
      articles: [{ id: 10, title: 'Replacement duplicate' }]
    });

    expect(context.articles.map(article => article.id)).toEqual([1, 10, 9, 3]);
    expect(context.articles[1]).toMatchObject({
      isEventArticle: true,
      duplicateParentId: 1
    });
  });
});

describe('ArticleFeed visibility tracking', () => {
  it('accumulates visible intervals before marking a passed article seen', async () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2500);
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: { viewMode: 'full' }
        }
      }),
      pool: new Set(),
      pendingSeenArticleIds: new Set(),
      seenPersistenceAttempts: new Map(),
      getReadingViewportTop: () => 0,
      visibleMap: new Map(),
      visibleSince: new Map(),
      visibleDuration: new Map(),
      markArticleSeen: vi.fn().mockResolvedValue(true)
    };
    context.finalizeVisibleDuration = articleId =>
      articleFeedVisibilityMethods.finalizeVisibleDuration.call(context, articleId);
    context.addToPool = articleId =>
      articleFeedVisibilityMethods.addToPool.call(context, articleId);

    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: true,
      boundingClientRect: { bottom: 100 }
    }]);
    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: false,
      boundingClientRect: { bottom: -1 }
    }]);
    await Promise.resolve();

    expect(context.visibleDuration.get(7)).toBe(1500);
    expect(context.pool).toEqual(new Set([7]));
    expect(context.markArticleSeen).toHaveBeenCalledWith(7, 2);
  });

  it('marks articles passed above the inset full-view scroll container', () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: {
            status: 'unread',
            markAsReadOnScroll: true
          }
        }
      }),
      getReadingViewportTop: () => 58,
      visibleMap: new Map([[7, true]]),
      visibleSince: new Map([[7, 1000]]),
      finalizeVisibleDuration: vi.fn(),
      addToPool: vi.fn()
    };

    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: false,
      boundingClientRect: { bottom: 58 }
    }]);

    expect(context.addToPool).toHaveBeenCalledWith(7);
  });

  it('uses the browser viewport when the full-view wrapper does not scroll on mobile', () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: {
            status: 'unread',
            markAsReadOnScroll: true
          }
        }
      }),
      getReadingViewportTop: () => 0,
      visibleMap: new Map([[7, true]]),
      visibleSince: new Map([[7, 1000]]),
      finalizeVisibleDuration: vi.fn(),
      addToPool: vi.fn()
    };

    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: false,
      boundingClientRect: { bottom: -1 }
    }]);

    expect(context.addToPool).toHaveBeenCalledWith(7);
  });

  it('keeps passed unread articles unread when automatic scrolling transitions are disabled', () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: {
            status: 'unread',
            markAsReadOnScroll: false
          }
        }
      }),
      getReadingViewportTop: () => 0,
      visibleMap: new Map([[7, true]]),
      visibleSince: new Map([[7, 1000]]),
      finalizeVisibleDuration: vi.fn(),
      addToPool: vi.fn()
    };

    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: false,
      boundingClientRect: { bottom: -1 }
    }]);

    expect(context.finalizeVisibleDuration).toHaveBeenCalledWith(7);
    expect(context.addToPool).not.toHaveBeenCalled();
  });

  it('uses the briefing-specific scrolling preference for briefing articles', () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: {
            status: 'briefing',
            markAsReadOnScroll: true
          },
          briefingMarkAsReadOnScroll: false
        }
      }),
      getReadingViewportTop: () => 0,
      visibleMap: new Map([[7, true]]),
      visibleSince: new Map([[7, 1000]]),
      finalizeVisibleDuration: vi.fn(),
      addToPool: vi.fn()
    };

    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: false,
      boundingClientRect: { bottom: -1 }
    }]);

    expect(context.finalizeVisibleDuration).toHaveBeenCalledWith(7);
    expect(context.addToPool).not.toHaveBeenCalled();
  });

  it('continues seen tracking outside unread selections when scrolling transitions are disabled', () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: {
            status: 'favorite',
            markAsReadOnScroll: false
          }
        }
      }),
      getReadingViewportTop: () => 0,
      visibleMap: new Map([[7, false]]),
      visibleSince: new Map(),
      finalizeVisibleDuration: vi.fn(),
      addToPool: vi.fn()
    };

    articleFeedVisibilityMethods.handleArticleIntersections.call(context, [{
      target: { id: 'article-7' },
      isIntersecting: false,
      boundingClientRect: { bottom: -1 }
    }]);

    expect(context.addToPool).toHaveBeenCalledWith(7);
  });

  it('does not persist seen state when a minimal article passes the viewport', async () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: { viewMode: 'minimal' }
        }
      }),
      pool: new Set(),
      pendingSeenArticleIds: new Set(),
      seenPersistenceAttempts: new Map(),
      visibleSince: new Map(),
      visibleDuration: new Map(),
      finalizeVisibleDuration: vi.fn(),
      markArticleSeen: vi.fn()
    };

    await articleFeedVisibilityMethods.addToPool.call(context, 12);

    expect(context.pool).toEqual(new Set([12]));
    expect(context.markArticleSeen).not.toHaveBeenCalled();
  });

  it('keeps the extracted methods on the ArticleFeed Options API surface', () => {
    expect(ArticleFeed.methods.handleArticleIntersections)
      .toBe(articleFeedVisibilityMethods.handleArticleIntersections);
    expect(ArticleFeed.methods.insertClusterArticles)
      .toBe(articleFeedClusterInsertionMethods.insertClusterArticles);
  });
});
