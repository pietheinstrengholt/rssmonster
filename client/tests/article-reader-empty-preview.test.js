import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Article from '../src/components/articles/Article.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import previewFallbackSource from '../src/components/articles/ArticlePreviewFallback.vue?raw';
import { markClicked } from '../src/api/articles';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/styles/theme.css'), 'utf8');

vi.mock('../src/api/articles', () => ({
  fetchDuplicateArticles: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(() => Promise.resolve()),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  markClicked.mockResolvedValue({});
});

// This function creates an article with no preview fields by default.
function createArticle(overrides = {}) {
  return {
    id: 1,
    title: 'Article without a preview',
    url: 'https://example.com/original',
    publishedAt: '2026-07-19T10:00:00.000Z',
    feed: { feedName: 'Example Feed' },
    ...overrides
  };
}

// This function mounts the reader list with its required store and child stubs.
function mountReader(article = createArticle()) {
  const stores = createFocusedStores({
    overview: { categories: [], smartFolders: [] },
    selection: {
      currentSelection: {
        smartFolderId: null,
        tag: '',
        search: '',
        feedId: '%',
        categoryId: '%',
        status: 'unread'
      },
      setCurrentSelection: vi.fn()
    }
  });
  return mount(ArticleReaderLayout, {
    props: {
      articles: [article],
      container: [article],
      collectionSummary: {
        status: 'unread', selectedTag: '', unreadCount: 1, sourceCount: 1
      },
      collectionProgress: {
        hasLoadedContent: true,
        isFlushed: false,
        hasReachedEnd: false,
        showFeedRefreshProgress: true
      }
    },
    global: {
      stubs: {
        ArticleItem: true,
        ArticleEmptyState: true,
        ArticleEndState: true,
        BootstrapIcon: true
      },
      plugins: [stores.pinia]
    }
  });
}

// This function mounts the standard article component in the requested list mode.
function mountArticle(props = {}, viewMode = 'full') {
  const stores = createFocusedStores({
    overview: { categories: [] },
    selection: { currentSelection: { viewMode, grouping: 'none' } }
  });
  return mount(Article, {
    props: createArticle(props),
    global: {
      stubs: {
        ArticleActionsMenu: true,
        ArticleContent: true,
        ArticleHeader: true,
        ArticleMedia: true,
        ArticleMeta: true,
        ArticleTagsScores: true,
        BootstrapIcon: true
      },
      plugins: [stores.pinia]
    }
  });
}

describe('ArticleReaderLayout empty previews', () => {
  it('shows the fallback when content, description, and image are missing', () => {
    const wrapper = mountReader();

    expect(wrapper.get('.article-preview-empty').text()).toContain('No preview available');
  });

  it.each([
    ['meaningful content', { contentHtml: '<p>Meaningful article body</p>' }],
    ['a description', { description: 'A useful description' }],
    ['an image', { imageUrl: 'https://example.com/lead.jpg' }]
  ])('hides the fallback for %s', (_label, previewFields) => {
    const wrapper = mountReader(createArticle(previewFields));

    expect(wrapper.find('.article-preview-empty').exists()).toBe(false);
  });

  it.each(['   ', '<p></p>', '<br>', '&nbsp;', '<p> &nbsp; </p>', '<html><head></head><body>null</body></html>'])(
    'shows the fallback for structurally empty HTML: %s',
    contentHtml => {
      const wrapper = mountReader(createArticle({ contentHtml }));

      expect(wrapper.find('.article-preview-empty').exists()).toBe(true);
    }
  );

  it('uses sanitized contentHtml as the rendered-content boundary', () => {
    const wrapper = mountReader(createArticle({ contentHtml: '' }));

    expect(wrapper.find('.article-preview-empty').exists()).toBe(true);
  });

  it('shows the fallback for an unusable image URL', () => {
    const wrapper = mountReader(createArticle({ imageUrl: 'javascript:alert(1)', contentHtml: '<img>' }));

    expect(wrapper.find('.article-preview-empty').exists()).toBe(true);
    expect(wrapper.find('.readerArticleListThumbnail').exists()).toBe(false);
  });

  it('uses the original URL, tracks the click, and does not select the row again', async () => {
    const wrapper = mountReader();
    const selectArticle = vi.spyOn(wrapper.vm, 'selectArticle');
    const link = wrapper.get('.article-preview-empty__link');

    expect(link.attributes()).toMatchObject({
      href: 'https://example.com/original',
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': 'Open original article in a new tab'
    });

    await link.trigger('click');
    await Promise.resolve();

    expect(selectArticle).not.toHaveBeenCalled();
    expect(markClicked).toHaveBeenCalledWith(1);
    expect(wrapper.emitted('update-clicked')).toEqual([[{ id: 1, clickedAmount: 1 }]]);
  });

  it('uses the persisted click count and suppresses failed reader click updates', async () => {
    const article = createArticle({ clickedAmount: 3 });
    const wrapper = mountReader(article);
    markClicked.mockResolvedValueOnce({ data: { clickedAmount: 4 } });

    await wrapper.vm.trackOriginalArticleClick(article);

    expect(wrapper.emitted('update-clicked')).toEqual([[{ id: 1, clickedAmount: 4 }]]);

    const error = new Error('offline');
    markClicked.mockRejectedValueOnce(error);
    await wrapper.vm.trackOriginalArticleClick(article);

    expect(wrapper.emitted('update-clicked')).toHaveLength(1);
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not record this article click. Please try again.',
      error
    );
  });

  it('defines readable light and dark semantic colors', () => {
    expect(previewFallbackSource).toContain('color: var(--reader-empty-preview-text)');
    expect(previewFallbackSource).toContain('color: var(--color-link)');
    expect(previewFallbackSource).toContain("root[data-theme='dark']");
    expect(themeSource).toContain('--reader-empty-preview-text: #6B7280;');
    expect(themeSource).toContain('--reader-empty-preview-text: #9CA3AF;');
    expect(themeSource).toContain('--color-link: #2563EB;');
    expect(themeSource).toContain('--color-link: #60A5FA;');
  });
});

describe('Article empty previews', () => {
  it.each(['full', 'minimal'])('shows the fallback in %s mode when contentHtml is empty', viewMode => {
    const wrapper = mountArticle({
      contentHtml: '',
      description: '',
      imageUrl: ''
    }, viewMode);

    expect(wrapper.get('.article-preview-empty').text()).toContain('No preview available');
    expect(wrapper.html()).toContain('icon="box-arrow-up-right"');
  });

  it('shows the fallback when a standalone image URL is not rendered without article content', () => {
    const wrapper = mountArticle({
      contentHtml: '',
      description: '',
      imageUrl: 'https://example.com/dormant-lead-image.jpg'
    });

    expect(wrapper.get('.article-preview-empty__message').text()).toBe('No preview available');
    expect(wrapper.get('.article-preview-empty__separator').text()).toBe('-');
    expect(wrapper.get('.article-preview-empty__link').text()).toContain('Open original article');
  });

  it('uses the existing click behavior without opening the compact row', async () => {
    markClicked.mockClear();
    const wrapper = mountArticle({ contentHtml: '' }, 'minimal');
    const link = wrapper.get('.article-preview-empty__link');

    expect(link.attributes()).toMatchObject({
      href: 'https://example.com/original',
      target: '_blank',
      rel: 'noopener noreferrer'
    });

    await link.trigger('click');
    await Promise.resolve();

    expect(markClicked).toHaveBeenCalledWith(1);
    expect(wrapper.emitted('minimal-article-opened')).toBeUndefined();
  });
});
