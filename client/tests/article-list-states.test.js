import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ArticleEmptyState from '../src/components/articles/ArticleEmptyState.vue';
import ArticleEndState from '../src/components/articles/ArticleEndState.vue';
import ArticleLoadingState from '../src/components/articles/ArticleLoadingState.vue';
import SmartFoldersGridOverview from '../src/components/articles/SmartFoldersGridOverview.vue';

describe('ArticleEmptyState', () => {
  it('renders its guidance and emits each available recovery action', async () => {
    const wrapper = mount(ArticleEmptyState);

    expect(wrapper.get('section').attributes('aria-labelledby')).toBe('article-empty-state-title');
    expect(wrapper.get('h2').text()).toBe('No posts found');
    expect(wrapper.text()).toContain('There are no articles that match your current filters.');

    await wrapper.get('.article-empty-state-primary').trigger('click');
    await wrapper.get('.article-empty-state-secondary').trigger('click');
    await wrapper.get('.article-empty-state-link').trigger('click');

    expect(wrapper.emitted('clear-filters')).toHaveLength(1);
    expect(wrapper.emitted('refresh-feeds')).toHaveLength(1);
    expect(wrapper.emitted('open-smart-folders')).toHaveLength(1);
  });
});

describe('ArticleEndState', () => {
  it('shows the already-read message without actions', () => {
    const wrapper = mount(ArticleEndState, {
      props: {
        unreadCount: 0,
        showActions: false
      }
    });

    expect(wrapper.get('.article-end-state-text').text()).toBe('Everything is already read.');
    expect(wrapper.find('.article-end-state-actions').exists()).toBe(false);
  });

  it('uses singular copy and emits both actions', async () => {
    const wrapper = mount(ArticleEndState, {
      props: {
        unreadCount: 1,
        showActions: true
      }
    });

    expect(wrapper.get('.article-end-state-text').text()).toBe('1 unread article was reviewed.');
    expect(wrapper.get('.article-end-state-primary').text()).toContain('Mark 1 as read');

    await wrapper.get('.article-end-state-primary').trigger('click');
    await wrapper.get('.article-end-state-secondary').trigger('click');

    expect(wrapper.emitted('mark-all-read')).toHaveLength(1);
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });

  it('uses plural copy for multiple unread articles', () => {
    const wrapper = mount(ArticleEndState, {
      props: {
        unreadCount: 4,
        showActions: true
      }
    });

    expect(wrapper.get('.article-end-state-text').text()).toBe('4 unread articles were reviewed.');
  });
});

describe('ArticleLoadingState', () => {
  it('renders an accessible loading status and five article placeholders', () => {
    const wrapper = mount(ArticleLoadingState);
    const status = wrapper.get('.article-loading-state');

    expect(status.attributes()).toMatchObject({
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Loading articles'
    });
    expect(wrapper.get('.article-loading-state__mascot img').attributes()).toMatchObject({
      alt: '',
      width: '52',
      height: '52'
    });
    expect(wrapper.findAll('.article-loading-skeleton')).toHaveLength(5);
    expect(wrapper.findAll('.article-loading-state__dots span')).toHaveLength(3);
    expect(wrapper.get('.visually-hidden').text()).toBe('Loading articles');
  });
});

describe('SmartFoldersGridOverview', () => {
  it('renders the empty state with a zero total', () => {
    const wrapper = mount(SmartFoldersGridOverview);

    expect(wrapper.get('.smart-folder-grid-count').text()).toBe('Total 0');
    expect(wrapper.get('.smart-folder-grid-empty').text()).toContain('No smart folders yet');
    expect(wrapper.find('.smart-folder-grid').exists()).toBe(false);
  });

  it('renders normalized folder queries and emits the selected folder', async () => {
    const smartFolders = [
      { id: 12, name: 'AI Research', query: 'TAG:AI LIMIT:20' },
      { id: 13, name: 'Official news', query: 'OFFICIAL:TRUE' }
    ];
    const wrapper = mount(SmartFoldersGridOverview, {
      props: { smartFolders }
    });

    expect(wrapper.get('.smart-folder-grid-count').text()).toBe('Total 2');
    expect(wrapper.findAll('.smart-folder-card')).toHaveLength(2);
    expect(wrapper.findAll('.smart-folder-card-content small').map(node => node.text())).toEqual([
      'tag:ai limit:20',
      'official:true'
    ]);
    expect(wrapper.get('.smart-folder-card').attributes('aria-label')).toBe('Open smart folder AI Research');

    await wrapper.get('.smart-folder-card').trigger('click');

    expect(wrapper.emitted('selectSmartFolder')).toEqual([[smartFolders[0]]]);
  });
});
