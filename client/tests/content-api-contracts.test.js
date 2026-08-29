import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchArticleDetails,
  fetchArticleIds,
  fetchArticleRecommendations,
  fetchDailyBriefing,
  fetchDuplicateArticles,
  markAllAsRead,
  markArticleSeen,
  markArticlesAsRead,
  markArticleUnread,
  markAsFavorite,
  markClicked,
  markManyAsFavorite,
  markManyClicked,
  markMoreLikeThis,
  markNotInterested,
  updateClickedStatus
} from '../src/api/articles.js';
import { fetchEventArticles } from '../src/api/events.js';
import { fetchTopTags } from '../src/api/tags.js';
import { fetchTopicArticles } from '../src/api/topics.js';

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  default: { get, post }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('article content API contracts', () => {
  // Verifies article list and detail requests preserve selection and ordering data.
  it('builds article retrieval requests', () => {
    const selection = {
      status: 'unread',
      categoryId: 4,
      includeFirstPage: false
    };

    fetchArticleIds(selection);
    fetchDailyBriefing({ selectionPeriod: '24h' });
    fetchArticleDetails([3, 7], 'desc');
    fetchArticleRecommendations(11);
    fetchDuplicateArticles('article/5');

    expect(get).toHaveBeenNthCalledWith(1, '/articles', {
      params: {
        status: 'unread',
        categoryId: 4,
        includeFirstPage: true
      }
    });
    expect(get).toHaveBeenNthCalledWith(2, '/articles/briefing', {
      params: { selectionPeriod: '24h' }
    });
    expect(post).toHaveBeenNthCalledWith(1, '/articles/details', {
      articleIds: '3,7',
      sort: 'desc'
    });
    expect(get).toHaveBeenNthCalledWith(
      3,
      '/articles/11/recommendations',
      { suppressGlobalError: true }
    );
    expect(get).toHaveBeenNthCalledWith(
      4,
      '/articles/duplicates/article/5'
    );
  });

  it('canonicalizes legacy Trust sorting in article requests', () => {
    fetchArticleIds({ sort: 'trust', search: 'unread:true sort:trust' });
    fetchArticleDetails([3], 'trust');

    expect(get).toHaveBeenCalledWith('/articles', {
      params: {
        sort: 'quality',
        search: 'unread:true sort:quality',
        includeFirstPage: true
      }
    });
    expect(post).toHaveBeenCalledWith('/articles/details', {
      articleIds: '3',
      sort: 'quality'
    });
  });

  // Verifies read-state requests use the expected dedicated and bulk endpoints.
  it('builds article read-state requests', () => {
    const seenPayload = {
      grouping: 'event',
      visibleSeconds: 8,
      selectedStatus: 'unread'
    };
    const selection = { status: 'unread', grouping: 'topic' };

    markArticleSeen(9, seenPayload);
    markArticleUnread(9);
    markAllAsRead(selection);
    markArticlesAsRead([9, 10], 'event');
    markArticlesAsRead([11]);

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/articles/markasseen/9',
      seenPayload,
      {
        suppressGlobalError: true,
        timeout: 30000
      }
    );
    expect(post).toHaveBeenNthCalledWith(2, '/articles/marktounread/9');
    expect(post).toHaveBeenNthCalledWith(
      3,
      '/articles/markasread',
      { ...selection, scope: 'matching' }
    );
    expect(post).toHaveBeenNthCalledWith(4, '/articles/markasread', {
      articleIds: [9, 10],
      grouping: 'event'
    });
    expect(post).toHaveBeenNthCalledWith(5, '/articles/markasread', {
      articleIds: [11],
      grouping: 'none'
    });
  });

  // Verifies engagement signals use exact single- and multi-article payloads.
  it('builds article engagement requests', () => {
    markAsFavorite(3, 'mark');
    markManyAsFavorite([3, 4], 'unmark');
    markClicked(3);
    updateClickedStatus(3, 'unmark');
    markManyClicked([3, 4]);
    markNotInterested(3);
    markMoreLikeThis(4);

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/articles/markasfavorite/3',
      { update: 'mark' }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/articles/markasfavorite',
      { articleIds: [3, 4], update: 'unmark' }
    );
    expect(post).toHaveBeenNthCalledWith(3, '/articles/markclicked/3');
    expect(post).toHaveBeenNthCalledWith(
      4,
      '/articles/markclicked/3',
      { update: 'unmark' }
    );
    expect(post).toHaveBeenNthCalledWith(
      5,
      '/articles/markclicked',
      { articleIds: [3, 4] }
    );
    expect(post).toHaveBeenNthCalledWith(
      6,
      '/articles/marknotinterested/3'
    );
    expect(post).toHaveBeenNthCalledWith(
      7,
      '/articles/markmorelikethis/4'
    );
  });
});

describe('related content API contracts', () => {
  // Verifies event and topic expansion retain the optional source article.
  it('builds event and topic article requests', () => {
    fetchEventArticles(7, 11);
    fetchEventArticles(8);
    fetchTopicArticles(9, 12);
    fetchTopicArticles(10);

    expect(post).toHaveBeenNthCalledWith(1, '/events/articles', {
      eventId: 7,
      articleId: 11
    });
    expect(post).toHaveBeenNthCalledWith(2, '/events/articles', {
      eventId: 8,
      articleId: null
    });
    expect(post).toHaveBeenNthCalledWith(3, '/topics/articles', {
      eventId: 9,
      articleId: 12
    });
    expect(post).toHaveBeenNthCalledWith(4, '/topics/articles', {
      eventId: 10,
      articleId: null
    });
  });

  // Verifies top-tag filters pass through as query parameters.
  it('builds the top-tags request', () => {
    const params = { grouping: 'topic', limit: 20 };

    fetchTopTags(params);

    expect(get).toHaveBeenCalledWith('/tags', { params });
  });
});
