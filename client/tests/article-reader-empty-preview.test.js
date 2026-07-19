import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import Article from '../src/components/Article.vue';
import ArticleReaderLayout from '../src/components/ArticleReaderLayout.vue';
import articleSource from '../src/components/Article.vue?raw';
import { markClicked } from '../src/api/articles';

vi.mock('../src/api/articles', () => ({
  fetchDuplicateArticles: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(() => Promise.resolve()),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn()
}));

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
  return mount(ArticleReaderLayout, {
    props: {
      articles: [article],
      container: [article],
      currentSelection: 'unread',
      currentViewUnreadCount: 1,
      currentViewSourceCount: 1,
      remainingItems: 0,
      fetchCount: 20,
      hasLoadedContent: true,
      isFlushed: false,
      distance: 0
    },
    global: {
      stubs: {
        Article: true,
        ArticleEmptyState: true,
        ArticleEndState: true,
        BootstrapIcon: true
      },
      mocks: {
        $store: {
          data: {
            currentSelection: {
              smartFolderId: null,
              tag: '',
              search: '',
              feedId: '%',
              categoryId: '%',
              status: 'unread'
            },
            categories: [],
            smartFolders: [],
            setCurrentSelection: vi.fn()
          }
        }
      }
    }
  });
}

// This function mounts the standard article component in the requested list mode.
function mountArticle(props = {}, viewMode = 'full') {
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
      mocks: {
        $store: {
          data: {
            categories: [],
            currentSelection: {
              viewMode,
              grouping: 'none'
            }
          }
        }
      }
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

  it('defines readable light and dark fallback colors', () => {
    expect(articleSource).toContain('color: #6B7280');
    expect(articleSource).toContain("root[data-theme='dark']");
    expect(articleSource).toContain('color: #9CA3AF');
    expect(articleSource).toContain('color: #60A5FA');
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
    expect(wrapper.find('.bi-box-arrow-up-right').exists()).toBe(true);
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
