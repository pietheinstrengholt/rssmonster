import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Article from '../src/components/articles/Article.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

// This function mounts an article with the store shape used by the component.
function mountArticle(props = {}) {
  const stores = createFocusedStores({
    overview: { categories: [] },
    selection: { currentSelection: { viewMode: 'minimal', grouping: 'none' } }
  });
  return mount(Article, {
    props: {
      id: 1,
      title: 'Test article',
      url: 'https://example.com/article',
      publishedAt: '2026-06-07T10:00:00.000Z',
      feed: {
        url: 'https://example.com/feed.xml',
        feedName: 'Example Feed'
      },
      status: 'unread',
      favoriteInd: 0,
      hotInd: 0,
      clickedAmount: 0,
      ...props
    },
    global: {
      stubs: {
        BootstrapIcon: true
      },
      plugins: [stores.pinia]
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Article date formatting', () => {
  it('inverts future publication dates instead of rendering negative time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T10:00:00.000Z'));

    const wrapper = mountArticle({
      publishedAt: '2026-06-07T10:07:00.000Z'
    });

    expect(wrapper.vm.formatDate(wrapper.props('publishedAt'))).toBe('7 minutes ago');
  });

  it('keeps normal relative time formatting for past publication dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T10:07:00.000Z'));

    const wrapper = mountArticle({
      publishedAt: '2026-06-07T10:00:00.000Z'
    });

    expect(wrapper.vm.formatDate(wrapper.props('publishedAt'))).toBe('7 minutes ago');
  });
});
