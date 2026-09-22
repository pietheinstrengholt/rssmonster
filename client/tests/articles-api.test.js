import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDevelopingStoryArticles,
  fetchStorySourceArticles,
  fetchNewerArticleCount,
  fetchArticleIds,
  markAllAsRead,
  markArticlesAsRead
} from '../src/api/articles.js';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { get, post }
}));

describe('articles API', () => {
  it('does not persist a Smart Folder presentation as ordinary reading preferences', () => {
    fetchArticleIds({ smartFolderId: 4, sort: 'asc', grouping: 'event' });
    expect(get).toHaveBeenCalledWith('/articles', { params: {
      smartFolderId: 4, sort: 'asc', grouping: 'event', persistSettings: false, includeFirstPage: true
    } });
  });
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('requests the related articles for one developing story without global error handling', () => {
    fetchDevelopingStoryArticles(42);

    expect(get).toHaveBeenCalledWith('/articles/42/developing-story', {
      suppressGlobalError: true
    });
  });

  it('requests same-story articles from different sources without global error handling', () => {
    fetchStorySourceArticles(42);

    expect(get).toHaveBeenCalledWith('/articles/42/story-sources', {
      suppressGlobalError: true
    });
  });

  it.each(['unread', 'read', 'favorite', 'hot', 'clicked'])('forces unread arrivals from the %s view while retaining dynamic filters', status => {
    const selection = { categoryId: 3, feedId: 4, tag: 'science', search: 'title:Science', sort: 'recommended', grouping: 'event', status };
    fetchNewerArticleCount(selection, 100);

    expect(get).toHaveBeenCalledWith('/articles', {
      params: {
        ...selection,
        status: 'unread',
        search: 'title:Science unread:true read:false id:>100',
        persistSettings: false,
        newerThanArticleId: 100
      }
    });
    expect(selection.status).toBe(status);
  });

  it('passes event grouping for selected article mark-read requests', () => {
    markArticlesAsRead([10], 'event');

    expect(post).toHaveBeenCalledWith('/articles/markasread', {
      articleIds: [10],
      grouping: 'event'
    });
  });

  it('defaults selected article mark-read requests to no grouping', () => {
    markArticlesAsRead([10]);

    expect(post).toHaveBeenCalledWith('/articles/markasread', {
      articleIds: [10],
      grouping: 'none'
    });
  });

  it('passes the active grouping through matching mark-read requests', () => {
    const currentSelection = { status: 'unread', grouping: 'event' };

    markAllAsRead(currentSelection);

    expect(post).toHaveBeenCalledWith('/articles/markasread', {
      ...currentSelection,
      scope: 'matching'
    });
  });

  it('sends the loaded ID snapshot in matching mark-read requests', () => {
    const currentSelection = { status: 'unread', grouping: 'event' };

    markAllAsRead(currentSelection, [10, 11]);

    expect(post).toHaveBeenCalledWith('/articles/markasread', {
      ...currentSelection,
      scope: 'matching',
      snapshotArticleIds: [10, 11]
    });
  });
});
