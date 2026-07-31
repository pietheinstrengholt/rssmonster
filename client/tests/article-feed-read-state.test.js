import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  articleFeedReadStateMethods,
  createArticleFeedReadState
} from '../src/components/articleFeed/readState.js';
import {
  markArticlesAsRead,
  markArticleSeen,
  markArticleUnread
} from '../src/api/articles.js';
import { notifyActionError } from '../src/services/actionNotifications.js';

vi.mock('../src/api/articles.js', () => ({
  markArticlesAsRead: vi.fn(),
  markArticleSeen: vi.fn(),
  markArticleUnread: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// Creates a complete read-state context with observable store reconciliation.
const createContext = (overrides = {}) => ({
  ...createArticleFeedReadState(),
  articles: [
    {
      id: 1,
      status: 'unread',
      publishedAt: '2026-07-03T00:00:00Z',
      feedId: 10,
      feed: { categoryId: 100 }
    },
    {
      id: 2,
      status: 'read',
      publishedAt: '2026-07-02T00:00:00Z',
      feedId: 10,
      feed: { categoryId: 100 }
    },
    {
      id: 3,
      status: 'unread',
      publishedAt: '2026-07-01T00:00:00Z',
      feedId: 11,
      feed: { categoryId: 100 }
    }
  ],
  container: [1, 2, 3],
  addToPool: vi.fn(),
  $store: {
    data: {
      currentSelection: {
        viewMode: 'full',
        grouping: 'event',
        status: 'unread'
      },
      increaseReadCount: vi.fn(),
      decreaseReadCount: vi.fn(),
      fetchOverviewSplit: vi.fn().mockResolvedValue()
    }
  },
  ...articleFeedReadStateMethods,
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('article feed read-state reconciliation', () => {
  // Verifies reader navigation pools only a previous unread article.
  it('marks a previous reader article once and ignores other modes or completed articles', () => {
    const context = createContext();

    context.markReaderPreviousArticleRead(1);
    expect(context.addToPool).not.toHaveBeenCalled();

    context.$store.data.currentSelection.viewMode = 'reader';
    context.markReaderPreviousArticleRead('1');
    context.markReaderPreviousArticleRead(2);
    context.pool.add(3);
    context.markReaderPreviousArticleRead(3);

    expect(context.addToPool).toHaveBeenCalledOnce();
    expect(context.addToPool).toHaveBeenCalledWith(1);
  });

  // Verifies seen responses update every returned article and only reconcile requested counts.
  it('persists seen state and reconciles related read articles', async () => {
    const context = createContext();
    markArticleSeen.mockResolvedValue({
      data: {
        id: 1,
        status: 'read',
        firstSeen: '2026-07-31T10:00:00Z',
        readArticles: [
          { id: 1, feedId: 10, feed: { categoryId: 100 } },
          { id: 3, feedId: 11, feed: { categoryId: 100 } }
        ]
      }
    });

    await context.markArticleSeen(1, 4);

    expect(markArticleSeen).toHaveBeenCalledWith(1, {
      grouping: 'event',
      visibleSeconds: 4,
      selectedStatus: 'unread'
    });
    expect(context.articles.map(article => article.status)).toEqual(['read', 'read', 'read']);
    expect(context.$store.data.increaseReadCount).toHaveBeenCalledTimes(2);
  });

  // Verifies minimal navigation reads the previous item and clears the active item on close.
  it('handles minimal article open, close, and duplicate in-flight requests', async () => {
    const context = createContext();
    context.$store.data.currentSelection.viewMode = 'minimal';
    context.activeMinimalArticleId = 1;
    markArticleSeen.mockResolvedValue({
      data: {
        ...context.articles[0],
        status: 'read'
      }
    });

    await context.handleMinimalArticleOpened({ id: 3 });
    context.handleMinimalArticleClosed({ id: '3' });

    expect(markArticleSeen).toHaveBeenCalledWith(1, {
      grouping: 'event',
      visibleSeconds: 0,
      selectedStatus: 'unread'
    });
    expect(context.pool).toContain(1);
    expect(context.activeMinimalArticleId).toBeNull();
    expect(context.pendingReadStatusArticleIds.size).toBe(0);

    context.pendingReadStatusArticleIds.add(3);
    await context.markMinimalArticleRead(3);
    expect(markArticleSeen).toHaveBeenCalledOnce();
  });

  // Verifies minimal toggles update counts, pool membership, and active selection.
  it('toggles minimal articles between unread and read', async () => {
    const context = createContext();
    context.$store.data.currentSelection.viewMode = 'minimal';
    context.activeMinimalArticleId = 2;
    context.pool.add(2);
    markArticleUnread.mockResolvedValue({
      data: { ...context.articles[1], status: 'unread' }
    });
    markArticleSeen.mockResolvedValue({
      data: { ...context.articles[0], status: 'read' }
    });

    await context.toggleMinimalArticleReadStatus({ id: 2, status: 'read' });
    await context.toggleMinimalArticleReadStatus({ id: 1, status: 'unread' });

    expect(markArticleUnread).toHaveBeenCalledWith(2);
    expect(context.$store.data.decreaseReadCount).toHaveBeenCalledOnce();
    expect(context.pool).not.toContain(2);
    expect(context.activeMinimalArticleId).toBeNull();
    expect(context.pool).toContain(1);
    expect(context.$store.data.increaseReadCount).toHaveBeenCalledOnce();
  });

  // Verifies shortcut routing and duplicate-submit protection across view modes.
  it('routes shortcut toggles and prevents duplicate read-status requests', async () => {
    const context = createContext();
    context.toggleMinimalArticleReadStatus = vi.fn().mockResolvedValue();
    context.toggleArticleReadStatus = vi.fn().mockResolvedValue();

    context.$store.data.currentSelection.viewMode = 'minimal';
    await articleFeedReadStateMethods.toggleShortcutArticleReadStatus.call(
      context,
      { id: 1, status: 'unread' }
    );
    context.$store.data.currentSelection.viewMode = 'reader';
    await articleFeedReadStateMethods.toggleShortcutArticleReadStatus.call(
      context,
      { id: 2, status: 'read' }
    );

    expect(context.toggleMinimalArticleReadStatus).toHaveBeenCalledWith({
      id: 1,
      status: 'unread'
    });
    expect(context.toggleArticleReadStatus).toHaveBeenCalledWith({
      id: 2,
      status: 'read'
    });

    const realContext = createContext();
    realContext.pendingReadStatusArticleIds.add(1);
    await realContext.toggleArticleReadStatus({ id: 1, status: 'unread' });
    expect(markArticleSeen).not.toHaveBeenCalled();
  });

  // Verifies reader bulk targeting respects position and publication time.
  it('selects visible, positional, and older reader articles', () => {
    const context = createContext();

    expect(context.getReaderBulkReadArticles('mark-visible-read', 2)).toBe(context.articles);
    expect(context.getReaderBulkReadArticles('mark-above-read', 2).map(article => article.id))
      .toEqual([1]);
    expect(context.getReaderBulkReadArticles('mark-below-read', 2).map(article => article.id))
      .toEqual([3]);
    expect(context.getReaderBulkReadArticles('mark-older-read', 1).map(article => article.id))
      .toEqual([2, 3]);
    expect(context.getReaderBulkReadArticles('mark-above-read', 99)).toEqual([]);
    expect(context.articlePublishedTime({ publishedAt: 'invalid' })).toBeNaN();
  });

  // Verifies bulk read persistence skips completed articles and refreshes overview counts.
  it('marks only unread reader articles and applies returned state', async () => {
    const context = createContext();
    markArticlesAsRead.mockResolvedValue({
      data: {
        articles: [
          { ...context.articles[0], status: 'read' },
          { ...context.articles[2], status: 'read' }
        ]
      }
    });

    await context.markReaderArticlesRead(context.articles);

    expect(markArticlesAsRead).toHaveBeenCalledWith([1, 3]);
    expect(context.pool).toEqual(new Set([1, 3]));
    expect(context.$store.data.fetchOverviewSplit).toHaveBeenCalledWith({
      forceUpdate: true
    });
  });

  // Verifies failed toggles preserve local state, release guards, and notify the user.
  it('preserves local state and reports failed read-status toggles', async () => {
    const context = createContext();
    const before = structuredClone(context.articles);
    const error = new Error('offline');
    markArticleSeen.mockRejectedValue(error);

    await context.toggleArticleReadStatus({ id: 1, status: 'unread' });

    expect(context.articles).toEqual(before);
    expect(context.pendingReadStatusArticleIds.size).toBe(0);
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not update the article status. Please try again.',
      error
    );
  });
});
