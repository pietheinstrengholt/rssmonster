import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Article from '../src/components/Article.vue';

// This function mounts an article with the store shape used by the component.
function mountArticle(props = {}) {
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
      contentOriginal: '<html><head></head><body>null</body></html>',
      ...props
    },
    global: {
      stubs: {
        BootstrapIcon: true
      },
      mocks: {
        $store: {
          data: {
            categories: [],
            currentSelection: {
              viewMode: 'minimal',
              grouping: 'none'
            }
          }
        }
      }
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
