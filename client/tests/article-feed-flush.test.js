import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/ArticleFeed.vue';
import { markArticlesAsRead } from '../src/api/articles.js';

vi.mock('../src/api/articles.js', () => ({
  fetchArticleIds: vi.fn(),
  fetchArticleDetails: vi.fn(),
  markArticlesAsRead: vi.fn(),
  markArticleUnread: vi.fn(),
  markArticleSeen: vi.fn(),
  markAsFavorite: vi.fn(),
  markManyClicked: vi.fn(),
  markManyAsFavorite: vi.fn()
}));

beforeEach(() => {
  markArticlesAsRead.mockReset();
  markArticlesAsRead.mockResolvedValue({ data: { articles: [] } });
});

describe('ArticleFeed final read reconciliation', () => {
  it('marks the complete container snapshot instead of only pooled or remaining IDs', async () => {
    const fetchOverviewSplit = vi.fn().mockResolvedValue();
    const context = {
      container: [101, 102, 103, 103],
      pool: new Set([101, 102]),
      articles: [
        { id: 101, status: 'read' },
        { id: 102, status: 'unread' },
        { id: 103, status: 'unread' }
      ],
      isFlushed: false,
      $store: {
        data: {
          currentSelection: { grouping: 'none' },
          fetchOverviewSplit
        }
      }
    };

    await ArticleFeed.methods.flushPool.call(context);

    expect(markArticlesAsRead).toHaveBeenCalledWith([101, 102, 103], 'none');
    expect(context.articles.map(article => article.status)).toEqual([
      'read',
      'read',
      'read'
    ]);
    expect(context.isFlushed).toBe(true);
    expect(fetchOverviewSplit).toHaveBeenCalledWith({ forceUpdate: true });
  });

  it('preserves local state when full-container reconciliation fails', async () => {
    const error = new Error('Request failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchOverviewSplit = vi.fn();
    const context = {
      container: [201, 202],
      pool: new Set([201]),
      articles: [
        { id: 201, status: 'read' },
        { id: 202, status: 'unread' }
      ],
      isFlushed: false,
      $store: {
        data: {
          currentSelection: { grouping: 'event' },
          fetchOverviewSplit
        }
      }
    };
    markArticlesAsRead.mockRejectedValue(error);

    await ArticleFeed.methods.flushPool.call(context);

    expect(markArticlesAsRead).toHaveBeenCalledWith([201, 202], 'event');
    expect(context.articles.map(article => article.status)).toEqual(['read', 'unread']);
    expect(context.isFlushed).toBe(false);
    expect(fetchOverviewSplit).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Error marking all articles as read:',
      error
    );

    consoleError.mockRestore();
  });
});
