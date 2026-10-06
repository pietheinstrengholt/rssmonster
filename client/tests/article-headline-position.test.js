import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

let wrapper;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete HTMLElement.prototype.scrollIntoView;
});

it.each(['shell', 'window'])('keeps the clicked headline in place on the %s scroll surface', async surface => {
  const stores = createFocusedStores({
    selection: { currentSelection: { viewMode: 'minimal', grouping: 'none' } }
  });
  const scrollRoot = document.createElement('div');
  scrollRoot.style.overflowY = surface === 'shell' ? 'auto' : 'visible';
  scrollRoot.scrollTop = 500;
  document.body.appendChild(scrollRoot);
  let windowOffset = 500;
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(({ top }) => { windowOffset += top; });
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  const articles = [1, 2].map(id => ({
    id, title: `Headline ${id}`, status: 'read',
    content: `<p>Content ${id}</p>`, feed: { feedName: 'Source' }
  }));
  const Harness = defineComponent({
    components: { ArticleListView },
    setup: () => ({ active: ref(1), articles, scrollRoot }),
    template: `<ArticleListView :articles="articles" :container="articles" view-mode="minimal"
      :scroll-root="scrollRoot" :active-minimal-article-id="active"
      :collection-summary="{ status: 'read', selectedTag: '', unreadCount: 0, sourceCount: 1 }"
      :collection-progress="{ hasLoadedContent: true, hasReachedEnd: false }"
      @minimal-article-opened="active = $event.id" />`
  });
  wrapper = mount(Harness, { attachTo: scrollRoot, global: { plugins: [stores.pinia] } });
  const firstBody = () => wrapper.findAll('[data-reading-content]').some(body => body.text() === 'Content 1');
  const headline = wrapper.findAll('h5').find(item => item.text() === 'Headline 2');
  const article = headline.element.closest('[tabindex]');
  vi.spyOn(article, 'getBoundingClientRect').mockImplementation(() => ({
    top: 800 + (firstBody() ? 300 : 0) - (surface === 'shell' ? scrollRoot.scrollTop : windowOffset)
  }));
  const initialTop = article.getBoundingClientRect().top;

  await headline.trigger('click');
  await flushPromises();

  expect(wrapper.get('[data-reading-content]').text()).toBe('Content 2');
  expect(article.getBoundingClientRect().top).toBe(initialTop);
  expect(document.activeElement).toBe(article);
  expect(scrollIntoView).not.toHaveBeenCalled();
  if (surface === 'window') expect(scrollBy).toHaveBeenCalledWith({ top: -300, behavior: 'instant' });

  // Opening the headline above the current selection should also leave it in place.
  const firstHeadline = wrapper.findAll('h5').find(item => item.text() === 'Headline 1');
  await firstHeadline.trigger('click');
  await flushPromises();
  expect(wrapper.get('[data-reading-content]').text()).toBe('Content 1');
  expect(scrollIntoView).not.toHaveBeenCalled();
});
