import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as articleApi from '../src/api/articles.js';
import Article from '../src/components/articles/Article.vue';
import ArticleHeadlineRow from '../src/components/articles/ArticleHeadlineRow.vue';
import contentSource from '../src/components/articles/ArticleContent.vue?raw';
import articleSource from '../src/components/articles/Article.vue?raw';
import headlineSource from '../src/components/articles/ArticleHeadlineRow.vue?raw';
import { formatRelativeDate } from '../src/utils/date';
import { createFocusedStores } from './helpers/focusedStores.js';

const imageUrl = 'https://example.com/article.jpg';
const wrappers = [];
const mountRow = (props = {}) => {
  const wrapper = mount(ArticleHeadlineRow, {
    props: { isMobilePortrait: true, title: 'A headline', sourceLabel: 'A source', hasArticlePreview: true, ...props }
  });
  wrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mobile Headlines', () => {
  it('uses normal inline padding for mobile expanded content and media', () => {
    const mobileContent = contentSource.split('@media (max-width: 879px) and (orientation: portrait)')[1];
    const mobileArticle = articleSource.split('@media (max-width: 879px) and (orientation: portrait)').slice(1).join('');
    expect(mobileContent).toMatch(/\.article-content-wrapper--minimal\s*\{\s*padding-inline:\s*var\(--article-space-section, 12px\);/s);
    expect(mobileArticle).toMatch(/\.article-list-card > \.article-media\s*\{\s*padding-inline:\s*var\(--article-space-section, 12px\);/s);
  });

  it.each(['image', 'no image', 'failed image'])('keeps expanded body outside the headline columns with %s', async imageState => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const stores = createFocusedStores({
      overview: { categories: [] },
      selection: { currentSelection: { viewMode: 'minimal', grouping: 'none' } }
    });
    const wrapper = mount(Article, {
      props: {
        id: 42, title: 'A headline', isMinimalContentOpen: true,
        imageUrl: imageState === 'no image' ? '' : imageUrl,
        content: '<p>Expanded reading content.</p>', feed: { feedName: 'A source' }
      },
      global: { plugins: [stores.pinia] }
    });
    wrappers.push(wrapper);
    if (imageState === 'failed image') await wrapper.get(`img[src="${imageUrl}"]`).trigger('error');
    const row = wrapper.getComponent(ArticleHeadlineRow);
    const body = wrapper.get('[data-reading-content]');
    expect(body.text()).toBe('Expanded reading content.');
    expect(row.element.contains(body.element)).toBe(false);
    expect(row.element.compareDocumentPosition(body.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.get('button[aria-label="Article actions"]').exists()).toBe(true);
    await wrapper.setProps({ isMinimalContentOpen: false });
    expect(wrapper.find('[data-reading-content]').exists()).toBe(false);
  });

  it('collapses the absent thumbnail column and clamps titles only in the mobile layout', () => {
    const styles = headlineSource.split('<style scoped>')[1];
    const [desktop, mobileAndRest] = styles.split('@media (max-width: 879px) and (orientation: portrait)');
    const mobile = mobileAndRest.split('@media (prefers-reduced-motion: reduce)')[0];
    expect(mobile).toMatch(/\.article-list-row\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\) auto;/s);
    expect(mobile).toMatch(/\.article-list-main\s*\{[^}]*grid-column:\s*2;/s);
    expect(mobile).toMatch(/\.article-list-row:not\(:has\(\.article-list-thumbnail\)\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
    expect(mobile).toMatch(/\.article-list-row:not\(:has\(\.article-list-thumbnail\)\) \.article-list-main\s*\{[^}]*grid-column:\s*1;/s);
    expect(mobile).toMatch(/\.article-list-row:not\(:has\(\.article-list-thumbnail\)\) \.article-list-actions\s*\{[^}]*grid-column:\s*2;/s);
    expect(mobile).toMatch(/\.article-list-title \.article-link\s*\{[^}]*-webkit-line-clamp:\s*3;/s);
    expect(desktop).not.toContain('line-clamp');
    expect(desktop).toMatch(/\.article-list-row\.is-read:hover\)\s*\{[^}]*background:\s*color-mix\(/s);
    expect(desktop).toContain('.article-list-row.is-read .article-list-meta > span');
  });

  it.each(['unread', 'read'])('moves the %s status control into the mobile menu', async status => {
    const wrapper = mountRow({ status });
    expect(wrapper.find('button[aria-label="Mark article as read"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Mark article as unread"]').exists()).toBe(false);
    expect(wrapper.classes('is-read')).toBe(status === 'read');
    await wrapper.get('button[aria-label="Article actions"]').trigger('click');
    const action = wrapper.findAll('[role="menuitem"]').find(item => item.text() === (status === 'read' ? 'Mark as unread' : 'Mark as read'));
    expect(action).toBeDefined();
    await action.trigger('click');
    expect(wrapper.emitted('toggle-read-status')).toEqual([[]]);
    expect(wrapper.get('button[aria-label="Article actions"]').attributes('aria-expanded')).toBe('false');
    await wrapper.setProps({ status: status === 'read' ? 'unread' : 'read' });
    expect(wrapper.classes('is-read')).toBe(status !== 'read');
  });

  it.each(['unread', 'read'])('exposes the desktop %s control only in the menu', async status => {
    const wrapper = mountRow({ isMobilePortrait: false, status });
    expect(wrapper.find('button[aria-label="Mark article as read"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Mark article as unread"]').exists()).toBe(false);
    expect(wrapper.classes('is-read')).toBe(status === 'read');
    await wrapper.get('button[aria-label="Article actions"]').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find(item => item.text() === (status === 'read' ? 'Mark as unread' : 'Mark as read')).trigger('click');
    expect(wrapper.emitted('toggle-read-status')).toEqual([[]]);
    expect(wrapper.get('button[aria-label="Article actions"]').attributes('aria-expanded')).toBe('false');
  });

  it.each([true, false])('uses the existing read-state event with mobile layout %s', async isMobilePortrait => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: isMobilePortrait, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const stores = createFocusedStores({
      overview: { categories: [] },
      selection: { currentSelection: { viewMode: 'minimal', grouping: 'none' } }
    });
    const wrapper = mount(Article, {
      props: { id: 42, title: 'A headline', status: 'unread', contentText: 'Article text', feed: { feedName: 'A source' } },
      global: { plugins: [stores.pinia] }
    });
    wrappers.push(wrapper);
    for (const status of ['unread', 'read']) {
      await wrapper.setProps({ status });
      await wrapper.get('button[aria-label="Article actions"]').trigger('click');
      await wrapper.findAll('[role="menuitem"]').find(item => item.text() === (status === 'read' ? 'Mark as unread' : 'Mark as read')).trigger('click');
    }
    expect(wrapper.emitted('toggle-minimal-read-status')).toEqual([
      [{ id: 42, status: 'unread' }],
      [{ id: 42, status: 'read' }]
    ]);
  });

  it('retains the full headline and metadata with or without an image', async () => {
    const title = 'A long translated headline '.repeat(12);
    const publishedAt = '2026-09-16T12:00:00Z';
    const wrapper = mountRow({ title, publishedAt, imageUrl });
    expect(wrapper.get('h5').text()).toBe(title.trim());
    expect(wrapper.text()).toContain('A source');
    expect(wrapper.text()).toContain(formatRelativeDate(publishedAt));
    await wrapper.setProps({ imageUrl: '' });
    expect(wrapper.get('h5').text()).toBe(title.trim());
    expect(wrapper.text()).toContain('A source');
    expect(wrapper.text()).toContain(formatRelativeDate(publishedAt));
  });

  it('shows the article image and removes failed images without a placeholder', async () => {
    const wrapper = mountRow({ imageUrl });
    expect(wrapper.get('img').attributes('src')).toBe(imageUrl);
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('A headline');
    await wrapper.setProps({ imageUrl: 'https://example.com/replacement.jpg' });
    expect(wrapper.get('img').attributes('src')).toContain('replacement.jpg');
  });

  it.each(['', 'not a URL', 'javascript:alert(1)'])('keeps the headline and actions without a usable image: %s', imageUrl => {
    const wrapper = mountRow({ imageUrl });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('A headline');
    expect(wrapper.find('button[aria-label="Mark as favorite"]').exists()).toBe(false);
    expect(wrapper.get('button[aria-label="Article actions"]').exists()).toBe(true);
  });

  it('keeps contextual favorites in the menu without a separate row button', async () => {
    const wrapper = mountRow();
    expect(wrapper.find('button[aria-label="Mark as favorite"]').exists()).toBe(false);
    const menu = wrapper.get('button[aria-label="Article actions"]');
    await menu.trigger('click');
    const favorite = () => wrapper.findAll('[role="menuitem"]').find(item => /^(Mark as favorite|Unmark favorite)$/.test(item.text()));
    expect(favorite().text()).toBe('Mark as favorite');
    await favorite().trigger('click');
    expect(wrapper.emitted('toggle-favorite')).toHaveLength(1);
    await wrapper.setProps({ favoriteInd: 1, favoritePending: true });
    await menu.trigger('click');
    expect(favorite().text()).toBe('Unmark favorite');
    expect(favorite().attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('More like this');
    await wrapper.setProps({ favoritePending: false });
    await favorite().trigger('click');
    expect(wrapper.emitted('toggle-favorite')).toHaveLength(2);
  });

  it('uses the existing favorite API and updates the contextual menu after each toggle', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const favoriteApi = vi.spyOn(articleApi, 'markAsFavorite')
      .mockResolvedValueOnce({ data: { favoriteInd: 1 } })
      .mockResolvedValueOnce({ data: { favoriteInd: 0 } });
    const stores = createFocusedStores({
      overview: { categories: [] },
      selection: { currentSelection: { viewMode: 'minimal', grouping: 'none' } }
    });
    const wrapper = mount(Article, {
      props: {
        id: 42, title: 'A headline', contentText: 'Article text', feed: { feedName: 'A source' },
        onUpdateFavorite: ({ favoriteInd }) => wrapper.setProps({ favoriteInd })
      },
      global: { plugins: [stores.pinia] }
    });
    wrappers.push(wrapper);
    for (const label of ['Mark as favorite', 'Unmark favorite']) {
      await wrapper.get('button[aria-label="Article actions"]').trigger('click');
      await wrapper.findAll('[role="menuitem"]').find(item => item.text() === label).trigger('click');
      await flushPromises();
    }
    expect(favoriteApi.mock.calls).toEqual([[42, 'mark'], [42, 'unmark']]);
    expect(wrapper.emitted('update-favorite')).toEqual([[{ id: 42, favoriteInd: 1 }], [{ id: 42, favoriteInd: 0 }]]);
    expect(wrapper.emitted('minimal-article-opened')).toBeUndefined();
  });

  it.each(['OpenAI', 'openai', 'Openai'])('formats %s while preserving tag and similar-article actions', async name => {
    const tag = { id: 1, name, tagType: 'rule' };
    const wrapper = mountRow({ tags: [tag], eventId: 7, grouping: 'event', eventArticleCountTotal: 2, sourceCount: 2 });
    expect(wrapper.text()).toContain('2 sources');
    expect(wrapper.text()).toContain('+1 similar article');
    await wrapper.get('button[aria-label="Filter articles by tag OpenAI"]').trigger('click');
    expect(wrapper.emitted('select-tag')).toEqual([[tag]]);
    await wrapper.get('button[aria-label="Show 1 similar article"]').trigger('click');
    expect(wrapper.emitted('view-event-articles')).toEqual([[7]]);
  });

  it('preserves desktop image absence, tag formatting, and action order', () => {
    const wrapper = mountRow({ isMobilePortrait: false, imageUrl, tags: [{ id: 1, name: 'OpenAI', tagType: 'rule' }] });
    expect(wrapper.get('button[aria-label="Filter articles by tag Openai"]').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
    const favorite = wrapper.get('button[aria-label="Mark as favorite"]');
    const menu = wrapper.get('button[aria-label="Article actions"]');
    expect(menu.element.compareDocumentPosition(favorite.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the summarized lead image on desktop', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const stores = createFocusedStores({
      overview: { categories: [] },
      selection: { currentSelection: { viewMode: 'summarized', grouping: 'none' } }
    });
    const wrapper = mount(Article, {
      props: { id: 42, title: 'A headline', imageUrl, contentText: 'Article text', feed: { feedName: 'A source' } },
      global: { plugins: [stores.pinia] }
    });
    wrappers.push(wrapper);
    expect(wrapper.get(`img[src="${imageUrl}"]`).exists()).toBe(true);
    expect(wrapper.text()).toContain('Article text');
  });

  it.each(['minimal', 'full', 'summarized', 'summaryBullets', 'reader'])('limits row thumbnails to Headlines in %s mode', viewMode => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const stores = createFocusedStores({
      overview: { categories: [] },
      selection: { currentSelection: { viewMode, grouping: 'none' } }
    });
    const wrapper = mount(Article, {
      props: { id: 42, title: 'A headline', imageUrl, contentText: 'Article text', feed: { feedName: 'A source' } },
      global: { plugins: [stores.pinia] }
    });
    wrappers.push(wrapper);
    expect(wrapper.find(`img[src="${imageUrl}"]`).exists()).toBe(viewMode === 'minimal');
  });
});
