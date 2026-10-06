import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Article from '../src/components/articles/Article.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { fetchArticleRecommendations, markAsFavorite, markClicked } from '../src/api/articles.js';

vi.mock('../src/api/articles.js', async importOriginal => ({
  ...await importOriginal(),
  fetchArticleRecommendations: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn()
}));

let wrapper;
const article = {
  id: 42, title: 'Original article title', url: 'https://example.com/article',
  feed: { feedName: 'Example Feed', url: 'https://example.com/feed' },
  publishedAt: '2026-10-04T12:00:00Z', status: 'unread', content: '<p>Original article body.</p>'
};
const stores = () => createFocusedStores({
  selection: { currentSelection: { viewMode: 'reader', grouping: 'none' } },
  overview: { applyFavoriteDelta: vi.fn() }
});
const button = name => wrapper.findAll('button').find(item => item.attributes('aria-label') === name || item.text() === name);
const render = props => {
  wrapper = mount(Article, { attachTo: document.body, props: { ...article, readerDetail: true, readerToolbar: true, ...props }, global: { plugins: [stores().pinia] } });
};

beforeEach(() => {
  vi.clearAllMocks();
  markAsFavorite.mockResolvedValue({ data: { favoriteInd: 1 } });
  markClicked.mockResolvedValue({ data: { clickedAmount: 1 } });
  fetchArticleRecommendations.mockResolvedValue({ data: { articles: [] } });
});
afterEach(() => { wrapper?.unmount(); wrapper = null; });

describe('Reader article toolbar', () => {
  it('keeps the Reader heading focused on the title', () => {
    render();
    expect(wrapper.get('header').text()).toBe(article.title);
    expect(wrapper.find('use[href="#rss-fill"]').exists()).toBe(true);
  });

  it('keeps the RSS fallback and retries a changed feed favicon', async () => {
    render({ feed: { ...article.feed, favicon: 'https://example.com/broken.ico' } });
    const favicon = wrapper.findAll('img').find(image => image.attributes('src') === 'https://example.com/broken.ico');
    expect(favicon.attributes('alt')).toBe('');
    await favicon.trigger('error');
    expect(wrapper.find('img[src="https://example.com/broken.ico"]').exists()).toBe(false);
    expect(wrapper.find('use[href="#rss-fill"]').exists()).toBe(true);
    await wrapper.setProps({ feed: { ...article.feed, favicon: 'https://example.com/new.ico' } });
    expect(wrapper.find('img[src="https://example.com/new.ico"]').exists()).toBe(true);
  });

  it('uses the RSS fallback when the feed has no favicon', () => {
    render();
    expect(wrapper.find('use[href="#rss-fill"]').exists()).toBe(true);
  });

  it('marks read and unread through the existing article event', async () => {
    render();
    await button('Mark read').trigger('click');
    expect(wrapper.emitted('toggle-read-status')).toEqual([[{ id: 42, status: 'unread' }]]);
    await wrapper.setProps({ status: 'read' });
    await button('Mark unread').trigger('click');
    expect(wrapper.emitted('toggle-read-status').at(-1)).toEqual([{ id: 42, status: 'read' }]);
  });

  it('saves and unsaves using persisted state', async () => {
    render();
    await button('Save article').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update-favorite')).toEqual([[{ id: 42, favoriteInd: 1 }]]);
    await wrapper.setProps({ favoriteInd: 1 });
    expect(button('Remove from saved').attributes('aria-pressed')).toBe('true');
    markAsFavorite.mockResolvedValue({ data: { favoriteInd: 0 } });
    await button('Remove from saved').trigger('click');
    await flushPromises();
    expect(markAsFavorite).toHaveBeenLastCalledWith(42, 'unmark');
    expect(wrapper.emitted('update-favorite').at(-1)).toEqual([{ id: 42, favoriteInd: 0 }]);
  });

  it('disables saving while the request is pending', async () => {
    let finish;
    markAsFavorite.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render();
    await button('Save article').trigger('click');
    expect(button('Save article').attributes('disabled')).toBeDefined();
    finish({ data: { favoriteInd: 1 } });
    await flushPromises();
    expect(button('Save article').attributes('disabled')).toBeUndefined();
  });

  it('offers one original action and preserves outbound tracking and security', async () => {
    render();
    const links = wrapper.findAll('a').filter(item => item.text() === 'Open original');
    expect(links).toHaveLength(1);
    expect(links[0].attributes()).toMatchObject({ href: article.url, target: '_blank', rel: 'noopener noreferrer' });
    await links[0].trigger('click');
    await flushPromises();
    expect(markClicked).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('update-clicked')).toEqual([[{ id: 42, clickedAmount: 1 }]]);
    expect(wrapper.get('h1').text()).toBe(article.title);
    expect(wrapper.text()).toContain('Original article body.');
  });

  it.each(['javascript:alert(1)', '/relative'])('omits unusable original URLs: %s', url => {
    render({ url });
    expect(wrapper.findAll('a').some(item => item.text() === 'Open original')).toBe(false);
  });

  it('keeps the existing overflow menu keyboard accessible', async () => {
    render();
    const trigger = button('Article actions');
    expect(trigger.attributes('title')).toBe('Article actions');
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    expect(document.activeElement.textContent.trim()).toBe('Save article');
    expect(wrapper.text()).toContain('Manage tags');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(document.activeElement).toBe(trigger.element);
  });

  it.each(['full', 'summarized', 'minimal'])('leaves %s without the Reader toolbar', mode => {
    const focused = stores();
    focused.selectionStore.currentSelection.viewMode = mode;
    wrapper = mount(Article, { props: { ...article, readerDetail: true, readerToolbar: true }, global: { plugins: [focused.pinia] } });
    expect(wrapper.find('[aria-label="Reader article actions"]').exists()).toBe(false);
  });

  it('shows the toolbar only for the selected article, retaining related article controls', async () => {
    const related = { ...article, id: 43, title: 'Related article', clusterParentId: 42 };
    wrapper = mount(ArticleReaderLayout, { props: { articles: [article, related], container: [article], collectionSummary: { status: 'unread', unreadCount: 1, sourceCount: 1 }, collectionProgress: { hasLoadedContent: true, hasReachedEnd: true } }, global: { plugins: [stores().pinia] } });
    await flushPromises();
    expect(wrapper.findAll('[aria-label="Reader article actions"]')).toHaveLength(1);
    expect(wrapper.findAll('h1').map(item => item.text())).toEqual([article.title, related.title]);
    expect(button('Mark as read')).toBeDefined();
  });
});
