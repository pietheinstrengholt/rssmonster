import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ArticleMeta from '../src/components/articles/ArticleMeta.vue';

// This function mounts article metadata with the publication date under test.
function mountArticle(props = {}) {
  return mount(ArticleMeta, {
    props: {
      publishedAt: '2026-06-07T10:00:00.000Z',
      neutralScore: 70,
      ...props
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

    expect(wrapper.get('.article-published').text()).toBe('7 minutes ago');
  });

  it('keeps normal relative time formatting for past publication dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T10:07:00.000Z'));

    const wrapper = mountArticle({
      publishedAt: '2026-06-07T10:00:00.000Z'
    });

    expect(wrapper.get('.article-published').text()).toBe('7 minutes ago');
  });
});
