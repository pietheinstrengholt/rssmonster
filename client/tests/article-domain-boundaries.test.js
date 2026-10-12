import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Article from '../src/components/articles/Article.vue';
import {
  fetchDuplicateArticles,
  markAsSaved,
  markOpenedOriginal,
  markNotInterested
} from '../src/api/articles.js';
import { fetchEventArticles } from '../src/api/events.js';

import { articleActionMethods } from '../src/components/articles/helpers/articleActions.js';
import {
  createArticleExpansionState,
  articleExpansionMethods
} from '../src/components/articles/helpers/articleExpansion.js';
import {
  articleSignalComputed,
  createArticleSignals,
  getEventSourceScore,
  hasHighQualityArticleSignal,
  hasTrustedSourceSignal
} from '../src/components/articles/helpers/articleSignals.js';
import {
  createArticleMobileSwipeState,
  articleMobileSwipeMethods
} from '../src/components/articles/helpers/mobileSwipe.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchDuplicateArticles: vi.fn(),
  markAsSaved: vi.fn(),
  markOpenedOriginal: vi.fn(),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn(),
  updateOpenedOriginalStatus: vi.fn()
}));

vi.mock('../src/api/events.js', () => ({
  fetchEventArticles: vi.fn()
}));

vi.mock('../src/api/feeds.js', () => ({
  muteFeed: vi.fn()
}));

// Creates swipe state with the component methods bound as Vue would expose them.
function createSwipeContext() {
  const context = {
    ...createArticleMobileSwipeState(),
    isMobilePortrait: true,
    markAsSaved: vi.fn()
  };
  context.resetSwipe = clearSuppressClick =>
    articleMobileSwipeMethods.resetSwipe.call(context, clearSuppressClick);
  return context;
}

// Creates related-article expansion state for the requested grouping.
function createExpansionContext(grouping = 'event') {
  const stores = createFocusedStores({
    selection: {
      currentSelection: { grouping }
    }
  });
  return {
    ...stores,
    ...createArticleExpansionState(),
    id: 42,
    $emit: vi.fn()
  };
}

// Mounts an article with the minimal store and child-component surface.
function mountArticle(props = {}) {
  const stores = createFocusedStores({
    overview: {
      categories: []
    },
    selection: {
      currentSelection: {
        grouping: 'event',
        viewMode: 'expanded'
      }
    }
  });
  return shallowMount(Article, {
    props: {
      id: 42,
      title: 'Signal article',
      url: 'https://example.com/article',
      feed: { feedName: 'Example Feed' },
      ...props
    },
    global: {
      plugins: [stores.pinia],
      stubs: {
        ArticleActionsMenu: true,
        ArticleContent: true,
        ArticleHeader: true,
        ArticleMedia: true,
        ArticleMeta: true,
        ArticleTagsScores: true,
        BootstrapIcon: true
      }
    }
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Article recommendation context', () => {
  it.each([
    [{ status: 'briefing', sort: 'desc', search: '' }, true],
    [{ status: 'unread', sort: 'recommended', search: '' }, true],
    [{ status: 'unread', sort: 'desc', search: 'tag:ai sort:recommended' }, true],
    [{ status: 'unread', sort: 'desc', search: 'tag:ai' }, false]
  ])('detects recommendation-ranked selections', (currentSelection, expected) => {
    expect(Article.computed.isRecommendationView.call({
      selectionStore: { currentSelection }
    })).toBe(expected);
  });
});

describe('Article mobile swipe behavior', () => {
  it.each(['start', 'move', 'end'])('does not bookmark when zoomed at touch %s', stage => {
    const viewport = { scale: stage === 'start' ? 2 : 1 };
    vi.stubGlobal('visualViewport', viewport);
    try {
      const context = createSwipeContext();
      articleMobileSwipeMethods.onSwipeTouchStart.call(context, {
        touches: [{ clientX: 10, clientY: 20 }]
      });
      if (stage === 'move') viewport.scale = 2;
      const move = {
        touches: [{ clientX: 210, clientY: 20 }],
        cancelable: true,
        preventDefault: vi.fn()
      };
      articleMobileSwipeMethods.onSwipeTouchMove.call(context, move);
      if (stage !== 'end') expect(move.preventDefault).not.toHaveBeenCalled();
      viewport.scale = 2;
      articleMobileSwipeMethods.onSwipeTouchEnd.call(context);
      expect(context.markAsSaved).not.toHaveBeenCalled();
      expect(context.swipeTranslateX).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resets swipe state when the shared portrait query stops matching', () => {
    const context = createSwipeContext();
    context.resetSwipe = vi.fn();

    Article.watch.isMobilePortrait.call(context, true);
    expect(context.resetSwipe).not.toHaveBeenCalled();

    Article.watch.isMobilePortrait.call(context, false);
    expect(context.resetSwipe).toHaveBeenCalledOnce();
  });

  it('caps horizontal movement and saved after crossing the threshold', () => {
    vi.useFakeTimers();
    const context = createSwipeContext();
    const preventDefault = vi.fn();

    articleMobileSwipeMethods.onSwipeTouchStart.call(context, {
      touches: [{ clientX: 10, clientY: 20 }]
    });
    articleMobileSwipeMethods.onSwipeTouchMove.call(context, {
      touches: [{ clientX: 210, clientY: 25 }],
      cancelable: true,
      preventDefault
    });

    expect(context.swipeTranslateX).toBe(128);
    expect(preventDefault).toHaveBeenCalledOnce();

    articleMobileSwipeMethods.onSwipeTouchEnd.call(context);

    expect(context.markAsSaved).toHaveBeenCalledOnce();
    expect(context.swipeTranslateX).toBe(0);
    expect(context.swipeSuppressClick).toBe(true);

    vi.advanceTimersByTime(250);
    expect(context.swipeSuppressClick).toBe(false);
  });

  it('cancels an unlocked swipe when vertical movement wins', () => {
    const context = createSwipeContext();

    articleMobileSwipeMethods.onSwipeTouchStart.call(context, {
      touches: [{ clientX: 20, clientY: 20 }]
    });
    articleMobileSwipeMethods.onSwipeTouchMove.call(context, {
      touches: [{ clientX: 30, clientY: 80 }],
      cancelable: true,
      preventDefault: vi.fn()
    });

    expect(context.swipeTracking).toBe(false);
    expect(context.swipeTranslateX).toBe(0);
    expect(context.markAsSaved).not.toHaveBeenCalled();
  });
});

describe('Article related-article expansion', () => {
  it('uses the event endpoint and emits server-ordered related articles', async () => {
    fetchEventArticles.mockResolvedValue({
      data: { articles: [{ id: 43 }, { id: 44 }] }
    });
    const context = createExpansionContext('event');

    articleExpansionMethods.viewEventArticles.call(context, 9);
    await flushPromises();

    expect(fetchEventArticles).toHaveBeenCalledWith(9, 42);
    expect(context.$emit).toHaveBeenCalledWith('event-articles-loaded', {
      articleId: 42,
      eventId: 9,
      articles: [{ id: 43 }, { id: 44 }]
    });
    expect(context.eventExpanded).toBe(true);
  });

  it('collapses loaded duplicates without making another request', () => {
    const context = createExpansionContext();
    context.duplicatesExpanded = true;

    articleExpansionMethods.viewDuplicateArticles.call(context);

    expect(fetchDuplicateArticles).not.toHaveBeenCalled();
    expect(context.$emit).toHaveBeenCalledWith(
      'duplicate-articles-collapsed',
      { articleId: 42 }
    );
    expect(context.duplicatesExpanded).toBe(false);
  });
});

describe('Article relevance signals', () => {
  it('classifies explicit article inputs without a Vue component instance', () => {
    const article = {
      author: 'Reporter',
      event: { sourceCount: '5' },
      feed: { feedName: 'Trusted Feed', feedTrust: '0.9' },
      isOfficialSource: false,
      quality: 0.91,
      recommendationScore: 0
    };

    expect(createArticleSignals(article)).toEqual([
      { label: 'High overall quality', icon: 'stars' },
      { label: 'Trending', icon: 'graph-up-arrow' },
      { label: 'Trusted source (Trusted Feed)', icon: 'shield-fill-check' }
    ]);
    expect(hasHighQualityArticleSignal(article)).toBe(true);
    expect(hasTrustedSourceSignal(article.feed)).toBe(true);
    expect(getEventSourceScore({ sourceCount: 'invalid' })).toBe(0);
  });

  it('prioritizes major events and official sources over lower-tier signals', () => {
    const wrapper = mountArticle({
      quality: 0.95,
      recommendationScore: 0.92,
      isOfficialSource: true,
      officialOrganization: 'Public Agency',
      author: 'Reporter',
      feed: {
        feedName: 'Trusted Feed',
        feedTrust: 0.99
      },
      event: {
        articleCount: 8,
        sourceCount: 7
      }
    });

    expect(wrapper.findAll('.signal-badge').at(-1).attributes('title')).toContain(
      'Article URL matches a configured official-source domain.'
    );
    expect(wrapper.vm.articleSignals).toEqual([
      { label: 'High overall quality', icon: 'stars' },
      { label: 'Major event', icon: 'broadcast' },
      {
        label: 'Official source (Public Agency)',
        icon: 'patch-check-fill',
        description: 'Article URL matches a configured official-source domain. This label does not verify provenance or independent reporting.'
      }
    ]);
  });
});

describe('Article API actions', () => {
  it('reconciles saved counts and emits the existing update payload', async () => {
    markAsSaved.mockResolvedValue({
      data: {
        feedId: 3,
        feed: { categoryId: 2 },
        savedInd: 1
      }
    });
    const applySavedDelta = vi.fn();
    const context = {
      ...createFocusedStores({
        overview: { applySavedDelta }
      }),
      id: 42,
      savedInd: 0,
      savedMutationPending: false,
      $emit: vi.fn()
    };

    articleActionMethods.markAsSaved.call(context);
    await flushPromises();

    expect(markAsSaved).toHaveBeenCalledWith(42, 'mark', expect.objectContaining({ id: expect.any(Number) }));
    expect(applySavedDelta).toHaveBeenCalledWith({
      categoryId: 2,
      feedId: 3,
      delta: 1
    });
    expect(context.$emit).toHaveBeenCalledWith(
      'update-saved',
      { id: 42, savedInd: 1 }
    );
  });

  it('guards duplicate saved requests and applies one persisted transition', async () => {
    let resolveSaved;
    const pendingSaved = new Promise(resolve => {
      resolveSaved = resolve;
    });
    markAsSaved.mockReturnValue(pendingSaved);
    const applySavedDelta = vi.fn();
    const context = {
      ...createFocusedStores({
        overview: { applySavedDelta }
      }),
      id: 42,
      savedInd: 0,
      savedMutationPending: false,
      $emit: vi.fn()
    };

    const firstMutation = articleActionMethods.markAsSaved.call(context);
    const secondMutation = articleActionMethods.markAsSaved.call(context);

    expect(markAsSaved).toHaveBeenCalledOnce();
    expect(context.savedMutationPending).toBe(true);

    resolveSaved({
      data: {
        feedId: 3,
        feed: { categoryId: 2 },
        savedInd: 1
      }
    });
    await Promise.all([firstMutation, secondMutation]);

    expect(applySavedDelta).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledOnce();
    expect(context.savedMutationPending).toBe(false);
  });

  it('updates clicks but keeps articles in place after negative feedback', async () => {
    markOpenedOriginal.mockResolvedValue({ data: { openedOriginalCount: 4 } });
    markNotInterested.mockResolvedValue({});
    const context = {
      id: 42,
      openedOriginalCount: 3,
      openedOriginalMutationPending: false,
      $emit: vi.fn()
    };

    articleActionMethods.articleOpenedOriginal.call(context);
    articleActionMethods.markNotInterested.call(context);
    await flushPromises();

    expect(markOpenedOriginal).toHaveBeenCalledWith(42);
    expect(markNotInterested).toHaveBeenCalledWith(42);
    expect(context.$emit).toHaveBeenCalledWith(
      'update-opened-original',
      { id: 42, openedOriginalCount: 4 }
    );
    expect(context.$emit).not.toHaveBeenCalledWith(
      'article-not-interested',
      { id: 42 }
    );
  });

  it('does not emit a fabricated click count when persistence fails', async () => {
    markOpenedOriginal.mockRejectedValue(new Error('offline'));
    const context = {
      id: 42,
      openedOriginalCount: 5,
      openedOriginalMutationPending: false,
      $emit: vi.fn()
    };

    await articleActionMethods.articleOpenedOriginal.call(context);

    expect(context.$emit).not.toHaveBeenCalled();
    expect(context.openedOriginalMutationPending).toBe(false);
  });

  it('keeps extracted behavior on the Article Options API surface', () => {
    expect(Article.methods.onSwipeTouchMove)
      .toBe(articleMobileSwipeMethods.onSwipeTouchMove);
    expect(Article.methods.viewEventArticles)
      .toBe(articleExpansionMethods.viewEventArticles);
    expect(Article.methods.markAsSaved)
      .toBe(articleActionMethods.markAsSaved);
    expect(Article.computed.articleSignals)
      .toBe(articleSignalComputed.articleSignals);
  });
});
