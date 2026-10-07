import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleBulkActionMenu from '../src/components/articles/ArticleBulkActionMenu.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

let wrapper;
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { wrapper?.unmount(); delete Element.prototype.scrollIntoView; });

function renderList(viewMode, status = 'unread') {
  const stores = createFocusedStores({ selection: { currentSelection: { viewMode, status } } });
  wrapper = mount(ArticleListView, {
    props: {
      viewMode,
      articles: [{ id: 1, status: 'unread' }, { id: 2, status: 'unread' }, { id: 3, status: 'unread' }],
      container: [1, 2, 3],
      collectionSummary: { status, totalCount: 3, unreadCount: 3, sourceCount: 1 },
      collectionProgress: { hasLoadedContent: true, loadedCount: 3 }
    },
    global: { plugins: [stores.pinia], stubs: { ArticleItem: { template: '<article>Article</article>' }, DailyBriefingIntro: true } }
  });
  return wrapper;
}

const more = () => wrapper.get('button[aria-label="More actions"]');
const action = label => wrapper.findAll('[role="menuitem"]').find(button => button.text() === label);

describe('article list bulk actions', () => {
  it.each(['full', 'summarized', 'summaryBullets', 'minimal'])('offers bulk actions in %s', async viewMode => {
    renderList(viewMode);
    await more().trigger('click');
    expect(wrapper.get('[role="menu"]').isVisible()).toBe(true);
    await action('Save all visible articles').trigger('click');
    expect(wrapper.emitted('bulk-action')[0][0]).toEqual({ action: 'favorite-visible', selectedArticleId: 1 });
    expect(more().attributes('aria-expanded')).toBe('false');
  });

  it('uses the keyboard-selected article for relative actions', async () => {
    renderList('summarized');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    await more().trigger('click');
    await action('Mark articles above as read').trigger('click');
    expect(wrapper.emitted('bulk-action')[0][0]).toEqual({ action: 'mark-above-read', selectedArticleId: 2 });
  });

  it('offers the menu when the collection context is absent', async () => {
    renderList('minimal', 'briefing');
    await more().trigger('click');
    expect(action('Mark all visible as read').isVisible()).toBe(true);
  });

  it('disables relative actions without a current article and closes on Escape', async () => {
    const stores = createFocusedStores();
    wrapper = mount(ArticleBulkActionMenu, { props: { articleCount: 0 }, global: { plugins: [stores.pinia] } });
    await more().trigger('click');
    expect(action('Mark older than current article as read').attributes('disabled')).toBeDefined();
    expect(action('Mark articles above as read').attributes('disabled')).toBeDefined();
    expect(action('Mark articles below as read').attributes('disabled')).toBeDefined();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(more().attributes('aria-expanded')).toBe('false');
  });

  it('opens the smart folder dialog from the menu', async () => {
    const stores = createFocusedStores({ selection: { currentSelection: { status: 'unread', search: 'science' } } });
    wrapper = mount(ArticleBulkActionMenu, { props: { articleCount: 0 }, global: { plugins: [stores.pinia] } });
    await more().trigger('click');
    await action('Save as smart folder').trigger('click');
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true);
  });
});
