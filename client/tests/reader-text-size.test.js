import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Article from '../src/components/articles/Article.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { fetchArticleRecommendations } from '../src/api/articles.js';
import { readReaderTextSize, saveReaderTextSize } from '../src/services/readerTextSize.js';

vi.mock('../src/api/articles.js', async importOriginal => ({
  ...await importOriginal(), fetchArticleRecommendations: vi.fn()
}));
let wrapper;
const key = 'rssmonster.readerTextSize';
const article = { id: 42, title: 'Selected article', content: '<p>Article body.</p>', status: 'unread' };
const trigger = () => wrapper.get('button[aria-label="Article text size"]');
const option = size => wrapper.findAll('[role="menuitemradio"]').find(item => item.text() === size);
const render = async (articles = [article]) => {
  const stores = createFocusedStores({ selection: { currentSelection: { viewMode: 'reader', grouping: 'none' } } });
  wrapper = mount(ArticleReaderLayout, {
    attachTo: document.body,
    props: { articles, container: [article], collectionSummary: { status: 'unread', unreadCount: 1, sourceCount: 1 }, collectionProgress: { hasLoadedContent: true, hasReachedEnd: true } },
    global: { plugins: [stores.pinia] }
  });
  await flushPromises();
};
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); fetchArticleRecommendations.mockResolvedValue({ data: { articles: [] } }); });
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks(); localStorage.clear(); });

it.each([null, 'invalid', 'Large', ''])('defaults to Medium with a missing or invalid preference: %s', async saved => {
  if (saved !== null) localStorage.setItem(key, saved);
  await render();
  expect(wrapper.get('[data-reader-text-size]').attributes('data-reader-text-size')).toBe('medium');
  await trigger().trigger('click');
  expect(option('Medium').attributes('aria-checked')).toBe('true');
  expect(option('Small').attributes('aria-checked')).toBe('false');
  expect(option('Large').attributes('aria-checked')).toBe('false');
});

it.each(['small', 'medium', 'large'])('restores the saved %s size during Reader initialization', async size => {
  localStorage.setItem(key, size);
  await render();
  expect(wrapper.get('[data-reader-text-size]').attributes('data-reader-text-size')).toBe(size);
});

it('applies and saves each choice, closes the menu and restores trigger focus', async () => {
  await render([article, { ...article, id: 43, title: 'Related article', clusterParentId: 42 }]);
  const heading = wrapper.get('h1').element;
  for (const size of ['Large', 'Small', 'Medium']) {
    await trigger().trigger('click');
    expect(trigger().attributes()).toMatchObject({ 'aria-expanded': 'true', 'aria-haspopup': 'menu' });
    await option(size).trigger('click');
    await flushPromises();
    expect(trigger().attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger().element);
    expect(localStorage.getItem(key)).toBe(size.toLowerCase());
    expect(wrapper.findAll('[data-reader-text-size]').map(item => item.attributes('data-reader-text-size'))).toEqual([size.toLowerCase(), size.toLowerCase()]);
    expect(wrapper.get('h1').element).toBe(heading);
    await trigger().trigger('click');
    expect(option(size).attributes('aria-checked')).toBe('true');
    await trigger().trigger('click');
  }
  expect(wrapper.emitted('reading-article-changing')).toBeUndefined();
  expect(fetchArticleRecommendations).toHaveBeenCalledTimes(1);
});

it('supports keyboard menu navigation and Escape with focus restoration', async () => {
  await render();
  await trigger().trigger('keydown', { key: 'ArrowDown' });
  await flushPromises();
  expect(document.activeElement).toBe(option('Small').element);
  await option('Small').trigger('keydown', { key: 'ArrowDown' });
  expect(document.activeElement).toBe(option('Medium').element);
  await option('Medium').trigger('keydown', { key: 'End' });
  expect(document.activeElement).toBe(option('Large').element);
  await option('Large').trigger('keydown', { key: 'Escape' });
  await flushPromises();
  expect(trigger().attributes('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger().element);
});

it('closes on an outside pointer press', async () => {
  await render();
  await trigger().trigger('click');
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await flushPromises();
  expect(trigger().attributes('aria-expanded')).toBe('false');
});

it('keeps the chosen size when opening a different article', async () => {
  await render();
  await trigger().trigger('click');
  await option('Large').trigger('click');
  await wrapper.setProps({ articles: [{ ...article, id: 44, title: 'Another article' }] });
  expect(wrapper.get('h1').text()).toBe('Another article');
  expect(wrapper.get('[data-reader-text-size]').attributes('data-reader-text-size')).toBe('large');
});

it.each(['full', 'summarized', 'minimal'])('leaves %s articles without Reader typography preferences', mode => {
  const stores = createFocusedStores({ selection: { currentSelection: { viewMode: mode, grouping: 'none' } } });
  wrapper = mount(Article, { props: { ...article, readerDetail: true, readerToolbar: true, readerTextSize: 'large' }, global: { plugins: [stores.pinia] } });
  expect(wrapper.find('[data-reader-text-size]').exists()).toBe(false);
  expect(wrapper.find('button[aria-label="Article text size"]').exists()).toBe(false);
});

it('ignores unsupported values when saving preferences', () => {
  saveReaderTextSize('large');
  saveReaderTextSize('huge');
  expect(localStorage.getItem(key)).toBe('large');
});

it('keeps the control usable when storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readReaderTextSize()).toBe('medium');
  await render();
  await trigger().trigger('click');
  await option('Large').trigger('click');
  expect(wrapper.get('[data-reader-text-size]').attributes('data-reader-text-size')).toBe('large');
});
