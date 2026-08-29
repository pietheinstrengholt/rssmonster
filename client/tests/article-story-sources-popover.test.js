import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchStorySourceArticles } from '../src/api/articles.js';
import ArticleStorySourcesPopover from '../src/components/articles/ArticleStorySourcesPopover.vue';

vi.mock('../src/api/articles.js', () => ({
  fetchStorySourceArticles: vi.fn()
}));

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ArticleStorySourcesPopover', () => {
  it('loads different-source articles when the source badge is clicked', async () => {
    fetchStorySourceArticles.mockResolvedValue({
      data: {
        hasMore: false,
        articles: [{
          id: 8,
          title: 'Corroborating report',
          url: 'https://other.example/report',
          feed: {
            name: 'Other News',
            favicon: 'https://other.example/favicon.ico'
          }
        }]
      }
    });
    const wrapper = mount(ArticleStorySourcesPopover, {
      props: { articleId: 42, sourceCount: 3 },
      attachTo: document.body,
      global: { stubs: { BootstrapIcon: BootstrapIconStub } }
    });

    const trigger = wrapper.get('button.source-badge');
    expect(trigger.text()).toContain('3 sources');
    await trigger.trigger('click');
    await flushPromises();

    expect(fetchStorySourceArticles).toHaveBeenCalledWith(42);
    expect(document.body.querySelector('.article-explanation-header h3').textContent)
      .toBe('Same story, different sources');
    expect(document.body.querySelector('.related-story-feed').textContent).toBe('Other News');
    expect(document.body.querySelector('a.related-story-title').textContent)
      .toBe('Corroborating report');
    expect(document.body.querySelector('.related-story-source-icon img').getAttribute('src'))
      .toBe('https://other.example/favicon.ico');
  });

  it('caches a successful source response when reopened', async () => {
    fetchStorySourceArticles.mockResolvedValue({ data: { hasMore: false, articles: [] } });
    const wrapper = mount(ArticleStorySourcesPopover, {
      props: { articleId: 42, sourceCount: 2 },
      attachTo: document.body,
      global: { stubs: { BootstrapIcon: BootstrapIconStub } }
    });
    const trigger = wrapper.get('button.source-badge');

    await trigger.trigger('click');
    await flushPromises();
    await trigger.trigger('click');
    await trigger.trigger('click');
    await flushPromises();

    expect(fetchStorySourceArticles).toHaveBeenCalledTimes(1);
  });
});
