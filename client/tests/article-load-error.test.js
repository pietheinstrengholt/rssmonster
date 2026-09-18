import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

describe.each([
  ['stream', ArticleListView],
  ['Reader', ArticleReaderLayout]
])('%s initial article load errors', (_name, component) => {
  it('renders an accessible retry instead of empty or loading states, then shows a successful empty result', async () => {
    const stores = createFocusedStores({
      overview: { categories: [], smartFolders: [] },
      selection: {
        currentSelection: {
          status: 'unread', categoryId: '%', feedId: '%', viewMode: 'full', grouping: 'none'
        }
      }
    });
    const collectionProgress = {
      hasLoadedContent: false,
      isCollectionEmpty: true,
      loadedCount: 0,
      hasReachedEnd: false,
      paginationError: 'Could not load articles. Please try again.'
    };
    const wrapper = shallowMount(component, {
      props: {
        articles: [],
        container: [],
        collectionSummary: { status: 'unread', unreadCount: 0, sourceCount: null },
        collectionProgress,
        ...(component === ArticleListView ? { viewMode: 'full' } : {})
      },
      global: { plugins: [stores.pinia], stubs: { ArticleLoadError: false } }
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('Something went wrong');
    expect(wrapper.get('[role="alert"]').text()).toContain("We couldn't load the articles. Please try again in a moment.");
    expect(wrapper.get('[role="alert"] button').text()).toBe('Try again');
    expect(wrapper.findComponent({ name: 'ArticleEmptyState' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ArticleLoadingState' }).exists()).toBe(false);
    expect(wrapper.find('.reader-loading-state').exists()).toBe(false);
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(wrapper.emitted('retry-pagination')).toHaveLength(1);

    await wrapper.setProps({ collectionProgress: { ...collectionProgress, paginationError: null } });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ArticleEmptyState' }).exists()).toBe(false);
    expect(component === ArticleListView
      ? wrapper.findComponent({ name: 'ArticleLoadingState' }).exists()
      : wrapper.find('.reader-loading-state').exists()).toBe(true);

    await wrapper.setProps({
      collectionProgress: { ...collectionProgress, hasLoadedContent: true, paginationError: null }
    });
    expect(wrapper.findComponent({ name: 'ArticleEmptyState' }).exists()).toBe(true);
    wrapper.unmount();
  });
});
