import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDevelopingStoryArticles,
  fetchStorySourceArticles,
  fetchNewerArticleCount,
  markAllAsRead,
  markArticlesAsRead
} from '../src/api/articles.js';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { get, post }
}));

describe('articles API', () => {
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

  it('requests a newer-article count with the active selection and snapshot boundary', () => {
    fetchNewerArticleCount({ categoryId: 3, status: 'unread' }, 100);

    expect(get).toHaveBeenCalledWith('/articles', {
      params: {
        categoryId: 3,
        status: 'unread',
        newerThanArticleId: 100
      }
    });
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
