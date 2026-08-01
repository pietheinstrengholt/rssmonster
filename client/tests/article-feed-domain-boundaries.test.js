import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { articleFeedClusterInsertionMethods } from '../src/components/articles/feed/clusterInsertion.js';
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
