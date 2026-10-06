import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Article from '../src/components/articles/Article.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { fetchArticleRecommendations } from '../src/api/articles.js';

vi.mock('../src/api/articles.js', async importOriginal => ({
  ...await importOriginal(), fetchArticleRecommendations: vi.fn()
}));

let wrapper;
const article = { id: 42, title: 'Selected article', content: '<p>Article body.</p>', status: 'unread' };
const button = name => wrapper.find(`button[aria-label="${name}"]`);
const stores = mode => createFocusedStores({ selection: { currentSelection: { viewMode: mode, grouping: 'none' } } });
const render = async (articles = [article]) => {
  wrapper = mount(ArticleReaderLayout, {
    attachTo: document.body,
    props: { articles, container: articles, collectionSummary: { status: 'unread', unreadCount: articles.length, sourceCount: 1 }, collectionProgress: { hasLoadedContent: true, hasReachedEnd: true } },
    global: { plugins: [stores('reader').pinia] }
  });
  await flushPromises();
};
beforeEach(() => { vi.clearAllMocks(); fetchArticleRecommendations.mockResolvedValue({ data: { articles: [] } }); });
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals(); });

it('expands and restores without replacing the article or resetting either scroll surface', async () => {
  await render();
  const list = wrapper.get('[aria-label="Article list"]');
  const reader = wrapper.get('[aria-label="Reader"]');
  const heading = wrapper.get('h1').element;
  list.element.scrollTop = 125;
  reader.element.scrollTop = 450;
  expect(button('Expand article').attributes()).toMatchObject({ title: 'Expand article', 'aria-pressed': 'false' });
  await button('Expand article').trigger('click');
  expect(list.attributes('aria-hidden')).toBe('true');
  expect(list.attributes('inert')).toBeDefined();
  expect(button('Restore article layout').attributes()).toMatchObject({ title: 'Restore article layout', 'aria-pressed': 'true' });
  expect(wrapper.get('h1').element).toBe(heading);
  expect(reader.element.scrollTop).toBe(450);
  await button('Restore article layout').trigger('click');
  expect(list.attributes('aria-hidden')).toBe('false');
  expect(list.attributes('inert')).toBeUndefined();
  expect(list.element.scrollTop).toBe(125);
  expect(reader.element.scrollTop).toBe(450);
  expect(wrapper.get('h1').element).toBe(heading);
  expect(wrapper.emitted('reading-article-changing')).toBeUndefined();
  expect(fetchArticleRecommendations).toHaveBeenCalledTimes(1);
});

it('keeps keyboard navigation working while the article list is hidden', async () => {
  await render([article, { ...article, id: 43, title: 'Next article' }]);
  await button('Expand article').trigger('click');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  await flushPromises();
  expect(wrapper.get('h1').text()).toBe('Next article');
  expect(button('Restore article layout').exists()).toBe(true);
  expect(wrapper.get('[aria-label="Article list"]').element.contains(document.activeElement)).toBe(false);
  await button('Restore article layout').trigger('click');
  expect(wrapper.get('h1').text()).toBe('Next article');
});

it('preserves active speech when expanding and restoring', async () => {
  const synthesis = { cancel: vi.fn(), speak: vi.fn() };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
  await render();
  await button('Listen to article').trigger('click');
  synthesis.cancel.mockClear();
  await button('Expand article').trigger('click');
  await button('Restore article layout').trigger('click');
  expect(button('Listen to article').attributes('aria-pressed')).toBe('true');
  expect(synthesis.cancel).not.toHaveBeenCalled();
  expect(synthesis.speak).toHaveBeenCalledOnce();
});

it.each(['full', 'summarized', 'minimal'])('hides expansion outside Reader mode: %s', mode => {
  wrapper = mount(Article, { props: { ...article, readerDetail: true, readerToolbar: true }, global: { plugins: [stores(mode).pinia] } });
  expect(button('Expand article').exists()).toBe(false);
});
