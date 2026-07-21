import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markAllAsRead, markArticlesAsRead } from '../src/api/articles.js';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { post }
}));

describe('articles API', () => {
  beforeEach(() => {
    post.mockReset();
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

    expect(post).toHaveBeenCalledWith('/articles/markasread', currentSelection);
  });
});
