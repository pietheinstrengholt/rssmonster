import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { resolveArticleDateRange, withArticleDateFilters } from '../src/services/articleDateRange.js';
import UnreadSelectionContext from '../src/components/articles/UnreadSelectionContext.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllEnvs();
});

const mountContext = () => {
  const stores = createFocusedStores();
  wrapper = mount(UnreadSelectionContext, {
    attachTo: document.body,
    props: { articleCount: 10, sourceCount: 2 },
    global: { plugins: [stores.pinia] }
  });
  return stores;
};
const trigger = () => wrapper.get('[aria-haspopup="menu"]');
const option = label => wrapper.findAll('[role="menuitemradio"]').find(button => button.text().replace('✓', '').trim() === label);

describe('article calendar ranges', () => {
  const now = new Date(2026, 8, 23, 14, 30).getTime();
  it.each([
    ['today', new Date(2026, 8, 23), new Date(now + 1)],
    ['yesterday', new Date(2026, 8, 22), new Date(2026, 8, 23)],
    ['this-week', new Date(2026, 8, 21), new Date(now + 1)],
    ['this-month', new Date(2026, 8, 1), new Date(now + 1)]
  ])('resolves %s in local calendar time', (value, start, end) => {
    expect(resolveArticleDateRange(value, {}, now)).toEqual({ start, end });
  });

  it('uses Monday across a year boundary and includes both custom calendar dates', () => {
    expect(resolveArticleDateRange('this-week', {}, new Date(2026, 0, 1, 10).getTime()).start).toEqual(new Date(2025, 11, 29));
    expect(resolveArticleDateRange('custom', { start: '2025-12-31', end: '2026-01-01' })).toEqual({ start: new Date(2025, 11, 31), end: new Date(2026, 0, 2) });
    expect(resolveArticleDateRange('custom', { start: '2026-02-30', end: '2026-03-01' })).toBeNull();
    expect(resolveArticleDateRange('custom', { start: '2026-09-23', end: '2026-09-22' })).toBeNull();
  });

  it('respects short and long local days across daylight-saving transitions', () => {
    vi.stubEnv('TZ', 'Europe/Amsterdam');
    const spring = resolveArticleDateRange('yesterday', {}, new Date(2026, 2, 30, 12).getTime());
    expect(spring.start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(spring.end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    const autumn = resolveArticleDateRange('custom', { start: '2026-10-25', end: '2026-10-25' });
    expect(autumn.end - autumn.start).toBe(25 * 3600000);
  });

  it('intersects age and calendar constraints and removes only the calendar restriction for All', () => {
    const selection = { status: 'unread', categoryId: '2', feedId: '4', smartFolderId: 7, search: 'tag:science id:>104 @2026-09-22', sort: 'recommended', grouping: 'event' };
    const state = { ageCutoff: '24h', dateRange: 'this-week' };
    const combined = withArticleDateFilters(selection, state, now);
    expect(combined).toEqual({ ...selection, publishedAfter: new Date(now - 86400000).toISOString(), publishedBefore: new Date(now + 1).toISOString() });
    expect(withArticleDateFilters(combined, { ...state, dateRange: 'all' }, now)).toEqual({ ...selection, publishedAfter: new Date(now - 86400000).toISOString() });
    expect(withArticleDateFilters(combined, { ageCutoff: 'all', dateRange: 'all' }, now)).toEqual(selection);
    expect(withArticleDateFilters({ ...selection, status: 'read' }, state, now)).toEqual({ ...selection, status: 'read' });
    const empty = withArticleDateFilters(selection, { ageCutoff: '24h', dateRange: 'custom', customDateRange: { start: '2025-01-01', end: '2025-01-02' } }, now);
    expect(Date.parse(empty.publishedAfter)).toBeGreaterThan(Date.parse(empty.publishedBefore));
  });
});

describe('calendar dropdown', () => {
  it('defaults to All, toggles the menu, selects an option and preserves the independent age choice', async () => {
    const stores = mountContext();
    stores.selectionStore.setAgeCutoff('3d');
    expect(trigger().text()).toBe('All');
    expect(option('All').attributes('aria-checked')).toBe('true');
    expect(trigger().attributes('aria-expanded')).toBe('false');
    await trigger().trigger('click');
    expect(trigger().attributes('aria-expanded')).toBe('true');
    await trigger().trigger('click');
    expect(trigger().attributes('aria-expanded')).toBe('false');
    await trigger().trigger('click');
    await option('Today').trigger('click');
    expect(trigger().text()).toBe('Today');
    expect(trigger().attributes('aria-expanded')).toBe('false');
    expect(option('Today').attributes('aria-checked')).toBe('true');
    expect(option('Today').text()).toContain('✓');
    expect(stores.selectionStore.ageCutoff).toBe('3d');
    await wrapper.setProps({ articles: [{ id: 1, publishedAt: '2026-01-01T12:00:00Z' }] });
    await flushPromises();
    expect(trigger().text()).toBe('Today');
    expect(stores.selectionStore.dateRange).toBe('today');
  });

  it('closes on outside pointer presses and Escape, and supports keyboard navigation', async () => {
    mountContext();
    await trigger().trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(trigger().attributes('aria-expanded')).toBe('false');
    await trigger().trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    expect(document.activeElement).toBe(option('All').element);
    await option('All').trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(option('Today').element);
    await option('Today').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(trigger().attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger().element);
  });

  it('validates and applies custom dates without changing the filter when cancelled', async () => {
    const stores = mountContext();
    await trigger().trigger('click');
    await option('Custom date...').trigger('click');
    expect(trigger().attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    const dates = wrapper.findAll('input[type="date"]');
    await dates[0].setValue('2026-09-21');
    await dates[1].setValue('2026-09-20');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await dates[1].setValue('2026-09-23');
    await wrapper.get('form').trigger('submit');
    expect(stores.selectionStore.dateRange).toBe('custom');
    expect(stores.selectionStore.customDateRange).toEqual({ start: '2026-09-21', end: '2026-09-23' });
    expect(trigger().text()).toBe('Custom date...');
    expect(wrapper.find('form').exists()).toBe(false);
    await trigger().trigger('click');
    await option('Custom date...').trigger('click');
    await wrapper.findAll('input')[0].setValue('2026-09-01');
    await wrapper.get('form').trigger('keydown', { key: 'Escape' });
    expect(stores.selectionStore.customDateRange.start).toBe('2026-09-21');
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
