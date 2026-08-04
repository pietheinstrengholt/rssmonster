import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import Article from '../src/components/articles/Article.vue';
import articleSource from '../src/components/articles/Article.vue?raw';
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

  // Verifies an open actions menu escapes article containment and stacks above surrounding content.
  it('raises an article while its actions menu is open', () => {
    expect(articleSource).toMatch(/\.article-card:has\(\.article-actions \.dropdown-menu\.show\)\s*\{[^}]*content-visibility:\s*visible;[^}]*position:\s*relative;[^}]*z-index:\s*1040;/s);
    expect(articleSource).toMatch(/\.article-card \.dropdown-menu\s*\{[^}]*z-index:\s*1041;/s);
  });
});
