import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import api from '../src/api/client.js';
import {
  deletePushSubscription,
  fetchPushConfiguration,
  fetchPushSubscriptionStatus,
  savePushSubscription
} from '../src/api/push.js';
import ArticleHeadlineRow from '../src/components/articles/ArticleHeadlineRow.vue';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import AppShellLoadError from '../src/components/shared/AppShellLoadError.vue';
import { hasRenderableContent, usableHttpUrl } from '../src/utils/content.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    fetchArticleRecommendations: vi.fn().mockResolvedValue({ data: { articles: [] } }),
    markClicked: vi.fn().mockResolvedValue({ data: { clickedAmount: 1 } })
  };
});

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="icon-stub" :data-icon="icon"></span>'
};

const ArticleActionsMenuStub = {
  name: 'ArticleActionsMenu',
  emits: ['more-like-this', 'mute-feed', 'not-interested', 'toggle-favorite'],
  template: '<button class="menu-action" @click="$emit(\'more-like-this\')">Menu action</button>'
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('content renderability boundaries', () => {
  it('recognizes visible text, vectors, and usable media while rejecting inert markup', () => {
    expect(hasRenderableContent('<p>Readable story</p>')).toBe(true);
    expect(hasRenderableContent('<svg aria-hidden="true"></svg>')).toBe(true);
    expect(hasRenderableContent('<canvas></canvas>')).toBe(true);
    expect(hasRenderableContent('<img src="https://example.com/image.jpg">')).toBe(true);
    expect(hasRenderableContent('<source srcset="https://example.com/a.webp 1x, https://example.com/b.webp 2x">')).toBe(true);
    expect(hasRenderableContent('<object data="https://example.com/chart.pdf"></object>')).toBe(true);
    expect(hasRenderableContent('<img src="data:image/png;base64,abc">')).toBe(false);
    expect(hasRenderableContent('<p>&nbsp;</p>')).toBe(false);
    expect(hasRenderableContent('<html><head></head><body>null</body></html>')).toBe(false);
  });

  it('falls back to string inspection when DOM parsing is unavailable or fails', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(hasRenderableContent('<p>Fallback text</p>')).toBe(true);
    expect(hasRenderableContent('<video src="https://example.com/movie.mp4"></video>')).toBe(true);
    expect(hasRenderableContent('<svg></svg>')).toBe(true);
    expect(hasRenderableContent('<br>&#x00a0;')).toBe(false);

    vi.stubGlobal('DOMParser', class {
      parseFromString() {
        throw new Error('parser unavailable');
      }
    });
    expect(hasRenderableContent('<audio src="https://example.com/audio.mp3"></audio>')).toBe(true);
  });

  it('canonicalizes only HTTP destinations', () => {
    expect(usableHttpUrl(' https://example.com/story ')).toBe('https://example.com/story');
    expect(usableHttpUrl('http://example.com')).toBe('http://example.com/');
    expect(usableHttpUrl('javascript:alert(1)')).toBe('');
    expect(usableHttpUrl('not a URL')).toBe('');
  });
});

describe('push API contracts', () => {
  it('routes configuration and subscription operations through their owned endpoints', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {} });
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    vi.spyOn(api, 'delete').mockResolvedValue({ data: {} });
    const subscription = { endpoint: 'https://push.example/subscription' };

    await fetchPushConfiguration();
    await fetchPushSubscriptionStatus();
    await savePushSubscription(subscription);
    await deletePushSubscription(subscription.endpoint);

    expect(api.get).toHaveBeenNthCalledWith(1, '/push/configuration');
    expect(api.get).toHaveBeenNthCalledWith(2, '/push/subscription');
    expect(api.post).toHaveBeenCalledWith('/push/subscription', subscription);
    expect(api.delete).toHaveBeenCalledWith('/push/subscription', {
      data: { endpoint: subscription.endpoint }
    });
  });
});

describe('ArticleHeadlineRow interaction contract', () => {
  it('renders grouped metadata and forwards every compact-row interaction', async () => {
    const wrapper = mount(ArticleHeadlineRow, {
      props: {
        url: 'https://example.com/story',
        title: 'Coverage story',
        status: 'unread',
        favoriteInd: 0,
        feedFavicon: 'https://example.com/favicon.ico',
        sourceLabel: 'Example feed',
        eventId: 42,
        sourceCount: 3,
        eventArticleCountTotal: 3,
        grouping: 'event',
        duplicateCount: 1,
        tags: [{ id: 5, name: 'machine-learning', tagType: 'rule' }],
        publishedAt: new Date().toISOString(),
        hasArticlePreview: false
      },
      global: {
        stubs: {
          ArticleActionsMenu: ArticleActionsMenuStub,
          ArticlePreviewFallback: {
            emits: ['open-original'],
            template: '<button class="preview-original" @click="$emit(\'open-original\')">Original</button>'
          },
          BootstrapIcon: BootstrapIconStub,
          HighlightedText: { props: ['text'], template: '<span>{{ text }}</span>' }
        }
      }
    });

    expect(wrapper.get('.source-badge').text()).toContain('3 sources');
    expect(wrapper.get('.similar-badge').text()).toContain('2 similar articles');
    expect(wrapper.get('.duplicate-badge').text()).toContain('1 duplicate');
    expect(wrapper.get('.tag-rule').text()).toBe('Machine-learning');

    await wrapper.get('.article-list-row').trigger('click');
    await wrapper.get('.article-list-row').trigger('touchstart');
    await wrapper.get('.article-list-row').trigger('touchmove');
    await wrapper.get('.article-list-row').trigger('touchend');
    await wrapper.get('.article-list-row').trigger('touchcancel');
    await wrapper.get('.article-list-status').trigger('click');
    await wrapper.get('.article-link').trigger('click');
    await wrapper.get('.similar-badge').trigger('click');
    await wrapper.get('.duplicate-badge').trigger('click');
    await wrapper.get('.tag-rule').trigger('click');
    await wrapper.get('.preview-original').trigger('click');
    await wrapper.get('.menu-action').trigger('click');
    await wrapper.get('.article-list-favorite-button').trigger('click');
    wrapper.vm.openOriginalArticle();

    expect(wrapper.emitted('article-touched').length).toBeGreaterThanOrEqual(1);
    expect(wrapper.emitted('swipe-touch-start')).toHaveLength(1);
    expect(wrapper.emitted('swipe-touch-move')).toHaveLength(1);
    expect(wrapper.emitted('swipe-touch-end')).toHaveLength(1);
    expect(wrapper.emitted('swipe-cancel')).toHaveLength(1);
    expect(wrapper.emitted('toggle-read-status')).toHaveLength(1);
    expect(wrapper.emitted('article-clicked')).toHaveLength(3);
    expect(wrapper.emitted('view-event-articles')).toEqual([[42]]);
    expect(wrapper.emitted('view-duplicate-articles')).toHaveLength(1);
    expect(wrapper.emitted('select-tag')[0][0]).toMatchObject({ id: 5 });
    expect(wrapper.emitted('more-like-this')).toHaveLength(1);
    expect(wrapper.emitted('toggle-favorite')).toHaveLength(1);
  });

  it('renders safe fallbacks and expanded singular labels', () => {
    const wrapper = mount(ArticleHeadlineRow, {
      props: {
        url: 'javascript:alert(1)',
        title: 'Unsafe destination',
        status: 'read',
        favoriteInd: 1,
        eventId: 'event-1',
        eventArticleCountTotal: 2,
        grouping: 'event',
        eventExpanded: true,
        duplicateCount: 2,
        duplicatesExpanded: true,
        hasArticlePreview: true
      },
      global: {
        stubs: {
          ArticleActionsMenu: true,
          BootstrapIcon: BootstrapIconStub,
          HighlightedText: { props: ['text'], template: '<span>{{ text }}</span>' }
        }
      }
    });

    expect(wrapper.find('a.article-link').exists()).toBe(false);
    expect(wrapper.get('.similar-badge').attributes('aria-label')).toBe('Hide 1 similar article');
    expect(wrapper.get('.duplicate-badge').attributes('aria-label')).toBe('Hide 2 duplicate articles');
    expect(wrapper.get('.article-list-status').attributes('aria-label')).toBe('Mark article as unread');
    expect(wrapper.get('.article-list-favorite-button').attributes('aria-label')).toBe('Unmark favorite');
  });
});

describe('ArticleReaderLayout interaction and DOM contracts', () => {
  const createReaderStores = () => createFocusedStores({
    overview: { categories: [], smartFolders: [] },
    selection: {
      currentSelection: {
        status: 'unread',
        categoryId: '%',
        feedId: '%',
        smartFolderId: null,
        tag: '',
        search: ''
      },
      setCurrentSelection: vi.fn()
    }
  });

  it('forwards every empty-reader recovery action', async () => {
    const stores = createReaderStores();
    const wrapper = mount(ArticleReaderLayout, {
      props: {
        articles: [],
        container: [],
        collectionSummary: {
          status: 'unread', selectedTag: 'AI', unreadCount: 0, sourceCount: 0
        },
        collectionProgress: {
          hasLoadedContent: true,
          isCollectionEmpty: true,
          showFeedRefreshProgress: true
        }
      },
      global: {
        plugins: [stores.pinia],
        stubs: {
          ArticleEmptyState: {
            emits: ['clear-filters', 'clear-tag', 'refresh-feeds', 'open-smart-folders', 'view-tag-status'],
            template: `
              <div class="empty-actions">
                <button class="clear-filters" @click="$emit('clear-filters')">Clear filters</button>
                <button class="clear-tag" @click="$emit('clear-tag')">Clear tag</button>
                <button class="refresh-feeds" @click="$emit('refresh-feeds')">Refresh</button>
                <button class="open-folders" @click="$emit('open-smart-folders')">Folders</button>
                <button class="view-read" @click="$emit('view-tag-status', 'read')">Read</button>
              </div>
            `
          },
          DailyBriefingIntro: true
        }
      }
    });

    for (const selector of ['.clear-filters', '.clear-tag', '.refresh-feeds', '.open-folders', '.view-read']) {
      await wrapper.get(selector).trigger('click');
    }

    expect(wrapper.emitted('clear-filters')).toHaveLength(1);
    expect(wrapper.emitted('clear-tag')).toHaveLength(1);
    expect(wrapper.emitted('refresh-feeds')).toHaveLength(1);
    expect(wrapper.emitted('open-smart-folders')).toHaveLength(1);
    expect(wrapper.emitted('view-tag-status')).toEqual([['read']]);
  });

  it('routes enabled bulk, pagination, end-state, and related-article events', async () => {
    const stores = createReaderStores();
    const articles = [
      { id: 1, title: 'First', status: 'unread', feed: { feedName: 'Feed' } },
      { id: 2, title: 'Second', status: 'unread', feed: { feedName: 'Feed' } },
      { id: 3, title: 'Third', status: 'unread', feed: { feedName: 'Feed' } },
      { id: 4, title: 'Related', status: 'unread', clusterParentId: 2, feed: { feedName: 'Feed' } }
    ];
    const ArticleItemStub = {
      name: 'Article',
      emits: [
        'update-favorite', 'update-clicked', 'toggle-read-status', 'event-articles-loaded',
        'event-articles-collapsed', 'duplicate-articles-loaded', 'duplicate-articles-collapsed',
        'article-not-interested'
      ],
      template: '<div class="article-item-stub"></div>'
    };
    const wrapper = mount(ArticleReaderLayout, {
      props: {
        articles,
        container: articles.slice(0, 3),
        collectionSummary: {
          status: 'unread', selectedTag: '', unreadCount: 3, sourceCount: 1, totalCount: 3
        },
        collectionProgress: {
          hasLoadedContent: true,
          isFlushed: false,
          hasReachedEnd: true,
          loadedCount: 3,
          paginationError: 'Could not load more articles'
        }
      },
      global: {
        plugins: [stores.pinia],
        stubs: {
          ArticleItem: ArticleItemStub,
          ArticleEndState: {
            emits: ['mark-all-read', 'dismiss'],
            template: '<div><button class="mark-all" @click="$emit(\'mark-all-read\')">Mark</button><button class="dismiss" @click="$emit(\'dismiss\')">Dismiss</button></div>'
          },
          DailyBriefingIntro: true,
          HighlightedText: { props: ['text'], template: '<span>{{ text }}</span>' },
          UnreadSelectionContext: true
        }
      }
    });

    wrapper.vm.selectArticle(2);
    await wrapper.vm.$nextTick();
    await wrapper.get('.bulk-more-button').trigger('click');
    const bulkItems = wrapper.findAll('.bulk-action-menu-item');
    await bulkItems[2].trigger('click');
    await wrapper.get('.bulk-more-button').trigger('click');
    await wrapper.findAll('.bulk-action-menu-item')[3].trigger('click');
    await wrapper.get('.app-notice button').trigger('click');
    await wrapper.get('.mark-all').trigger('click');
    await wrapper.get('.dismiss').trigger('click');

    const relatedArticle = wrapper.findAllComponents({ name: 'Article' })[1];
    const passthroughEvents = [
      'update-favorite', 'update-clicked', 'toggle-read-status', 'event-articles-loaded',
      'event-articles-collapsed', 'duplicate-articles-loaded', 'duplicate-articles-collapsed',
      'article-not-interested'
    ];
    for (const eventName of passthroughEvents) relatedArticle.vm.$emit(eventName, { id: 4 });

    expect(wrapper.emitted('bulk-action').map(events => events[0].action))
      .toEqual(['mark-above-read', 'mark-below-read']);
    expect(wrapper.emitted('retry-pagination')).toHaveLength(1);
    expect(wrapper.emitted('flush-pool')).toHaveLength(1);
    expect(wrapper.vm.isReaderEndStateDismissed).toBe(true);
    for (const eventName of passthroughEvents) {
      expect(wrapper.emitted(eventName)).toEqual([[{ id: 4 }]]);
    }
  });

  it('exposes selected, related, sentinel, viewport, and scroll-surface elements', () => {
    const selectedElement = document.createElement('article');
    const relatedElement = document.createElement('article');
    const sentinel = document.createElement('div');
    const articleList = document.createElement('aside');
    const articlePanel = document.createElement('section');
    articleList.scrollTop = 40;
    articlePanel.scrollTop = 80;
    const context = {
      selectedArticle: { id: 2 },
      relatedArticleRefs: { 4: { $el: relatedElement } },
      $refs: {
        selectedArticleComponent: { $el: selectedElement },
        loadMoreSentinel: sentinel,
        articleListScrollRef: articleList,
        readerArticlePanelRef: articlePanel
      }
    };

    expect(ArticleReaderLayout.methods.getArticleElement.call(context, 2)).toBe(selectedElement);
    expect(ArticleReaderLayout.methods.getArticleElement.call(context, 4)).toBe(relatedElement);
    expect(ArticleReaderLayout.methods.getArticleElement.call(context, 99)).toBeNull();
    expect(ArticleReaderLayout.methods.getLoadMoreSentinel.call(context)).toBe(sentinel);
    expect(ArticleReaderLayout.methods.getReadingViewportTop()).toBe(0);
    ArticleReaderLayout.methods.scrollToTop.call(context);
    expect(articleList.scrollTop).toBe(0);
    expect(articlePanel.scrollTop).toBe(0);
  });
});

describe('ArticleListView DOM contracts', () => {
  it('exposes article, sentinel, inset viewport, and scroll-reset behavior', () => {
    const articleElement = document.createElement('article');
    const sentinel = document.createElement('div');
    const scrollContainer = document.createElement('div');
    scrollContainer.scrollTop = 50;
    scrollContainer.getBoundingClientRect = () => ({ top: 72 });
    const context = {
      viewMode: 'full',
      minimalArticleRefs: { 5: { $el: articleElement } },
      $refs: {
        loadMoreSentinel: sentinel,
        expandedArticleScrollRef: scrollContainer
      }
    };
    const computedStyle = vi.spyOn(window, 'getComputedStyle');

    computedStyle.mockReturnValue({ overflowY: 'auto' });
    expect(ArticleListView.methods.getArticleElement.call(context, 5)).toBe(articleElement);
    expect(ArticleListView.methods.getArticleElement.call(context, 99)).toBeNull();
    expect(ArticleListView.methods.getLoadMoreSentinel.call(context)).toBe(sentinel);
    expect(ArticleListView.methods.getReadingViewportTop.call(context)).toBe(72);

    computedStyle.mockReturnValue({ overflowY: 'visible' });
    expect(ArticleListView.methods.getReadingViewportTop.call(context)).toBe(0);
    context.viewMode = 'minimal';
    expect(ArticleListView.methods.getReadingViewportTop.call(context)).toBe(0);

    ArticleListView.methods.scrollToTop.call(context);
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('forwards pagination retry from the stream error notice', async () => {
    const stores = createFocusedStores({
      overview: { categories: [] },
      selection: {
        currentSelection: {
          status: 'unread', categoryId: '%', feedId: '%', tag: ''
        }
      }
    });
    const wrapper = mount(ArticleListView, {
      props: {
        articles: [],
        container: [],
        viewMode: 'full',
        collectionSummary: {
          status: 'unread', selectedTag: '', unreadCount: 0, sourceCount: 0
        },
        collectionProgress: {
          hasLoadedContent: false,
          paginationError: 'Could not continue loading'
        }
      },
      global: {
        plugins: [stores.pinia],
        stubs: {
          ArticleLoadingState: true,
          DailyBriefingIntro: true
        }
      }
    });

    await wrapper.get('.app-notice button').trigger('click');
    expect(wrapper.emitted('retry-pagination')).toHaveLength(1);
  });
});

describe('AppShellLoadError', () => {
  it('forwards the lazy error retry through the component reload boundary', async () => {
    const reloadApplication = vi.fn();
    vi.stubGlobal('window', { location: { reload: reloadApplication } });
    AppShellLoadError.methods.reloadApplication();
    vi.unstubAllGlobals();

    const wrapper = mount(AppShellLoadError, {
      global: {
        stubs: {
          AppError: {
            emits: ['retry'],
            template: '<button class="retry" @click="$emit(\'retry\')">Retry</button>'
          }
        }
      }
    });

    expect(wrapper.get('.retry').text()).toBe('Retry');
    expect(reloadApplication).toHaveBeenCalledOnce();
  });
});
