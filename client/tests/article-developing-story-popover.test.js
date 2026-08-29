import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchDevelopingStoryArticles } from '../src/api/articles.js';
import ArticleDevelopingStoryPopover from '../src/components/articles/ArticleDevelopingStoryPopover.vue';

vi.mock('../src/api/articles.js', () => ({
  fetchDevelopingStoryArticles: vi.fn()
}));

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

const mountPopover = () => mount(ArticleDevelopingStoryPopover, {
  props: { articleId: 42 },
  attachTo: document.body,
  global: { stubs: { BootstrapIcon: BootstrapIconStub } }
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ArticleDevelopingStoryPopover', () => {
  it('loads and displays feed favicons, feed names, and article titles when opened', async () => {
    fetchDevelopingStoryArticles.mockResolvedValue({
      data: {
        hasMore: false,
        articles: [{
          id: 7,
          title: 'Earlier reporting',
          url: 'https://example.com/earlier',
          feed: {
            name: 'Example News',
            favicon: 'https://example.com/favicon.ico'
          }
        }]
      }
    });
    const wrapper = mountPopover();

    await wrapper.get('button.article-explanation-trigger').trigger('click');
    await flushPromises();

    expect(fetchDevelopingStoryArticles).toHaveBeenCalledWith(42);
    expect(document.body.querySelector('.article-explanation-header h3').textContent)
      .toBe('Part of a developing story');
    expect(document.body.querySelector('.related-story-feed').textContent)
      .toBe('Example News');
    const title = document.body.querySelector('a.related-story-title');
    expect(title.textContent).toBe('Earlier reporting');
    expect(title.getAttribute('href')).toBe('https://example.com/earlier');
    expect(document.body.querySelector('.related-story-source-icon img').getAttribute('src'))
      .toBe('https://example.com/favicon.ico');
  });

  it('caches a successful response when the popover is reopened', async () => {
    fetchDevelopingStoryArticles.mockResolvedValue({
      data: { hasMore: false, articles: [] }
    });
    const wrapper = mountPopover();
    const trigger = wrapper.get('button.article-explanation-trigger');

    await trigger.trigger('click');
    await flushPromises();
    await trigger.trigger('click');
    await trigger.trigger('click');
    await flushPromises();

    expect(fetchDevelopingStoryArticles).toHaveBeenCalledTimes(1);
  });

  it('shows a retry action after a request fails', async () => {
    fetchDevelopingStoryArticles.mockRejectedValue(new Error('Network error'));
    const wrapper = mountPopover();

    await wrapper.get('button.article-explanation-trigger').trigger('click');
    await flushPromises();

    expect(document.body.querySelector('[role="alert"]').textContent)
      .toContain('Couldn’t load the developing story.');
    expect(document.body.querySelector('[role="alert"] button').textContent).toBe('Retry');
  });

  it('does not make an invalid request when no article identifier is available', async () => {
    const wrapper = mount(ArticleDevelopingStoryPopover, {
      global: { stubs: { BootstrapIcon: BootstrapIconStub } }
    });

    await wrapper.get('button.article-explanation-trigger').trigger('click');
    await flushPromises();

    expect(fetchDevelopingStoryArticles).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
  });
});
