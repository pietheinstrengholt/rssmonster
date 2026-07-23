import { describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

import Article from '../src/components/Article.vue';
import ArticleReaderLayout from '../src/components/ArticleReaderLayout.vue';

const developingEvent = {
  representativeArticleId: 100,
  developingArticleId: 103
};

// This function creates the store surface shared by article badge tests.
function createStore(viewMode = 'minimal') {
  return {
    data: {
      categories: [],
      smartFolders: [],
      unreadsSinceLastUpdate: 0,
      currentSelection: {
        status: 'unread',
        smartFolderId: null,
        tag: null,
        search: '',
        feedId: '%',
        categoryId: '%',
        grouping: 'none',
        viewMode
      },
      setCurrentSelection: vi.fn()
    }
  };
}

// This function mounts the compact article row with API-provided developing-story state.
function mountArticle(id, isDevelopingStory = false) {
  return shallowMount(Article, {
    props: {
      id,
      title: 'Event coverage',
      url: 'https://example.com/event-coverage',
      feed: { feedName: 'Example Feed' },
      status: 'unread',
      event: developingEvent,
      isDevelopingStory
    },
    global: {
      mocks: {
        $store: createStore()
      }
    }
  });
}

// This function mounts the reader list with one event article.
function mountReader(article) {
  return shallowMount(ArticleReaderLayout, {
    props: {
      articles: [article],
      container: [article.id],
      currentSelection: 'unread',
      currentViewUnreadCount: 1,
      currentViewSourceCount: 1,
      remainingItems: 1,
      fetchCount: 20,
      hasLoadedContent: true,
      isFlushed: false,
      distance: 0
    },
    global: {
      mocks: {
        $store: createStore('reader')
      }
    }
  });
}

describe('developing story icon', () => {
  it('renders on a compact article only when the API marks it as developing', () => {
    const developingWrapper = mountArticle(103, true);
    const representativeWrapper = mountArticle(100, false);

    expect(developingWrapper.get('.developing-story-icon').classes()).toContain('bi-lightning-charge-fill');
    expect(representativeWrapper.find('.developing-story-icon').exists()).toBe(false);
  });

  it('renders in the reader list for the developing article', () => {
    const wrapper = mountReader({
      id: 103,
      title: 'Developing coverage',
      status: 'unread',
      isDevelopingStory: true,
      event: developingEvent
    });

    expect(wrapper.get('.readerArticleListDevelopingIcon').classes()).toContain('bi-lightning-charge-fill');
  });

  it('does not render when the API developing-story field is false', () => {
    const compactWrapper = mountArticle(103, false);
    const readerWrapper = mountReader({
      id: 103,
      title: 'Ordinary coverage',
      status: 'unread',
      isDevelopingStory: false,
      event: developingEvent
    });

    expect(compactWrapper.find('.developing-story-icon').exists()).toBe(false);
    expect(readerWrapper.find('.readerArticleListDevelopingIcon').exists()).toBe(false);
  });
});
