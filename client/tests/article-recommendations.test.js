import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { fetchArticleRecommendations } from '../src/api/articles.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchArticleRecommendations: vi.fn(),
  fetchDuplicateArticles: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(() => Promise.resolve()),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn()
}));

// This function creates a promise whose completion order is controlled by the test.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

// This function creates a minimal full article for the Reader selection.
function createArticle(id, overrides = {}) {
  return {
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: '2026-08-01T10:00:00.000Z',
    feed: { feedName: 'Example Feed' },
    ...overrides
  };
}

// This function mounts the desktop-only Reader component with its required stores.
function mountReader(articles = [createArticle(1)]) {
  const stores = createFocusedStores({
    overview: { categories: [], smartFolders: [] },
    selection: {
      currentSelection: {
        smartFolderId: null,
        tag: '',
        search: '',
        feedId: '%',
        categoryId: '%',
        status: 'unread',
        viewMode: 'reader'
      }
    }
  });

  return mount(ArticleReaderLayout, {
    props: {
      articles,
      container: articles.map(article => article.id),
      collectionSummary: {
        status: 'unread', selectedTag: '', unreadCount: articles.length, sourceCount: 1
      },
      collectionProgress: {
        hasLoadedContent: true,
        isFlushed: false,
        hasReachedEnd: false,
        showFeedRefreshProgress: true
      }
    },
    global: {
      plugins: [stores.pinia],
      stubs: {
        ArticleItem: true,
        ArticleEmptyState: true,
        ArticleEndState: true,
        ArticleRefreshState: true,
        BootstrapIcon: true,
        DailyBriefingIntro: true,
        UnreadSelectionContext: true
      }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchArticleRecommendations.mockResolvedValue({ data: { articles: [] } });
});

describe('Reader article recommendations', () => {
  it('requests the selected article and renders no more than four accessible cards', async () => {
    const recommendations = Array.from({ length: 5 }, (_, index) => ({
      id: index + 10,
      title: `Recommendation ${index + 1}`,
      imageUrl: index === 0 ? 'https://example.com/image.jpg' : null,
      publishedAt: '2026-08-01T10:00:00.000Z',
      recommendationSimilarity: 0.91 - index / 100,
      Feed: { feedName: 'Recommended Feed' }
    }));
    fetchArticleRecommendations.mockResolvedValueOnce({ data: { articles: recommendations } });

    const wrapper = mountReader();
    await flushPromises();

    expect(fetchArticleRecommendations).toHaveBeenCalledWith(1);
    expect(wrapper.get('.article-recommendations__title').text()).toBe('You might also like');
    expect(wrapper.findAll('.article-recommendation-card')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('0.91');
    expect(wrapper.findAll('.article-recommendation-card__image')).toHaveLength(1);
  });

  it('renders nothing for empty or failed recommendation requests', async () => {
    const wrapper = mountReader();
    await flushPromises();

    expect(wrapper.find('.article-recommendations').exists()).toBe(false);

    fetchArticleRecommendations.mockRejectedValueOnce(new Error('Unavailable'));
    await wrapper.setProps({
      articles: [createArticle(2)],
      container: [2]
    });
    await flushPromises();

    expect(wrapper.vm.recommendationsError).toBe(true);
    expect(wrapper.find('.article-recommendations').exists()).toBe(false);
  });

  it('clears old cards and ignores a stale response after the article changes', async () => {
    const firstRequest = deferred();
    const secondRequest = deferred();
    fetchArticleRecommendations
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const wrapper = mountReader();
    await vi.waitFor(() => expect(fetchArticleRecommendations).toHaveBeenCalledWith(1));

    await wrapper.setProps({
      articles: [createArticle(2)],
      container: [2]
    });
    expect(wrapper.vm.recommendations).toEqual([]);
    expect(fetchArticleRecommendations).toHaveBeenLastCalledWith(2);

    secondRequest.resolve({
      data: { articles: [{ id: 20, title: 'Current recommendation' }] }
    });
    await flushPromises();
    firstRequest.resolve({
      data: { articles: [{ id: 10, title: 'Stale recommendation' }] }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Current recommendation');
    expect(wrapper.text()).not.toContain('Stale recommendation');
  });

  it('emits the existing Reader selection request and resets selection scroll at the Reader boundary', async () => {
    fetchArticleRecommendations.mockResolvedValueOnce({
      data: { articles: [{ id: 2, title: 'Open in Reader' }] }
    });
    const wrapper = mountReader([
      createArticle(1),
      createArticle(2, { readerRecommendationInd: true })
    ]);
    await flushPromises();

    await wrapper.get('.article-recommendation-card').trigger('click');
    expect(wrapper.emitted('select-recommendation')).toEqual([[2]]);

    const readerPanel = wrapper.get('.article-reader__content').element;
    readerPanel.scrollTop = 320;
    wrapper.vm.selectArticle(2);
    await wrapper.vm.$nextTick();

    expect(readerPanel.scrollTop).toBe(0);
    expect(wrapper.vm.selectedArticleId).toBe(2);
  });
});
