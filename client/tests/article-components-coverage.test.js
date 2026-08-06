import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchDuplicateArticles } from '../src/api/articles.js';
import { fetchEventArticles } from '../src/api/events.js';
import { fetchTopicArticles } from '../src/api/topics.js';
import ArticleActionsMenu from '../src/components/articles/ArticleActionsMenu.vue';
import ArticleContent from '../src/components/articles/ArticleContent.vue';
import ArticleHeader from '../src/components/articles/ArticleHeader.vue';
import {
  articleExpansionMethods,
  createArticleExpansionState
} from '../src/components/articles/helpers/articleExpansion.js';
import { articleSignalComputed } from '../src/components/articles/helpers/articleSignals.js';
import {
  articleMobileSwipeComputed,
  articleMobileSwipeMethods,
  createArticleMobileSwipeState
} from '../src/components/articles/helpers/mobileSwipe.js';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchDuplicateArticles: vi.fn()
}));

vi.mock('../src/api/events.js', () => ({
  fetchEventArticles: vi.fn()
}));

vi.mock('../src/api/topics.js', () => ({
  fetchTopicArticles: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

const ARTICLE_TYPOGRAPHY_FIXTURE = `
  <h1>Heading one</h1><h2>Heading two</h2><h3>Heading three</h3>
  <h4>Heading four</h4><h5>Heading five</h5><h6>Heading six</h6>
  <p>Paragraph with <strong>strong text</strong>, <em>emphasized text</em>, and
    <a href="https://example.com/a/very/long/publisher/path/that/must/wrap/without-breaking-the-reader">a long publisher URL</a>.</p>
  <ul><li>First item<ol><li>Nested item</li></ol></li></ul>
  <blockquote><p>Quoted publisher text.</p></blockquote>
  <p>Use <code>inlineCode()</code> in prose.</p>
  <pre><code>const example = "a deliberately wide block of publisher code";</code></pre>
  <table><caption>Publisher data</caption><thead><tr><th>Column</th><th>Value</th></tr></thead>
    <tbody><tr><td>Long cell</td><td>Value</td></tr></tbody></table>
  <figure><img src="https://example.com/figure.jpg" alt="Fixture image"><figcaption>Fixture caption</figcaption></figure>
  <hr><p><strong>Malformed ending <em>repaired by the browser parser.</p>
  <figure class="rssmonster-embed" data-provider="youtube" data-video-id="gZUDEBbZSp4"></figure>
`;

// Mounts article content with representative full-view defaults.
const mountArticleContent = (props = {}) => mount(ArticleContent, {
  props: {
    viewMode: 'full',
    content: '<p>Readable article content.</p>',
    ...props
  }
});

// Creates related-article expansion state for the requested grouping.
const createExpansionContext = (grouping = 'event') => {
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
};

// Creates swipe state with reset behavior bound as Vue exposes it.
const createSwipeContext = (overrides = {}) => {
  const context = {
    ...createArticleMobileSwipeState(),
    markAsFavorite: vi.fn(),
    handleMediaChange: vi.fn(),
    ...overrides
  };
  context.resetSwipe = vi.fn(clearSuppressClick =>
    articleMobileSwipeMethods.resetSwipe.call(context, clearSuppressClick));
  return context;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ArticleActionsMenu', () => {
  // Verifies every menu command preserves the parent-facing event contract.
  it('labels favorite state and emits every available action', async () => {
    const wrapper = mount(ArticleActionsMenu, {
      props: { favoriteInd: 1 },
      global: { stubs: { BootstrapIcon: BootstrapIconStub } }
    });
    const items = wrapper.findAll('[role="menuitem"]');

    expect(items.map(item => item.text())).toEqual([
      'Unmark favorite',
      'Not Interested',
      'More like this',
      'Less like this',
      'Ignore this topic',
      'Mute Feed for 7 Days'
    ]);
    expect(items.every(item => item.element.tagName === 'BUTTON')).toBe(true);
    expect(items.every(item => item.attributes('role') === 'menuitem')).toBe(true);

    for (const item of items) {
      await item.trigger('click');
    }

    expect(wrapper.emitted('toggle-favorite')).toEqual([[]]);
    expect(wrapper.emitted('not-interested')).toEqual([[]]);
    expect(wrapper.emitted('more-like-this')).toEqual([[]]);
    expect(wrapper.emitted('less-like-this')).toEqual([[]]);
    expect(wrapper.emitted('ignore-topic')).toEqual([[]]);
    expect(wrapper.emitted('mute-feed')).toEqual([[]]);
  });

  // Verifies an unfavorited article uses the marking label.
  it('offers to mark an unfavorited article', () => {
    const wrapper = mount(ArticleActionsMenu, {
      global: { stubs: { BootstrapIcon: BootstrapIconStub } }
    });

    expect(wrapper.get('[role="menuitem"]').text()).toBe('Mark as favorite');
  });

});

describe('ArticleContent presentation', () => {
  // Verifies the publisher typography fixture retains every supported semantic structure.
  it('renders the representative sanitized publisher typography fixture', () => {
    const wrapper = mountArticleContent({ content: ARTICLE_TYPOGRAPHY_FIXTURE });
    const content = wrapper.get('.article-full-content');

    expect(content.findAll('h1, h2, h3, h4, h5, h6')).toHaveLength(6);
    expect(content.findAll('ul > li > ol > li')).toHaveLength(1);
    expect(content.get('blockquote').text()).toBe('Quoted publisher text.');
    expect(content.get('p code').text()).toBe('inlineCode()');
    expect(content.get('pre code').text()).toContain('deliberately wide block');
    expect(content.get('table caption').text()).toBe('Publisher data');
    expect(content.get('figure figcaption').text()).toBe('Fixture caption');
    expect(content.get('img').attributes('loading')).toBe('lazy');
    expect(content.get('hr').exists()).toBe(true);
    expect(content.get('iframe.rssmonster-youtube-frame').attributes('src'))
      .toBe('https://www.youtube.com/embed/gZUDEBbZSp4');
    expect(content.text()).toContain('Malformed ending repaired by the browser parser.');
  });

  // Verifies summary modes limit their content and provide an empty fallback.
  it('renders summarized text and bounded summary bullets', async () => {
    const summarized = mountArticleContent({
      viewMode: 'summarized',
      content: `<p>${Array.from({ length: 105 }, (_, index) => `word${index}`).join(' ')}</p>`
    });
    expect(summarized.get('p').text().split(' ')).toHaveLength(100);

    await summarized.setProps({
      viewMode: 'summaryBullets',
      contentSummaryBullets: ['First', 'Second', 'Third'],
      visibleBulletCount: 2
    });
    expect(summarized.findAll('li').map(item => item.text())).toEqual(['First', 'Second']);

    await summarized.setProps({ contentSummaryBullets: [] });
    expect(summarized.get('p').text()).toBe('No summary available.');
  });

  // Verifies minimal content remains opt-in and null sentinel content stays hidden.
  it('honors minimal visibility and the null-content sentinel', async () => {
    const wrapper = mountArticleContent({
      viewMode: 'minimal',
      showMinimalContent: false
    });

    expect(wrapper.find('.article-content-wrapper').exists()).toBe(false);
    await wrapper.setProps({ showMinimalContent: true });
    expect(wrapper.get('.article-full-content').text()).toBe('Readable article content.');
    await wrapper.setProps({
      viewMode: 'full',
      content: '<html><head></head><body>null</body></html>'
    });
    expect(wrapper.find('.article-full-content').exists()).toBe(false);
  });

  // Verifies persisted dimensions select the intended lead-image layouts.
  it.each([
    [1200, 600, 'hero', false],
    [600, 900, 'portrait', true],
    [200, 160, 'thumbnail', true],
    [1, 1, 'hidden', false]
  ])('classifies a %sx%s lead image as %s', (width, height, mode, isInline) => {
    const wrapper = mountArticleContent({
      imageUrl: 'https://example.com/lead.jpg',
      imageWidth: width,
      imageHeight: height
    });

    expect(wrapper.vm.imageDisplayMode).toBe(mode);
    expect(wrapper.vm.isInlineLeadImage).toBe(isInline);
    expect(wrapper.find('.article-lead-image').exists()).toBe(mode !== 'hidden');
  });

  // Verifies unknown dimensions use a capped pending thumbnail.
  it('uses a pending thumbnail until natural dimensions are known', () => {
    const wrapper = mountArticleContent({
      imageUrl: 'https://example.com/lead.jpg'
    });

    expect(wrapper.vm.leadImageDimensions).toEqual({ width: 0, height: 0 });
    expect(wrapper.vm.imageDisplayMode).toBe('pending');
    expect(wrapper.get('.article-lead-image').attributes('style'))
      .toContain('--lead-thumbnail-width: 200px');
  });

  // Verifies image load and failure events update runtime presentation state.
  it('uses natural dimensions after load and hides a failed image', async () => {
    const wrapper = mountArticleContent({
      imageUrl: 'https://example.com/lead.jpg'
    });
    const image = wrapper.get('img');
    Object.defineProperty(image.element, 'naturalWidth', { value: 900 });
    Object.defineProperty(image.element, 'naturalHeight', { value: 450 });

    await image.trigger('load');
    expect(wrapper.vm.leadImageDimensions).toEqual({ width: 900, height: 450 });
    expect(wrapper.vm.imageDisplayMode).toBe('hero');

    await image.trigger('error');
    expect(wrapper.vm.imageDisplayMode).toBe('hidden');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  // Verifies fallback images are suppressed for empty bodies and matching body media.
  it('does not duplicate an image already present in article content', async () => {
    const wrapper = mountArticleContent({
      imageUrl: 'https://example.com/image.jpg?size=large&amp;crop=1',
      imageWidth: 200,
      imageHeight: 200,
      content: '<picture><source srcset="https://example.com/other.jpg 1x, https://example.com/image.jpg?size=large&crop=1 2x"></picture><p>Text</p>'
    });

    expect(wrapper.vm.normalizedContent.containsFallbackImage).toBe(true);
    expect(wrapper.vm.shouldShowFallbackImage).toBe(false);

    await wrapper.setProps({ content: '<p>&nbsp;</p>' });
    expect(wrapper.vm.hasArticleContent).toBe(false);
    expect(wrapper.vm.shouldShowFallbackImage).toBe(false);
  });

  // Verifies malformed image URLs retain safe string-comparison behavior.
  it('normalizes trailing separators and malformed image URLs', async () => {
    const wrapper = mountArticleContent({
      imageUrl: 'https://example.com/image.jpg/',
      content: '<p>Text</p><img src="https://example.com/image.jpg">'
    });
    expect(wrapper.vm.normalizedContent.containsFallbackImage).toBe(true);

    await wrapper.setProps({
      imageUrl: '::invalid///',
      content: '<p>Text</p><img src="::invalid">'
    });
    expect(wrapper.vm.normalizedContent.containsFallbackImage).toBe(true);
  });
});

describe('ArticleContent compatibility markup', () => {
  // Verifies every supported YouTube URL format resolves to a validated id.
  it.each([
    ['https://youtube.com/watch?v=gZUDEBbZSp4', 'gZUDEBbZSp4'],
    ['https://youtube.com/embed/gZUDEBbZSp4', 'gZUDEBbZSp4'],
    ['https://youtube.com/shorts/gZUDEBbZSp4', 'gZUDEBbZSp4'],
    ['https://youtu.be/gZUDEBbZSp4', 'gZUDEBbZSp4'],
    ['https://example.com/watch?v=gZUDEBbZSp4', null],
    ['http://[invalid', null]
  ])('extracts the YouTube id from %s', (url, expected) => {
    const wrapper = mountArticleContent();

    expect(wrapper.vm.youtubeVideoIdFromUrl(url)).toBe(expected);
  });

  // Verifies unrelated Mastodon-like markup is preserved without normalization.
  it('leaves mixed-content and incomplete Mastodon links unchanged', () => {
    const wrapper = mountArticleContent({
      content: '<a href="#"><span class="invisible">https://</span>example.com</a>' +
        '<a href="#"><span>visible</span></a>'
    });

    expect(wrapper.get('.article-full-content').html()).toContain('class="invisible"');
  });

  // Verifies content can still pass through when DOM parsing is unavailable.
  it('returns original HTML without DOMParser support', () => {
    const wrapper = mountArticleContent();
    vi.stubGlobal('DOMParser', undefined);

    expect(wrapper.vm.normalizeArticleContent('<p>Original</p>')).toEqual({
      html: '<p>Original</p>',
      hasReadableContent: true,
      containsFallbackImage: false
    });
  });
});

describe('ArticleHeader actions', () => {
  // Verifies reader controls expose read state and forward every action event.
  it('renders read status and forwards menu events', async () => {
    const wrapper = mount(ArticleHeader, {
      props: {
        title: 'Article',
        url: 'https://example.com',
        viewMode: 'reader',
        status: 'read',
        clickedAmount: 1,
        favoriteInd: 1,
        hotInd: 1
      },
      global: {
        stubs: {
          BootstrapIcon: BootstrapIconStub,
          ArticleActionsMenu: {
            emits: ['toggle-favorite', 'not-interested', 'more-like-this', 'less-like-this', 'ignore-topic', 'mute-feed'],
            template: '<button class="actions-stub" @click="$emit(\'toggle-favorite\')"></button>'
          }
        }
      }
    });

    expect(wrapper.get('.article-read-status-button').attributes('aria-label')).toBe('Article is read');
    expect(wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon')))
      .toEqual(['arrow-up-right-square-fill', 'bookmark-fill', 'fire', 'circle-fill']);

    await wrapper.get('.article-link').trigger('click');
    await wrapper.get('.article-read-status-button').trigger('click');
    await wrapper.get('.actions-stub').trigger('click');

    expect(wrapper.emitted('article-clicked')).toEqual([[]]);
    expect(wrapper.emitted('toggle-read-status')).toEqual([[]]);
    expect(wrapper.emitted('toggle-favorite')).toEqual([[]]);
  });

  // Verifies unread reader controls use the unread icon and label.
  it('labels unread reader state', () => {
    const wrapper = mount(ArticleHeader, {
      props: { viewMode: 'reader', status: 'unread' },
      global: {
        stubs: {
          BootstrapIcon: BootstrapIconStub,
          ArticleActionsMenu: true
        }
      }
    });

    expect(wrapper.get('.article-read-status-button').attributes('title')).toBe('Article is unread');
    expect(wrapper.get('.bootstrap-icon-stub').attributes('data-icon')).toBe('record-circle-fill');
  });
});

describe('Article related-article expansion coverage', () => {
  // Verifies an expanded event collapses without another API request.
  it('collapses expanded event articles', () => {
    const context = createExpansionContext();
    context.eventExpanded = true;

    articleExpansionMethods.viewEventArticles.call(context, 9);

    expect(fetchEventArticles).not.toHaveBeenCalled();
    expect(context.eventExpanded).toBe(false);
    expect(context.$emit).toHaveBeenCalledWith('event-articles-collapsed', { articleId: 42 });
  });

  // Verifies event results default missing article arrays to an empty list.
  it('loads event articles with an empty response fallback', async () => {
    fetchEventArticles.mockResolvedValue({ data: {} });
    const context = createExpansionContext();

    articleExpansionMethods.viewEventArticles.call(context, 9);
    await flushPromises();

    expect(fetchEventArticles).toHaveBeenCalledWith(9, 42);
    expect(context.$emit).toHaveBeenCalledWith('event-articles-loaded', {
      articleId: 42,
      eventId: 9,
      articles: []
    });
  });

  // Verifies related-article failures remain visible to the user.
  it('reports topic expansion failures', async () => {
    const error = new Error('topic failed');
    fetchTopicArticles.mockRejectedValue(error);
    const context = createExpansionContext('topic');

    articleExpansionMethods.viewEventArticles.call(context, 9);
    await flushPromises();

    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not load related articles. Please try again.',
      error
    );
  });

  // Verifies duplicate results and failures share the established event contract.
  it('loads duplicate articles and reports later failures', async () => {
    fetchDuplicateArticles.mockResolvedValueOnce({ data: { articles: [{ id: 43 }] } });
    const context = createExpansionContext();

    articleExpansionMethods.viewDuplicateArticles.call(context);
    await flushPromises();
    expect(context.$emit).toHaveBeenCalledWith('duplicate-articles-loaded', {
      articleId: 42,
      articles: [{ id: 43 }]
    });

    context.duplicatesExpanded = false;
    const error = new Error('duplicates failed');
    fetchDuplicateArticles.mockRejectedValueOnce(error);
    articleExpansionMethods.viewDuplicateArticles.call(context);
    await flushPromises();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not load duplicate articles. Please try again.',
      error
    );
  });
});

describe('Article relevance signal coverage', () => {
  // Evaluates a computed signal against a plain article-shaped context.
  const evaluate = (name, context) => articleSignalComputed[name].call(context);

  // Verifies threshold, labeling, and invalid-metadata boundaries.
  it('computes individual relevance signal boundaries', () => {
    const scoreAsPercent = value => Number(value) * 100;

    expect(evaluate('hasHighQualitySignal', {
      qualityScore: 0.91,
      recommendationScore: 0,
      scoreAsPercent
    })).toBe(true);
    expect(evaluate('hasHighQualitySignal', {
      qualityScore: 0,
      recommendationScore: 0.91,
      scoreAsPercent
    })).toBe(true);
    expect(evaluate('hasOfficialSourceSignal', { isOfficialSource: true })).toBe(true);
    expect(evaluate('officialSourceLabel', { officialOrganization: '' })).toBe('Official Feed');
    expect(evaluate('hasTrustedSourceSignal', { feed: { feedTrust: 'invalid' } })).toBe(false);
    expect(evaluate('trustedSourceLabel', {
      author: 'Reporter',
      feed: { feedName: 'Daily News' }
    })).toBe('Trusted source (Daily News)');
    expect(evaluate('trustedSourceLabel', { author: '', feed: {} })).toBe('Trusted source');
    expect(evaluate('eventSourceScore', { event: { sourceCount: 'invalid' } })).toBe(0);
    expect(evaluate('hasTrendingSignal', { eventSourceScore: 5 })).toBe(true);
    expect(evaluate('hasMajorEventSignal', { eventSourceScore: 7 })).toBe(true);
  });

  // Verifies aggregate signals select trending and trusted-source fallbacks.
  it('builds trending and trusted-source signals', () => {
    expect(evaluate('articleSignals', {
      hasHighQualitySignal: false,
      hasMajorEventSignal: false,
      hasTrendingSignal: true,
      hasOfficialSourceSignal: false,
      hasTrustedSourceSignal: true,
      trustedSourceLabel: 'Trusted source'
    })).toEqual([
      { label: 'Trending', icon: 'graph-up-arrow' },
      { label: 'Trusted source', icon: 'shield-fill-check' }
    ]);
  });
});

describe('Article mobile swipe coverage', () => {
  // Verifies modern media-query listeners initialize and tear down cleanly.
  it('manages a modern portrait media-query listener', () => {
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
    const context = createSwipeContext();

    articleMobileSwipeMethods.setupMediaQueryListener.call(context);
    expect(context.isMobilePortrait).toBe(true);
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', context.handleMediaChange);

    articleMobileSwipeMethods.teardownMediaQueryListener.call(context);
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', context.handleMediaChange);
    expect(context.mediaQuery).toBeNull();
  });

  // Verifies legacy media-query APIs remain supported.
  it('manages a legacy media-query listener', () => {
    const mediaQuery = {
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
    const context = createSwipeContext();

    articleMobileSwipeMethods.setupMediaQueryListener.call(context);
    expect(mediaQuery.addListener).toHaveBeenCalledWith(context.handleMediaChange);
    articleMobileSwipeMethods.teardownMediaQueryListener.call(context);
    expect(mediaQuery.removeListener).toHaveBeenCalledWith(context.handleMediaChange);
  });

  // Verifies unsupported environments leave portrait tracking untouched.
  it('ignores setup without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const context = createSwipeContext();

    articleMobileSwipeMethods.setupMediaQueryListener.call(context);
    expect(context.mediaQuery).toBeNull();
  });

  // Verifies leaving portrait mode resets any active gesture.
  it('updates media state and resets only outside portrait mode', () => {
    const context = createSwipeContext();

    articleMobileSwipeMethods.handleMediaChange.call(context, { matches: true });
    expect(context.resetSwipe).not.toHaveBeenCalled();
    articleMobileSwipeMethods.handleMediaChange.call(context, { matches: false });
    expect(context.resetSwipe).toHaveBeenCalledOnce();
  });

  // Verifies invalid touch starts and multi-touch moves cancel tracking.
  it('rejects invalid touch gestures', () => {
    const context = createSwipeContext({ isMobilePortrait: false });

    articleMobileSwipeMethods.onSwipeTouchStart.call(context, { touches: [] });
    expect(context.resetSwipe).toHaveBeenCalledOnce();

    context.isMobilePortrait = true;
    context.swipeTracking = true;
    articleMobileSwipeMethods.onSwipeTouchMove.call(context, { touches: [] });
    expect(context.resetSwipe).toHaveBeenCalledTimes(2);
  });

  // Verifies leftward and short rightward gestures never toggle favorite.
  it('handles leftward and below-threshold swipe movement', () => {
    const context = createSwipeContext({ isMobilePortrait: true });
    articleMobileSwipeMethods.onSwipeTouchStart.call(context, {
      touches: [{ clientX: 50, clientY: 20 }]
    });

    articleMobileSwipeMethods.onSwipeTouchMove.call(context, {
      touches: [{ clientX: 30, clientY: 20 }],
      cancelable: false
    });
    expect(context.swipeTranslateX).toBe(0);

    articleMobileSwipeMethods.onSwipeTouchMove.call(context, {
      touches: [{ clientX: 100, clientY: 20 }],
      cancelable: false
    });
    articleMobileSwipeMethods.onSwipeTouchEnd.call(context);
    expect(context.markAsFavorite).not.toHaveBeenCalled();
  });

  // Verifies inactive gestures and reset options preserve suppression semantics.
  it('ignores inactive touch end and optionally preserves click suppression', () => {
    const context = createSwipeContext({ swipeSuppressClick: true });

    articleMobileSwipeMethods.onSwipeTouchEnd.call(context);
    expect(context.resetSwipe).not.toHaveBeenCalled();

    articleMobileSwipeMethods.resetSwipe.call(context, false);
    expect(context.swipeSuppressClick).toBe(true);
    articleMobileSwipeMethods.resetSwipe.call(context);
    expect(context.swipeSuppressClick).toBe(false);
  });

  // Verifies swipe styles cover inactive, active, and settling states.
  it('computes swipe transform styles', () => {
    expect(articleMobileSwipeComputed.mobileSwipeStyle.call({
      isMobilePortrait: false,
      swipeTranslateX: 0
    })).toEqual({});
    expect(articleMobileSwipeComputed.mobileSwipeStyle.call({
      isMobilePortrait: true,
      swipeTranslateX: 20,
      swipeTracking: true
    })).toEqual({
      transform: 'translateX(20px)',
      transition: 'none'
    });
    expect(articleMobileSwipeComputed.mobileSwipeStyle.call({
      isMobilePortrait: true,
      swipeTranslateX: 0,
      swipeTracking: false
    }).transition).toBe('transform 180ms ease');
  });
});
