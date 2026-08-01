import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Article from '../src/components/articles/Article.vue';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import AppShell from '../src/AppShell.vue';
import UpdateFeed from '../src/components/dialogs/feeds/UpdateFeed.vue';
import SettingsActions from '../src/components/settings/SettingsActions.vue';
import SmartFolderEditor from '../src/components/settings/smartFolders/SmartFolderEditor.vue';
import { fetchActions, saveActions } from '../src/api/actions.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/actions.js', async importOriginal => ({
  ...await importOriginal(),
  fetchActions: vi.fn(),
  saveActions: vi.fn()
}));

vi.mock('../src/api/articles.js', async importOriginal => ({
  ...await importOriginal(),
  fetchDuplicateArticles: vi.fn().mockResolvedValue({ data: [] }),
  markAsFavorite: vi.fn().mockResolvedValue({ data: {} }),
  markClicked: vi.fn().mockResolvedValue({ data: {} }),
  markMoreLikeThis: vi.fn().mockResolvedValue({ data: {} }),
  markNotInterested: vi.fn().mockResolvedValue({ data: {} })
}));

vi.mock('../src/api/events.js', async importOriginal => ({
  ...await importOriginal(),
  fetchEventArticles: vi.fn().mockResolvedValue({ data: [] })
}));

vi.mock('../src/api/topics.js', async importOriginal => ({
  ...await importOriginal(),
  fetchTopicArticles: vi.fn().mockResolvedValue({ data: [] })
}));

vi.mock('../src/api/feeds.js', async importOriginal => ({
  ...await importOriginal(),
  deleteFeed: vi.fn().mockResolvedValue({ data: {} }),
  muteFeed: vi.fn().mockResolvedValue({ data: {} }),
  rediscoverRss: vi.fn().mockResolvedValue({ data: { url: '', confidence: 0, reason: '' } }),
  updateFeed: vi.fn().mockResolvedValue({ data: {} })
}));

// Resolves one component computed property against a plain test context.
function compute(component, name, context) {
  return component.computed[name].call(context);
}

// Creates a reader context containing the state used by computed decisions.
function createReaderContext(overrides = {}) {
  const selection = {
    smartFolderId: null,
    tag: '',
    status: 'unread',
    search: '',
    feedId: '%',
    categoryId: '%'
  };

  return {
    articles: [],
    container: [],
    currentSelection: 'unread',
    currentViewUnreadCount: 0,
    currentViewSourceCount: null,
    distance: 0,
    isFlushed: false,
    isReaderEndStateDismissed: false,
    selectedArticleId: null,
    articleItemRefs: {},
    isBulkMenuOpen: false,
    bulkMenuStyle: {},
    pendingClickedArticleIds: new Set(),
    selectionStore: { currentSelection: selection },
    overviewStore: { categories: [], smartFolders: [], unreadsSinceLastUpdate: 0 },
    formatTagName: value => value.toUpperCase(),
    $emit: vi.fn(),
    $nextTick: vi.fn(callback => callback()),
    $refs: {},
    ...ArticleReaderLayout.methods,
    ...overrides
  };
}

// Creates a list context containing the state used by computed decisions.
function createListContext(overrides = {}) {
  return {
    articles: [],
    container: [],
    currentSelection: 'unread',
    currentViewUnreadCount: 0,
    currentViewSourceCount: null,
    distance: 0,
    viewMode: 'full',
    isFlushed: false,
    isArticleEndStateDismissed: false,
    activeMinimalArticleId: null,
    selectedArticleId: null,
    minimalArticleRefs: {},
    selectionStore: { currentSelection: { categoryId: '%', feedId: '%', tag: '' } },
    overviewStore: { unreadsSinceLastUpdate: 0 },
    uiStore: { mobileSearchOpen: false },
    $emit: vi.fn(),
    $nextTick: vi.fn(callback => callback()),
    ...ArticleListView.methods,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Article high-impact decision coverage', () => {
  it('filters internal attributes while preserving public attributes', () => {
    const filtered = compute(Article, 'filteredAttrs', {
      $attrs: {
        attentionBucket: 'high',
        description: 'private payload',
        userId: 4,
        id: 'article-4',
        'data-testid': 'article'
      }
    });

    expect(filtered).toEqual({ id: 'article-4', 'data-testid': 'article' });
  });

  it('resolves content, category, tags, score, and URL fallbacks', () => {
    expect(compute(Article, 'ruleTags', {
      tags: [{ name: 'Rule', tagType: 'rule' }, { name: 'Normal' }]
    })).toEqual([{ name: 'Rule', tagType: 'rule' }]);
    expect(compute(Article, 'ruleTags', { tags: null })).toEqual([]);
    expect(compute(Article, 'categoryName', {
      feed: { categoryId: 2 },
      overviewStore: { categories: [{ id: 2, name: 'Tech' }] }
    })).toBe('Tech');
    expect(compute(Article, 'categoryName', {
      feed: {}, overviewStore: { categories: [] }
    })).toBe('');
    expect(compute(Article, 'displayContent', {
      contentHtml: '', content: '', description: 'Fallback'
    })).toBe('Fallback');
    expect(compute(Article, 'roundedQuality', { quality: 0.846 })).toBe(85);

    const mainURL = compute(Article, 'mainURL', {});
    expect(mainURL('https://example.com/path')).toBe('https://example.com/');
    expect(mainURL('not a URL')).toBe('not a URL');
  });

  it('covers affinity-specific summary and image decisions', () => {
    const counts = { deep: 7, medium: 4, skim: 1, cold: 3, unknown: 3 };
    for (const [predictedAffinity, expected] of Object.entries(counts)) {
      expect(compute(Article, 'visibleBulletCount', {
        isUnread: true,
        predictedAffinity
      })).toBe(expected);
    }

    expect(compute(Article, 'visibleBulletCount', {
      isUnread: false,
      predictedAffinity: 'deep'
    })).toBe(Infinity);
    expect(compute(Article, 'shouldShowImage', {
      isUnread: true,
      predictedAffinity: 'cold'
    })).toBe(false);
    expect(compute(Article, 'shouldShowImage', {
      isUnread: false,
      predictedAffinity: 'cold'
    })).toBe(true);
  });

  it('covers media, grouping, labels, and favicon fallbacks', () => {
    expect(compute(Article, 'hasVideoMedia', { media: { type: 'video' } })).toBe(true);
    expect(compute(Article, 'hasVideoMedia', { media: 'video' })).toBe(false);

    for (const viewMode of ['full', 'reader']) {
      expect(compute(Article, 'shouldRenderMedia', {
        hasVideoMedia: true,
        shouldShowMinimalContent: false,
        selectionStore: { currentSelection: { viewMode } }
      })).toBe(true);
    }
    expect(compute(Article, 'shouldRenderMedia', {
      hasVideoMedia: true,
      shouldShowMinimalContent: true,
      selectionStore: { currentSelection: { viewMode: 'minimal' } }
    })).toBe(true);
    expect(compute(Article, 'shouldRenderMedia', {
      hasVideoMedia: false,
      selectionStore: { currentSelection: { viewMode: 'full' } }
    })).toBe(false);

    expect(compute(Article, 'eventArticleCountTotal', {
      event: { topicArticleCount: 8, articleCount: 3 },
      selectionStore: { currentSelection: { grouping: 'topic' } }
    })).toBe(8);
    expect(compute(Article, 'eventArticleCountTotal', {
      event: { articleCount: 3 },
      selectionStore: { currentSelection: { grouping: 'event' } }
    })).toBe(3);
    expect(compute(Article, 'eventArticleCountTotal', {
      event: null,
      selectionStore: { currentSelection: { grouping: 'none' } }
    })).toBe(0);
    expect(compute(Article, 'hasInterestScore', { interestScore: '0.25' })).toBe(true);
    expect(compute(Article, 'hasInterestScore', { interestScore: 'invalid' })).toBe(false);
    expect(compute(Article, 'favoriteLabel', { favoriteInd: 1 })).toBe('Unmark favorite');
    expect(compute(Article, 'favoriteLabel', { favoriteInd: 0 })).toBe('Mark as favorite');
    expect(compute(Article, 'statusToggleLabel', { status: 'read' })).toContain('unread');
    expect(compute(Article, 'statusToggleLabel', { status: 'unread' })).toContain('read');

    expect(compute(Article, 'feedFavicon', {
      feed: { favicon: 'direct.ico' },
      overviewStore: { categories: [] }
    })).toBe('direct.ico');
    expect(compute(Article, 'feedFavicon', {
      feed: { id: 7 },
      overviewStore: { categories: [{ feeds: [{ id: '7', favicon: 'stored.ico' }] }] }
    })).toBe('stored.ico');
    expect(compute(Article, 'feedFavicon', {
      feed: null,
      feedId: null,
      overviewStore: { categories: [] }
    })).toBe('');
  });

  it('covers score presentation boundaries and compact interaction guards', () => {
    const context = {
      id: 9,
      status: 'unread',
      swipeSuppressClick: false,
      isMinimalContentOpen: false,
      selectionStore: {
        currentSelection: { viewMode: 'minimal' },
        setTag: vi.fn(),
        selectCategory: vi.fn()
      },
      feed: { categoryId: 3 },
      $emit: vi.fn()
    };

    expect(Article.methods.scoreAsPercent('bad')).toBe(0);
    expect(Article.methods.scoreAsPercent(0.7)).toBe(70);
    expect(Article.methods.scoreAsPercent(72)).toBe(72);
    expect([95, 85, 75, 65, 50].map(Article.methods.getQualityClass)).toEqual([
      'quality-excellent', 'quality-good', 'quality-okay', 'quality-weak', 'quality-poor'
    ]);
    expect([95, 85, 75, 65, 50].map(Article.methods.scoreLabel)).toEqual([
      'Excellent', 'Good', 'Okay', 'Weak', 'Poor'
    ]);
    expect([55, 35, 10].map(Article.methods.getSentimentClass)).toEqual([
      'sentiment-moderate', 'sentiment-poor', 'sentiment-very-poor'
    ]);

    Article.methods.articleTouched.call(context, { target: document.body });
    expect(context.$emit).toHaveBeenCalledWith('minimal-article-opened', { id: 9, status: 'unread' });
    context.isMinimalContentOpen = true;
    Article.methods.articleTouched.call(context, { target: document.body });
    expect(context.$emit).toHaveBeenCalledWith('minimal-article-closed', { id: 9 });

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    context.swipeSuppressClick = true;
    Article.methods.articleTouched.call(context, { preventDefault, stopPropagation });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();

    Article.methods.toggleMinimalReadStatus.call(context);
    Article.methods.selectTag.call(context, { name: 'AI' });
    Article.methods.selectTag.call(context, null);
    Article.methods.selectCategory.call(context);
    expect(context.selectionStore.setTag).toHaveBeenLastCalledWith('');
    expect(context.selectionStore.selectCategory).toHaveBeenCalledWith(3);
  });

  it('covers remaining simple computed branches and quality icon boundaries', () => {
    expect(compute(Article, 'predictedAffinity', { presentation: { predictedAffinity: 'deep' } })).toBe('deep');
    expect(compute(Article, 'predictedAffinity', { presentation: null })).toBeNull();
    expect(compute(Article, 'isUnread', { status: 'unread' })).toBe(true);
    expect(compute(Article, 'isUnread', { status: 'read' })).toBe(false);
    expect(compute(Article, 'isGroupedView', {
      selectionStore: { currentSelection: { grouping: 'none' } }
    })).toBe(false);
    expect(compute(Article, 'isMinimalView', {
      selectionStore: { currentSelection: { viewMode: 'minimal' } }
    })).toBe(true);
    expect(compute(Article, 'shouldShowMinimalContent', {
      isMinimalView: true, isMinimalContentOpen: true, showMinimalContent: false
    })).toBe(true);
    expect(compute(Article, 'shouldShowMinimalContent', {
      isMinimalView: false, isMinimalContentOpen: false, showMinimalContent: true
    })).toBe(true);
    expect([95, 85, 75, 65, 50].map(Article.methods.getQualityIcon)).toEqual([
      'patch-check-fill', 'patch-check-fill', 'exclamation-circle-fill',
      'exclamation-triangle-fill', 'x-octagon-fill'
    ]);
  });
});

describe('ArticleReaderLayout high-impact decision coverage', () => {
  it('resolves every collection icon and title source', () => {
    const context = createReaderContext();
    const selections = [
      [{ smartFolderId: 5 }, 'folder-fill', 'Saved folder'],
      [{ tag: 'machine-learning' }, 'tag-fill', 'Machine-learning'],
      [{ status: 'briefing' }, 'sunrise-fill', 'Daily briefing'],
      [{ search: 'security' }, 'search', 'Search: security'],
      [{ feedId: '7', categoryId: '2' }, 'rss-fill', 'Feed seven'],
      [{ categoryId: '2' }, 'folder-fill', 'Technology'],
      [{ status: 'favorite' }, 'bookmark-fill', 'Favorites'],
      [{ status: 'unknown' }, 'collection-fill', 'All articles']
    ];
    context.overviewStore = {
      smartFolders: [{ id: 5, name: 'Saved folder' }],
      categories: [{ id: 2, name: 'Technology', feeds: [{ id: 7, feedName: 'Feed seven' }] }]
    };

    for (const [selectionOverrides, icon, title] of selections) {
      context.selectionStore.currentSelection = {
        smartFolderId: null,
        tag: '',
        status: 'unread',
        search: '',
        feedId: '%',
        categoryId: '%',
        ...selectionOverrides
      };
      expect(compute(ArticleReaderLayout, 'selectionIcon', context)).toBe(icon);
      expect(compute(ArticleReaderLayout, 'selectionTitle', context)).toBe(title);
    }
  });

  it('computes reader collection statistics and end-state decisions', () => {
    const articles = [
      { id: 1, status: 'unread', event: { id: 4 }, feedId: 2, tags: [{ name: 'AI' }, { name: 'Vue' }] },
      { id: 2, status: 'read', eventId: 4, feed: { id: 3 }, Tags: [{ name: 'AI' }, null] },
      { id: 3, status: 'read', eventId: 5, feedId: 2, tags: [{ name: 'News' }] }
    ];
    const context = createReaderContext({
      articles,
      container: articles,
      currentViewUnreadCount: 1234,
      distance: 3
    });

    expect(compute(ArticleReaderLayout, 'formattedUnreadCount', context)).toMatch(/1.?234/);
    expect(compute(ArticleReaderLayout, 'eventCount', context)).toBe(2);
    expect(compute(ArticleReaderLayout, 'sourceCount', context)).toBe(2);
    expect(compute(ArticleReaderLayout, 'topVisibleTags', context)).toEqual(['AI', 'News', 'Vue']);
    expect(compute(ArticleReaderLayout, 'hasReachedArticleListEnd', context)).toBe(true);
    expect(compute(ArticleReaderLayout, 'hasUnreadArticlesInCurrentView', context)).toBe(true);
    context.hasUnreadArticlesInCurrentView = true;
    expect(compute(ArticleReaderLayout, 'showReaderEndStateActions', context)).toBe(true);
    context.currentViewSourceCount = 9;
    expect(compute(ArticleReaderLayout, 'sourceCount', context)).toBe(9);
  });

  it('covers row text, preview, thumbnail, and similar-count fallbacks', () => {
    const context = createReaderContext();
    const longContent = `<p>${'word '.repeat(40)}</p>`;

    expect(context.feedName({ author: 'Author' })).toBe('Author');
    expect(context.feedName({ feed: { feedName: 'Feed' } })).toBe('Feed');
    expect(context.feedName({})).toBe('Unknown feed');
    expect(context.articlePreview({ contentSummary: longContent })).toMatch(/\.\.\.$/);
    expect(context.articlePreview({ contentSummaryBullets: ['One', 'Two'] })).toBe('One Two');
    expect(context.articlePreview({ contentHtml: '<p></p>' })).toBe('');
    expect(context.thumbnailUrl({ imageUrl: 'javascript:alert(1)', image: 'https://example.com/image.jpg' }))
      .toBe('https://example.com/image.jpg');
    expect(context.hasArticlePreview({ imageUrl: 'https://example.com/image.jpg' })).toBe(true);
    expect(context.hasArticlePreview({ description: 'Readable' })).toBe(true);
    expect(context.similarCount({ eventArticleCountTotal: 4 })).toBe(3);
    expect(context.similarCount({ eventArticleCountTotal: 1 })).toBe(0);
  });

  it('covers refs, selection, scrolling, menu positioning, and bulk actions', () => {
    vi.useFakeTimers();
    const listElement = { classList: { add: vi.fn(), remove: vi.fn() } };
    const itemElement = { focus: vi.fn(), scrollIntoView: vi.fn() };
    const context = createReaderContext({
      articles: [{ id: 1, status: 'unread' }, { id: 2, status: 'read' }],
      $refs: {
        articleListScrollRef: listElement,
        bulkMoreButton: { getBoundingClientRect: () => ({ left: -20, bottom: 50 }) }
      }
    });

    context.setArticleItemRef(itemElement, 1);
    context.selectArticle(1);
    expect(context.selectedArticleId).toBe(1);
    context.setArticleItemRef(itemElement, 2);
    context.selectArticleByIndex(1);
    expect(itemElement.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(context.$emit).toHaveBeenCalledWith('mark-previous-article-read', 1);
    context.handleArticleListScroll();
    vi.advanceTimersByTime(1000);
    expect(listElement.classList.remove).toHaveBeenCalledWith('is-scrolling');

    context.isBulkMenuOpen = true;
    context.updateBulkMenuPosition();
    expect(context.bulkMenuStyle).toEqual({ left: '12px', top: '58px' });
    context.runBulkAction('favorite-visible');
    expect(context.$emit).toHaveBeenCalledWith('bulk-action', {
      action: 'favorite-visible',
      selectedArticleId: 2
    });
    context.dismissReaderEndState();
    expect(context.isReaderEndStateDismissed).toBe(true);
    context.setArticleItemRef(null, 1);
    expect(context.articleItemRefs[1]).toBeUndefined();
    vi.useRealTimers();
  });

  it('routes all reader shortcuts and their guard conditions', () => {
    const context = createReaderContext({
      articles: [{ id: 1, status: 'unread' }, { id: 2, status: 'read' }],
      selectedArticleId: 1
    });
    Object.defineProperty(context, 'selectedArticle', {
      configurable: true,
      get() {
        return this.articles.find(article => article.id === this.selectedArticleId) || null;
      }
    });

    for (const key of ['ArrowDown', 'ArrowUp', 'o', 'm', 's']) {
      context.handleReaderKeydown({ key, target: document.body, preventDefault: vi.fn() });
    }
    expect(context.$emit).toHaveBeenCalledWith('shortcut-toggle-read', { id: 1, status: 'unread' });
    expect(context.$emit).toHaveBeenCalledWith('shortcut-toggle-favorite', { id: 1 });

    context.isBulkMenuOpen = true;
    context.handleReaderKeydown({ key: 'Escape', target: document.body });
    expect(context.isBulkMenuOpen).toBe(false);
    expect(context.shouldIgnoreKeyboardEvent({ target: document.createElement('input') })).toBe(true);
    expect(context.shouldIgnoreKeyboardEvent({ target: document.body })).toBe(false);
  });

  it('covers article and container watcher resets', () => {
    const context = createReaderContext({
      selectedArticleId: 99,
      isReaderEndStateDismissed: true,
      closeBulkMenu: vi.fn()
    });
    const articleHandler = ArticleReaderLayout.watch.articles.handler;

    articleHandler.call(context, []);
    expect(context.selectedArticleId).toBeNull();
    articleHandler.call(context, [{ id: 4 }]);
    expect(context.selectedArticleId).toBe(4);
    articleHandler.call(context, [{ id: 4 }, { id: 5 }]);
    expect(context.selectedArticleId).toBe(4);
    ArticleReaderLayout.watch.container.call(context);
    expect(context.isReaderEndStateDismissed).toBe(false);
    expect(context.closeBulkMenu).toHaveBeenCalledOnce();
  });
});

describe('ArticleListView high-impact decision coverage', () => {
  it('covers briefing, store projections, and end-state decisions', () => {
    const context = createListContext({
      articles: [{ status: 'unread' }],
      container: [{ id: 1 }],
      currentViewUnreadCount: 1,
      distance: 1
    });

    expect(compute(ArticleListView, 'showDailyBriefingIntro', context)).toBe(false);
    context.currentSelection = 'briefing';
    expect(compute(ArticleListView, 'showDailyBriefingIntro', context)).toBe(true);
    expect(compute(ArticleListView, 'mobileSearchOpen', context)).toBe(false);
    expect(compute(ArticleListView, 'unreadsSinceLastUpdate', context)).toBe(0);
    expect(compute(ArticleListView, 'hasReachedArticleListEnd', context)).toBe(true);
    expect(compute(ArticleListView, 'supportsArticleEndState', context)).toBe(true);
    context.hasReachedArticleListEnd = true;
    context.supportsArticleEndState = true;
    expect(compute(ArticleListView, 'showArticleEndState', context)).toBe(true);
    expect(compute(ArticleListView, 'hasUnreadArticlesInCurrentView', context)).toBe(true);
    context.currentSelection = 'unread';
    context.hasUnreadArticlesInCurrentView = true;
    expect(compute(ArticleListView, 'showArticleEndStateActions', context)).toBe(true);
  });

  it('covers ref cleanup, dismissal, flush, and watcher callbacks', () => {
    const context = createListContext({
      isArticleEndStateDismissed: true,
      focusSelectedMinimalArticle: vi.fn()
    });
    const component = { $el: document.createElement('article') };

    context.setMinimalArticleRef(component, 2);
    expect(context.minimalArticleRefs[2]).toBe(component);
    context.setMinimalArticleRef(null, 2);
    expect(context.minimalArticleRefs[2]).toBeUndefined();
    context.dismissArticleEndState();
    context.flushPool();
    expect(context.$emit).toHaveBeenCalledWith('flush-pool');
    ArticleListView.watch.container.call(context);
    expect(context.isArticleEndStateDismissed).toBe(false);
    ArticleListView.watch.articles.call(context);
    ArticleListView.watch.activeMinimalArticleId.call(context);
    expect(context.focusSelectedMinimalArticle).toHaveBeenCalledTimes(2);
  });
});

describe('SettingsActions high-impact decision coverage', () => {
  it('maps valid server actions and falls back for incomplete fields', async () => {
    fetchActions.mockResolvedValueOnce({
      data: {
        actions: [{ name: null, actionType: 'tag', regularExpression: null, tagValue: 'AI' }]
      }
    });
    const context = { ...SettingsActions.data(), ...SettingsActions.methods };

    await context.fetchActions();

    expect(context.loaded).toBe(true);
    expect(context.actions).toEqual([
      { name: '', actionType: 'tag', regularExpression: '', tagValue: 'AI' }
    ]);
    expect(context.actionTypeMeta('tag').label).toBe('Assign tag');
    expect(context.actionTypeMeta('missing').label).toBe('Select type');
  });

  it('covers editing guards, focus, removal, and successful persistence', async () => {
    saveActions.mockResolvedValueOnce({ data: { saved: true } });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const focus = vi.fn();
    const context = {
      ...SettingsActions.data(),
      ...SettingsActions.methods,
      loaded: true,
      actions: [null, { name: 'Keep', actionType: 'favorite' }, { name: 'Blank', actionType: ' ' }],
      $el: { querySelector: vi.fn(() => ({ focus })) },
      $emit: vi.fn()
    };

    context.focusActionName(1);
    expect(focus).toHaveBeenCalledOnce();
    context.addAction();
    expect(context.actions.at(-1)).toEqual({ name: '', actionType: '', regularExpression: '', tagValue: '' });
    context.removeAction(context.actions.length - 1);
    await context.save();

    expect(saveActions).toHaveBeenCalledWith([{ name: 'Keep', actionType: 'favorite' }]);
    expect(context.$emit).toHaveBeenCalledWith('saved');
    expect(context.$emit).toHaveBeenCalledWith('close');
    expect(context.saving).toBe(false);
    context.closeActionsModal();
    expect(context.showActionsModal).toBe(false);
  });

  it('rejects invalid load payloads and guarded editing operations', async () => {
    fetchActions.mockResolvedValueOnce({ data: { actions: 'invalid' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = {
      ...SettingsActions.data(),
      ...SettingsActions.methods,
      $el: { querySelector: vi.fn() }
    };

    await context.fetchActions();
    expect(context.loaded).toBe(false);
    expect(context.loadError).toContain('not been changed');
    context.addAction();
    context.removeAction(0);
    context.focusActionName(0);
    expect(context.actions).toEqual([]);
    expect(context.$el.querySelector).not.toHaveBeenCalled();
  });
});

describe('SmartFolderEditor high-impact decision coverage', () => {
  it('covers opposite status and event choices plus separator guards', async () => {
    const wrapper = mount(SmartFolderEditor, {
      props: {
        smartFolder: { name: 'Coverage', query: '', limitCount: 50 },
        aiEnabled: true
      },
      global: { stubs: { BootstrapIcon: true } }
    });
    const config = wrapper.vm.draftConfig;

    config.status.read = true;
    config.status.unread = true;
    wrapper.vm.onStatusFilterChange('read');
    expect(config.status.unread).toBe(false);
    config.events.isNotEvent = true;
    config.events.isEvent = true;
    config.events.useMinimumCount = true;
    wrapper.vm.onEventFilterChange('isNotEvent');
    expect(config.events).toMatchObject({
      isEvent: false,
      isNotEvent: true,
      useMinimumCount: false
    });

    const ordinaryKey = { key: 'x', preventDefault: vi.fn() };
    wrapper.vm.preventTagSeparator(ordinaryKey);
    expect(ordinaryKey.preventDefault).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await expect(wrapper.vm.copyGeneratedQuery()).resolves.toBeUndefined();
  });

  it('blocks both save paths while the generated query is invalid', () => {
    const wrapper = mount(SmartFolderEditor, {
      props: {
        smartFolder: { name: 'Invalid', query: 'unknown:value', limitCount: 50 },
        aiEnabled: false
      },
      global: { stubs: { BootstrapIcon: true } }
    });

    expect(wrapper.vm.generatedQueryInvalid).toBe(true);
    wrapper.vm.save();
    wrapper.vm.saveAsCopy();
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.emitted('save-copy')).toBeUndefined();
    expect(wrapper.emitted('validation-change')?.at(-1)).toEqual([true]);
  });

  it('executes the generated model handlers across every editor control group', async () => {
    const wrapper = mount(SmartFolderEditor, {
      props: {
        smartFolder: { name: 'Models', query: '', limitCount: 50 },
        aiEnabled: true
      },
      global: { stubs: { BootstrapIcon: true } }
    });

    for (const input of wrapper.findAll('input')) {
      const type = input.attributes('type');
      if (type === 'checkbox') {
        await input.setValue(!input.element.checked);
      } else if (type === 'number') {
        await input.setValue('3');
      } else {
        await input.setValue('coverage');
      }
    }

    for (const select of wrapper.findAll('select')) {
      const options = select.findAll('option');
      if (options.length) await select.setValue(options.at(-1).attributes('value'));
    }

    expect(wrapper.vm.generatedSmartFolderQuery).toContain('limit:');
  });
});

describe('Vue template handler coverage', () => {
  it('covers AppShell lookup, selection, notification, badge, and scroll branches', async () => {
    vi.useFakeTimers();
    const sidebarElement = { classList: { add: vi.fn(), remove: vi.fn() } };
    const context = {
      ...AppShell.data(),
      overviewStore: {
        categories: [{ id: 1, feeds: [{ id: 2, feedName: 'Feed' }] }]
      },
      selectionStore: { currentSelection: {} },
      uiStore: { setFatalError: vi.fn() },
      $refs: { sidebarScrollRef: sidebarElement },
      ...AppShell.methods,
      getOverview: vi.fn()
    };

    expect(context.lookupFeedById(2).feedName).toBe('Feed');
    expect(context.lookupFeedById(99)).toBeUndefined();
    expect(context.lookupCategoryById(1).id).toBe(1);
    expect(context.lookupCategoryById(99)).toBeUndefined();
    context.updateSelection({ categoryId: 1, feedId: 2 });
    expect(context.category.id).toBe(1);
    expect(context.feed.id).toBe(2);
    context.mobileClick('menu');
    expect(context.mobile).toBe('menu');
    context.completeOnboarding();
    expect(context.getOverview).toHaveBeenCalledWith(true);
    context.handleSidebarScroll();
    vi.advanceTimersByTime(1000);
    expect(sidebarElement.classList.remove).toHaveBeenCalledWith('is-scrolling');

    const setAppBadge = vi.fn();
    const clearAppBadge = vi.fn();
    Object.defineProperties(navigator, {
      serviceWorker: { configurable: true, value: {} },
      setAppBadge: { configurable: true, value: setAppBadge },
      clearAppBadge: { configurable: true, value: clearAppBadge }
    });
    context.setBadge(4.9);
    context.setBadge(0);
    expect(setAppBadge).toHaveBeenCalledWith(4);
    expect(clearAppBadge).toHaveBeenCalledOnce();

    const showNotification = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification }) }
    });
    vi.stubGlobal('Notification', { permission: 'granted' });
    await context.showNotification(3);
    expect(showNotification).toHaveBeenCalledWith('New articles', expect.objectContaining({
      body: '3 new articles arrived'
    }));
    vi.useRealTimers();
  });

  it('executes SettingsActions list model handlers and every load-state branch', async () => {
    fetchActions.mockResolvedValueOnce({
      data: {
        actions: [
          { name: 'Tag AI', actionType: 'tag', regularExpression: 'AI', tagValue: 'ai' },
          { name: '', actionType: '', regularExpression: '', tagValue: '' }
        ]
      }
    });
    const stores = createFocusedStores({ auth: { token: 'token' } });
    const wrapper = mount(SettingsActions, {
      global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } }
    });
    await flushPromises();

    for (const input of wrapper.findAll('input')) await input.setValue('coverage');
    for (const select of wrapper.findAll('select')) await select.setValue('favorite');
    for (const button of wrapper.findAll('.actions-edit-button')) await button.trigger('click');
    expect(wrapper.vm.actions[0]).toMatchObject({
      name: 'coverage', actionType: 'favorite', regularExpression: 'coverage'
    });

    await wrapper.setData({ loading: true });
    expect(wrapper.find('.actions-load-state').exists()).toBe(true);
    await wrapper.setData({ loading: false, loaded: false, loadError: 'Failed' });
    expect(wrapper.get('[role="alert"]').text()).toContain('Failed');
    await wrapper.setData({ loaded: true, loadError: '', actions: [] });
    expect(wrapper.get('.actions-empty-state').text()).toContain('No actions yet');
    await wrapper.setData({ saving: true });
    expect(wrapper.get('.actions-save-button').text()).toContain('Saving');
  });

  it('executes ArticleListView passthrough, empty-state, end-state, and refresh handlers', async () => {
    const stores = createFocusedStores({
      overview: { unreadsSinceLastUpdate: 1 },
      selection: { currentSelection: { categoryId: '%', feedId: '%', tag: '' } }
    });
    const article = { id: 1, title: 'List item', status: 'unread' };
    const wrapper = mount(ArticleListView, {
      props: {
        articles: [article],
        pool: new Set(),
        container: [article],
        currentSelection: 'unread',
        currentViewUnreadCount: 1,
        currentViewSourceCount: 1,
        viewMode: 'minimal',
        remainingItems: 0,
        fetchCount: 20,
        hasLoadedContent: true,
        isFlushed: true,
        distance: 1,
        activeMinimalArticleId: 1
      },
      global: {
        plugins: [stores.pinia],
        stubs: {
          Article: { name: 'Article', template: '<article tabindex="0">Article</article>' },
          ArticleEndState: { name: 'ArticleEndState', template: '<button class="mark-read" @click="$emit(\'mark-all-read\')">End</button>' },
          DailyBriefingIntro: true,
          UnreadSelectionContext: true
        }
      }
    });
    const child = wrapper.findComponent({ name: 'Article' });
    const events = [
      'update-favorite', 'update-clicked', 'minimal-article-opened', 'minimal-article-closed',
      'toggle-read-status', 'toggle-minimal-read-status', 'event-articles-loaded',
      'event-articles-collapsed', 'duplicate-articles-loaded', 'duplicate-articles-collapsed',
      'article-not-interested'
    ];
    for (const eventName of events) child.vm.$emit(eventName, { id: 1 });
    for (const eventName of events) expect(wrapper.emitted(eventName)).toBeTruthy();
    await wrapper.get('.clickable').trigger('click');
    expect(wrapper.emitted('forceReload')).toHaveLength(1);

    await wrapper.setProps({ viewMode: 'full' });
    await wrapper.vm.$nextTick();
    await wrapper.get('.mark-read').trigger('click');
    expect(wrapper.emitted('flush-pool')).toHaveLength(1);

    await wrapper.setProps({ articles: [], container: [] });
    await wrapper.vm.$nextTick();
    const empty = wrapper.findComponent({ name: 'ArticleEmptyState' });
    for (const eventName of ['clear-filters', 'clear-tag', 'refresh-feeds', 'open-smart-folders']) {
      empty.vm.$emit(eventName);
      expect(wrapper.emitted(eventName)).toBeTruthy();
    }
    empty.vm.$emit('view-tag-status', 'read');
    expect(wrapper.emitted('view-tag-status')).toBeTruthy();
  });

  it('executes UpdateFeed model handlers across error, processing, and organization fields', async () => {
    const feed = {
      id: 10,
      categoryId: 1,
      feedName: 'Feed',
      feedDesc: 'Description',
      url: 'https://example.com/feed',
      status: 'error',
      errorSince: '2026-01-01',
      errorCount: 2,
      errorMessage: 'Unavailable',
      feedTags: []
    };
    const stores = createFocusedStores({
      auth: { token: 'token' },
      overview: {
        categories: [{ id: 1, name: 'News', feeds: [feed] }, { id: 2, name: 'Tech', feeds: [] }]
      },
      selection: { currentSelection: { feedId: '10', AIEnabled: true } }
    });
    const wrapper = mount(UpdateFeed, {
      global: { plugins: [stores.pinia], stubs: { BaseDialog: false } }
    });
    await flushPromises();

    for (const input of wrapper.findAll('input')) await input.setValue('coverage');
    for (const select of wrapper.findAll('select')) {
      const options = select.findAll('option');
      if (options.length) await select.setValue(options.at(-1).attributes('value'));
    }
    expect(wrapper.vm.feed.feedName).toBe('coverage');
    expect(wrapper.vm.feedTagsInput).toBe('coverage');

    await wrapper.setData({ rediscoveredRss: { url: 'https://example.com/new', confidence: 90, reason: 'Found' } });
    expect(wrapper.text()).toContain('Suggested feed found');
    await wrapper.setData({ rediscoveredRss: { url: '', confidence: 20, reason: 'Missing' } });
    expect(wrapper.text()).toContain('No feed found');
    await wrapper.setData({ deleting: true });
    expect(wrapper.get('.update-feed__delete').text()).toContain('Deleting');
  });

  it('routes rich Article child events and compact row controls', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const stores = createFocusedStores({
      overview: {
        categories: [{ id: 2, name: 'Technology', feeds: [{ id: 7, favicon: 'feed.ico' }] }]
      },
      selection: {
        currentSelection: { viewMode: 'full', grouping: 'event' },
        setTag: vi.fn(),
        selectCategory: vi.fn()
      }
    });
    const emitterStub = {
      name: 'EmitterStub',
      template: '<button class="emitter-stub" type="button">Child</button>'
    };
    const wrapper = mount(Article, {
      props: {
        id: 11,
        url: 'https://example.com/article',
        title: 'Coverage article',
        publishedAt: '2026-07-31T10:00:00Z',
        feed: { id: 7, categoryId: 2, feedName: 'Feed' },
        status: 'unread',
        favoriteInd: 1,
        hotInd: 1,
        clickedAmount: 2,
        contentHtml: '<p>Article body</p>',
        imageUrl: 'https://example.com/image.jpg',
        media: { type: 'video', url: 'https://example.com/video' },
        event: { id: 4, articleCount: 3, sourceCount: 2 },
        duplicateCount: 2,
        tags: [{ id: 1, name: 'AI', tagType: 'rule' }],
        quality: 0.9,
        advertisementScore: 20,
        sentimentScore: 30,
        qualityScore: 40,
        isDevelopingStory: true,
        isOfficialSource: true,
        officialOrganization: 'Example Org',
        interestScore: 0.7
      },
      global: {
        plugins: [stores.pinia],
        stubs: {
          ArticleActionsMenu: emitterStub,
          ArticleContent: emitterStub,
          ArticleHeader: emitterStub,
          ArticleMedia: emitterStub,
          ArticleMeta: emitterStub,
          ArticleTagsScores: emitterStub
        }
      }
    });
    const components = wrapper.findAllComponents(emitterStub);

    const eventMap = {
      'article-clicked': 'articleClicked',
      'media-clicked': 'articleClicked',
      'toggle-favorite': 'markAsFavorite',
      'not-interested': 'markNotInterested',
      'more-like-this': 'moreLikeThis',
      'less-like-this': 'lessLikeThis',
      'ignore-topic': 'ignoreTopic',
      'mute-feed': 'muteFeedSevenDays',
      'select-category': 'selectCategory',
      'select-tag': 'selectTag',
      'view-event-articles': 'viewEventArticles',
      'view-duplicate-articles': 'viewDuplicateArticles'
    };
    for (const component of components) {
      for (const eventName of Object.keys(eventMap)) component.vm.$emit(eventName, { name: 'AI' });
    }
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.emitted('update-clicked')).toBeTruthy();
    expect(wrapper.emitted('update-favorite')).toBeTruthy();
    wrapper.findComponent({ name: 'EmitterStub' }).vm.$emit('toggle-read-status');
    expect(wrapper.emitted('toggle-read-status')).toEqual([[{ id: 11, status: 'unread' }]]);

    stores.selectionStore.currentSelection.viewMode = 'minimal';
    await wrapper.vm.$nextTick();
    await wrapper.get('.article-list-status').trigger('click');
    expect(wrapper.emitted('toggle-minimal-read-status')).toEqual([[{ id: 11, status: 'unread' }]]);
    wrapper.unmount();
  });

  it('routes reader template events, bulk menu actions, tags, and refresh paths', async () => {
    const stores = createFocusedStores({
      overview: {
        categories: [],
        smartFolders: [],
        unreadsSinceLastUpdate: 2
      },
      selection: {
        currentSelection: {
          status: 'unread', categoryId: '%', feedId: '%', smartFolderId: null, tag: '', search: ''
        },
        setCurrentSelection: vi.fn()
      }
    });
    const article = {
      id: 1,
      title: 'Reader article',
      url: 'https://example.com/reader',
      status: 'unread',
      favoriteInd: 1,
      hotInd: 1,
      isDevelopingStory: true,
      description: 'Preview',
      eventArticleCountTotal: 3,
      tags: [{ name: 'AI' }],
      feed: { id: 2, feedName: 'Feed' }
    };
    const wrapper = mount(ArticleReaderLayout, {
      props: {
        articles: [article],
        container: [article],
        currentSelection: 'unread',
        currentViewUnreadCount: 1,
        currentViewSourceCount: 1,
        remainingItems: 0,
        fetchCount: 20,
        hasLoadedContent: true,
        isFlushed: true,
        distance: 1
      },
      global: {
        plugins: [stores.pinia],
        stubs: {
          Article: {
            name: 'Article',
            template: '<a class="article-link" href="#">Article</a>'
          },
          ArticleEndState: {
            name: 'ArticleEndState',
            template: '<button class="end-mark" @click="$emit(\'mark-all-read\')">End</button>'
          },
          DailyBriefingIntro: true,
          UnreadSelectionContext: true
        }
      }
    });

    await wrapper.get('.bulk-more-button').trigger('click');
    for (const button of wrapper.findAll('.bulk-action-menu-item')) await button.trigger('click');
    await wrapper.get('.article-list-bulk-tag').trigger('click');
    await wrapper.get('.readerArticleListItem').trigger('keydown', { key: 'Enter' });
    await wrapper.get('.clickable').trigger('click');
    expect(stores.selectionStore.setCurrentSelection).toHaveBeenCalledWith({ tag: 'AI' });
    expect(wrapper.emitted('bulk-action')).toBeTruthy();
    expect(wrapper.emitted('forceReload')).toHaveLength(1);

    const articleComponent = wrapper.findComponent({ name: 'Article' });
    const passthroughEvents = [
      'update-favorite', 'update-clicked', 'toggle-read-status', 'event-articles-loaded',
      'event-articles-collapsed', 'duplicate-articles-loaded', 'duplicate-articles-collapsed',
      'article-not-interested'
    ];
    for (const eventName of passthroughEvents) articleComponent.vm.$emit(eventName, { id: 1 });
    for (const eventName of passthroughEvents) expect(wrapper.emitted(eventName)).toBeTruthy();
    wrapper.unmount();
  });

  it('renders and routes AppShell desktop, mobile, error, dialog, and content states', async () => {
    vi.useFakeTimers();
    document.head.innerHTML = '<meta name="viewport"><meta http-equiv="X-UA-Compatible">';
    const stores = createFocusedStores({
      overview: {
        categories: [{ id: 1, name: 'News', feeds: [] }],
        fetchOverviewSplit: vi.fn().mockResolvedValue()
      },
      ui: {
        chatAssistantOpen: false,
        fatalError: null,
        showModal: '',
        setFatalError: vi.fn(),
        clearFatalError: vi.fn()
      }
    });
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
    const wrapper = mount(AppShell, {
      global: {
        plugins: [stores.pinia],
        stubs: {
          ActionErrorNotice: { template: '<button class="notice" @click="$emit(\'dismiss\')">Notice</button>' },
          appArticleFeed: { template: '<button class="feed" @click="$emit(\'forceReload\')">Feed</button>' },
          appChatAssistant: { template: '<div class="chat">Chat</div>' },
          appDesktopToolbar: { template: '<button class="desktop" @click="$emit(\'forceReload\')">Desktop</button>' },
          appError: { template: '<button class="error" @click="$emit(\'retry\')">Error</button>' },
          appInitialFeeds: { template: '<button class="onboarding" @click="$emit(\'completed\')">Onboarding</button>' },
          appMobileMenuOverlay: { template: '<button class="mobile-menu" @click="$emit(\'refresh\')">Menu</button>' },
          appMobileToolbar: { template: '<button class="mobile-toolbar" @click="$emit(\'mobile\', true)">Mobile</button>' },
          appSidebar: {
            template: '<button class="sidebar" @click="$emit(\'logout\')">Sidebar</button>',
            methods: { refreshFeeds: vi.fn() }
          }
        }
      }
    });
    await flushPromises();

    wrapper.vm.overviewLoaded = true;
    await wrapper.vm.$nextTick();
    await wrapper.get('.sidebar').trigger('click');
    expect(wrapper.emitted('logout')).toHaveLength(1);
    wrapper.vm.showActionError('Recoverable');
    await wrapper.vm.$nextTick();
    await wrapper.get('.notice').trigger('click');
    expect(wrapper.vm.actionErrorMessage).toBe('');

    stores.uiStore.fatalError = { type: 'overview' };
    await wrapper.vm.$nextTick();
    await wrapper.get('.error').trigger('click');
    stores.uiStore.fatalError = null;
    stores.uiStore.chatAssistantOpen = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.chat').exists()).toBe(true);

    stores.uiStore.chatAssistantOpen = false;
    wrapper.vm.handleResponsiveShellChange({ matches: false });
    await wrapper.vm.$nextTick();
    await wrapper.get('.mobile-toolbar').trigger('click');
    await wrapper.get('.mobile-menu').trigger('click');
    expect(wrapper.vm.mobile).toBe(true);

    stores.overviewStore.categories = [];
    await wrapper.vm.$nextTick();
    await wrapper.get('.onboarding').trigger('click');
    expect(stores.overviewStore.fetchOverviewSplit).toHaveBeenCalled();
    wrapper.unmount();
    vi.useRealTimers();
  });
});
