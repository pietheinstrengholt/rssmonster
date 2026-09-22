import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ArticleMeta from '../src/components/articles/ArticleMeta.vue';
import { articleDateContext } from '../src/utils/date.js';

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


describe('Article date context', () => {
  it.each([
    ['2026-09-22T08:00:00', 'Today', 'Tuesday, 22 September 2026'],
    ['2026-09-21T23:59:00', 'Yesterday', 'Monday, 21 September 2026'],
    ['2026-09-19T12:00:00', 'Saturday', 'Saturday, 19 September 2026']
  ])('formats both labels from the same local day: %s', (value, label, longLabel) => {
    expect(articleDateContext(value, new Date('2026-09-22T12:00:00'))).toMatchObject({ label, longLabel });
  });
  it('uses yesterday across month and year boundaries', () => {
    expect(articleDateContext('2025-12-31T23:59:00', new Date('2026-01-01T00:01:00')))
      .toMatchObject({ label: 'Yesterday', isoDate: '2025-12-31' });
  });
  it.each([null, '', 'invalid'])('omits unavailable publication dates: %s', value => {
    expect(articleDateContext(value)).toBeNull();
  });
});
