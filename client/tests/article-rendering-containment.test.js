import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import Article from '../src/components/articles/Article.vue';
import articleActionsSource from '../src/components/articles/ArticleActionsMenu.vue?raw';
import articleListSource from '../src/components/articles/ArticleListView.vue?raw';
import articleSource from '../src/components/articles/Article.vue?raw';
import readerLayoutSource from '../src/components/articles/ArticleReaderLayout.vue?raw';
import { createFocusedStores } from './helpers/focusedStores.js';

// Mounts one article in the requested presentation while preserving its public root attributes.
const mountArticle = (viewMode, props = {}, attrs = {}) => {
  const stores = createFocusedStores({
    overview: { categories: [] },
    selection: { currentSelection: { viewMode, grouping: 'none' } }
  });

  return mount(Article, {
    props: {
      id: 42,
      title: 'Rendering boundary',
      url: 'https://example.com/article',
      feed: { feedName: 'Example Feed' },
      status: 'unread',
      ...props
    },
    attrs,
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
};

describe('Article rendering containment', () => {
  // Verifies every content-heavy stream mode keeps the observed article root as its containment boundary.
  it.each(['full', 'summarized', 'summaryBullets', 'reader'])(
    'uses the stable article card boundary in %s mode',
    viewMode => {
      const card = mountArticle(viewMode).get('.article-card');

      expect(card.attributes('id')).toBe('article-42');
      expect(card.classes()).not.toContain('article-list-card');
    }
  );

  // Verifies compact, event, and keyboard-selection classes coexist on the same optimized root.
  it('keeps compact and state classes on the observed article root', () => {
    const card = mountArticle(
      'minimal',
      { isEventArticle: true },
      { class: 'article-list-card-selected', 'aria-current': 'true', tabindex: '0' }
    ).get('.article-card');

    expect(card.attributes('id')).toBe('article-42');
    expect(card.attributes('aria-current')).toBe('true');
    expect(card.attributes('tabindex')).toBe('0');
    expect(card.classes()).toEqual(expect.arrayContaining([
      'article-card',
      'article-list-card',
      'article-list-card-selected',
      'event-article'
    ]));
  });

  // Verifies normal and compact cards reserve distinct realistic sizes while print renders every article.
  it('defines view-specific intrinsic sizes and disables skipping for print', () => {
    expect(articleSource).toMatch(/\.article-card\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-size:\s*auto 720px;/s);
    expect(articleSource).toMatch(/\.article-list-card\s*\{[^}]*contain-intrinsic-size:\s*auto 72px;/s);
    expect(articleSource).toMatch(/@media print\s*\{\s*\.article-card\s*\{[^}]*content-visibility:\s*visible;[^}]*contain-intrinsic-size:\s*none;/s);
  });

  // Verifies swipe clipping stays local to each article while the collection can expand vertically.
  it('keeps overflow clipping on the mobile swipe shell instead of the article collection', () => {
    expect(articleSource).toMatch(/\.mobile-swipe-shell\s*\{[^}]*overflow:\s*hidden;/s);
    expect(articleListSource).toMatch(/\.article-list-view__items\s*\{[^}]*padding-top:\s*0;/s);
    expect(articleListSource).not.toMatch(/\.article-list-view__items\s*\{[^}]*(?:overflow|overflow-[xy]):/s);
    expect(articleListSource).toMatch(/\.article-list-view\.article-list-view--expanded\s*\{[^}]*overflow-y:\s*auto;/s);
  });

  // Verifies Expanded mode uses its native scroll surface without viewport-coupled overlay geometry.
  it('styles the native Expanded scrollbar', () => {
    expect(articleListSource).toMatch(/\.article-list-view\.article-list-view--expanded\s*\{[^}]*scrollbar-color:\s*var\(--expanded-scrollbar-thumb\) var\(--color-transparent\);[^}]*scrollbar-width:\s*thin;/s);
    expect(articleListSource).toMatch(/\.article-list-view\.article-list-view--expanded::\-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*var\(--expanded-scrollbar-thumb\);[^}]*border-radius:\s*999px;/s);
    expect(articleListSource).not.toContain('updateExpandedScrollbarMetrics');
    expect(articleListSource).not.toContain('--expanded-scrollbar-offset');
    expect(articleListSource).not.toMatch(/\.article-list-view\.article-list-view--expanded::after/);
  });

  // Verifies an open actions menu escapes article containment and stacks above surrounding content.
  it('raises an article while its actions menu is open', () => {
    expect(articleSource).toMatch(/\.article-card:has\(\.article-actions \.app-dropdown__menu--open\)\)\s*\{[^}]*content-visibility:\s*visible;[^}]*position:\s*relative;[^}]*z-index:\s*var\(--layer-dropdown\);/s);
    expect(articleActionsSource).toMatch(/\.app-dropdown__menu\s*\{[^}]*z-index:\s*calc\(var\(--layer-dropdown\) \+ 1\);/s);
  });

  // Verifies keyboard focus is visible on both compact and Reader article rows.
  it('defines focus-visible rings independently from article selection', () => {
    expect(articleSource).toMatch(/\.article-list-card:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--border-focus\);/s);
    expect(readerLayoutSource).toMatch(/\.article-reader__selection:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--border-focus\);/s);
    expect(articleSource).not.toMatch(/\.article-list-card\.article-list-card-selected:focus\s*\{[^}]*outline:\s*0;/s);
    expect(readerLayoutSource).not.toMatch(/\.article-reader__selection:focus-visible\s*\{[^}]*outline:\s*none;/s);
  });

  // Verifies Reader selection and original navigation are sibling controls rather than nested interactions.
  it('uses a native Reader selection control beside the original link', () => {
    expect(readerLayoutSource).toContain('<article\n        v-for="article in readerListArticles"');
    expect(readerLayoutSource).toContain('class="article-reader__selection"');
    expect(readerLayoutSource).not.toContain('role="button"');
    expect(readerLayoutSource).not.toMatch(/<button[^>]*article-reader__selection(?:(?!<\/button>)[\s\S])*<a[^>]*article-preview-empty__link/s);
  });
});
