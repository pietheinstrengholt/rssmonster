import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import DesktopToolbar from '../src/components/shell/DesktopToolbar.vue';
import { useSelectionStore } from '../src/store/selection.js';
import { useOverviewStore } from '../src/store/overview.js';
import { getRecentSearches, saveRecentSearches } from '../src/services/recentSearches.js';

let wrapper;
let search;
function mountToolbar() {
  const pinia = createPinia();
  search = vi.spyOn(useSelectionStore(pinia), 'setSelectedSearch').mockImplementation(() => {});
  wrapper = mount(DesktopToolbar, { attachTo: document.body, global: { plugins: [pinia] } });
  return wrapper.get('input');
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers(); vi.restoreAllMocks(); });

it.each([
  ['metroid', 'none', false],
  ['metroid sort:quality developing:true', 'event', true]
])('replaces Daily Briefing with the navbar expression %s', async (query, grouping, includeDevelopingEvents) => {
  const input = mountToolbar();
  search.mockRestore();
  const store = useSelectionStore();
  vi.spyOn(useOverviewStore(), 'fetchTopTags').mockResolvedValue([]);
  store.setBriefingFilters({
    selectionPeriod: '24h',
    includeOnlyUnreadArticles: true,
    showOnlyDevelopingEventArticles: true
  });
  store.setSelectedStatus('briefing');

  await input.setValue(query);
  await vi.advanceTimersByTimeAsync(300);

  expect(store.currentSelection).toMatchObject({
    status: 'unread',
    search: query,
    sort: 'desc',
    grouping,
    includeDevelopingEvents
  });
  store.setBriefingSelectionPeriod('7d');
  expect(store.currentSelection.search).toBe(query);

  await input.setValue('');
  await vi.advanceTimersByTimeAsync(300);
  expect(store.currentSelection.status).toBe('unread');
  expect(store.currentSelection.search).toBe('');

  store.setSelectedStatus('briefing');
  expect(store.currentSelection.search).toBe('briefing:true unread:true @lastweek sort:recommended');
});

it('opens on shortcut focus and click; Escape and outside press preserve the query', async () => {
  const input = mountToolbar();
  window.dispatchEvent(new CustomEvent('rssmonster:focus-search'));
  await wrapper.vm.$nextTick();
  expect(document.activeElement).toBe(input.element);
  expect(wrapper.find('.search-dropdown').exists()).toBe(true);
  await input.setValue('AI');
  await input.trigger('keydown', { key: 'Escape' });
  expect(wrapper.find('.search-dropdown').exists()).toBe(false);
  expect(input.element.value).toBe('AI');
  await input.trigger('click');
  expect(wrapper.find('.search-dropdown').exists()).toBe(true);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await wrapper.vm.$nextTick();
  expect(wrapper.find('.search-dropdown').exists()).toBe(false);
});

it('debounces examples and stores only executed valid, nonempty queries', async () => {
  const input = mountToolbar();
  await input.trigger('focus');
  expect(wrapper.text()).toContain('No recent searches yet.');
  await wrapper.get('.search-example').trigger('click');
  expect(input.element.value).toBe('title:Verstappen');
  expect(search).not.toHaveBeenCalled();
  expect(getRecentSearches()).toEqual([]);
  await vi.advanceTimersByTimeAsync(300);
  expect(search).toHaveBeenLastCalledWith('title:Verstappen');
  await input.setValue('  tag:Monza  ');
  await input.trigger('keydown', { key: 'Enter' });
  await vi.advanceTimersByTimeAsync(300);
  expect(search).toHaveBeenCalledTimes(2);
  expect(getRecentSearches()).toEqual(['tag:Monza', 'title:Verstappen']);
  await input.setValue('unread:invalid');
  await vi.advanceTimersByTimeAsync(300);
  expect(search).toHaveBeenCalledTimes(2);
  await input.setValue('');
  await vi.advanceTimersByTimeAsync(300);
  expect(getRecentSearches()).toEqual(['tag:Monza', 'title:Verstappen']);
});

it('reuses persisted history, moves repeats first, and removes without searching', async () => {
  saveRecentSearches(['AI', 'title:OpenAI']);
  const input = mountToolbar();
  await input.trigger('focus');
  await wrapper.findAll('.recent-search-select')[1].trigger('click');
  await vi.advanceTimersByTimeAsync(300);
  expect(getRecentSearches()).toEqual(['title:OpenAI', 'AI']);
  await wrapper.get('.recent-search-remove').trigger('click');
  expect(getRecentSearches()).toEqual(['AI']);
  await wrapper.get('.search-clear').trigger('click');
  expect(getRecentSearches()).toEqual([]);
  expect(wrapper.text()).toContain('No recent searches yet.');
  expect(search).toHaveBeenCalledTimes(1);
});

it('bounds, trims and deduplicates history without changing internal syntax', () => {
  expect(saveRecentSearches([' ', null, ' title:"Ada  Lovelace" ', 'AI', 'AI', 'ai'])).toEqual(['title:"Ada  Lovelace"', 'AI', 'ai']);
  saveRecentSearches(Array.from({ length: 12 }, (_, i) => `query${i}`));
  expect(getRecentSearches()).toHaveLength(10);
});

it('tolerates corrupt and unavailable browser storage', () => {
  localStorage.setItem('rssmonster.recentSearches', '{');
  expect(getRecentSearches()).toEqual([]);
  localStorage.setItem('rssmonster.recentSearches', '{}');
  expect(getRecentSearches()).toEqual([]);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
  expect(saveRecentSearches(['AI'])).toEqual(['AI']);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
  expect(getRecentSearches()).toEqual([]);
});
