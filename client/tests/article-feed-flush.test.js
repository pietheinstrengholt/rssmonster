import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { markAllAsRead } from '../src/api/articles.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchArticleIds: vi.fn(),
  fetchArticleDetails: vi.fn(),
  markAllAsRead: vi.fn(),
  markArticlesAsRead: vi.fn(),
  markArticleUnread: vi.fn(),
  markArticleSeen: vi.fn(),
  markAsFavorite: vi.fn(),
  markManyClicked: vi.fn(),
  markManyAsFavorite: vi.fn()
}));

beforeEach(() => {
  markAllAsRead.mockReset();
  markAllAsRead.mockResolvedValue({ data: { updatedCount: 3 } });
});

describe('ArticleFeed final read reconciliation', () => {
  // Verifies Briefing end-state totals exclude read and expanded related articles.
  it('counts only unread articles from the Briefing collection snapshot', () => {
    const context = {
      ...createFocusedStores({
        selection: {
          currentSelection: { status: 'briefing' }
        }
      }),
      container: [101, '102', 103],
      articles: [
        { id: '101', status: 'unread' },
        { id: 102, status: 'read' },
        { id: 103, status: 'unread' },
        { id: 104, status: 'unread', clusterParentId: 103 }
      ]
    };

    expect(ArticleFeed.computed.currentViewUnreadCount.call(context)).toBe(2);
  });

  it('marks the live selection instead of the stale container snapshot', async () => {
    const fetchOverviewSplit = vi.fn().mockResolvedValue();
    const currentSelection = {
      status: 'unread',
      categoryId: '%',
      feedId: '%',
      grouping: 'event',
      sort: 'desc'
    };
    const context = {
      ...createFocusedStores({
        overview: { fetchOverviewSplit },
        selection: {
          currentSelection
        }
      }),
      container: [101, 102, 103, 103],
      pool: new Set([101, 102]),
      articles: [
        { id: 101, status: 'read' },
        { id: 102, status: 'unread' },
        { id: 103, status: 'unread' }
      ],
      isFlushed: false,
      activeRequestId: 4,
      refreshArticleIds: vi.fn().mockResolvedValue(true)
    };
    const activeSelection = { ...context.selectionStore.currentSelection };

    await ArticleFeed.methods.flushPool.call(context);

    expect(markAllAsRead).toHaveBeenCalledWith(
      activeSelection,
      [101, 102, 103]
    );
    expect(context.articles.map(article => article.status)).toEqual([
      'read',
      'read',
      'read'
    ]);
    expect(context.isFlushed).toBe(true);
    expect(fetchOverviewSplit).toHaveBeenCalledWith({ forceUpdate: true });
    expect(context.refreshArticleIds).toHaveBeenCalledWith(activeSelection);
    expect(markAllAsRead.mock.invocationCallOrder[0])
      .toBeLessThan(context.refreshArticleIds.mock.invocationCallOrder[0]);
  });

  it('preserves local state when full-container reconciliation fails', async () => {
    const error = new Error('Request failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchOverviewSplit = vi.fn();
    const context = {
      ...createFocusedStores({
        overview: { fetchOverviewSplit },
        selection: {
          currentSelection: { grouping: 'event' }
        }
      }),
      container: [201, 202],
      pool: new Set([201]),
      articles: [
        { id: 201, status: 'read' },
        { id: 202, status: 'unread' }
      ],
      isFlushed: false,
      activeRequestId: 4,
      refreshArticleIds: vi.fn()
    };
    markAllAsRead.mockRejectedValue(error);

    await ArticleFeed.methods.flushPool.call(context);

    expect(markAllAsRead).toHaveBeenCalledWith(
      context.selectionStore.currentSelection,
      [201, 202]
    );
    expect(context.articles.map(article => article.status)).toEqual(['read', 'unread']);
    expect(context.isFlushed).toBe(false);
    expect(fetchOverviewSplit).not.toHaveBeenCalled();
    expect(context.refreshArticleIds).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Error marking all articles as read:',
      error
    );

    consoleError.mockRestore();
  });

  it('does not replace a newer selection when the mark request finishes late', async () => {
    let finishMarking;
    markAllAsRead.mockReturnValueOnce(new Promise(resolve => {
      finishMarking = resolve;
    }));
    const fetchOverviewSplit = vi.fn().mockResolvedValue();
    const context = {
      ...createFocusedStores({
        overview: { fetchOverviewSplit },
        selection: {
          currentSelection: { status: 'unread', feedId: '1' }
        }
      }),
      container: [301],
      articles: [{ id: 301, status: 'unread' }],
      isFlushed: false,
      activeRequestId: 7,
      refreshArticleIds: vi.fn()
    };

    const flush = ArticleFeed.methods.flushPool.call(context);
    context.activeRequestId = 8;
    context.articles = [{ id: 401, status: 'unread' }];
    finishMarking({ data: { updatedCount: 1 } });
    await flush;

    expect(context.articles).toEqual([{ id: 401, status: 'unread' }]);
    expect(context.refreshArticleIds).not.toHaveBeenCalled();
    expect(fetchOverviewSplit).toHaveBeenCalledWith({ forceUpdate: true });
  });
});
