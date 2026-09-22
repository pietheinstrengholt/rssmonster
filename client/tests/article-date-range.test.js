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
  vi.useRealTimers();
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
    ['day-before-yesterday', new Date(2026, 8, 21), new Date(2026, 8, 22)],
    ['this-month', new Date(2026, 8, 1), new Date(now + 1)]
  ])('resolves %s in local calendar time', (value, start, end) => {
    expect(resolveArticleDateRange(value, {}, now)).toEqual({ start, end });
  });

  it('uses calendar days across a year boundary and includes both custom calendar dates', () => {
    expect(resolveArticleDateRange('day-before-yesterday', {}, new Date(2026, 0, 1, 10).getTime()).start).toEqual(new Date(2025, 11, 30));
    expect(resolveArticleDateRange('custom', { start: '2025-12-31', end: '2026-01-01' })).toEqual({ start: new Date(2025, 11, 31), end: new Date(2026, 0, 2) });
    expect(resolveArticleDateRange('custom', { start: '2026-02-30', end: '2026-03-01' })).toBeNull();
    expect(resolveArticleDateRange('custom', { start: '2026-09-23', end: '2026-09-22' })).toBeNull();
  });

  it('respects short and long local days across daylight-saving transitions', () => {
    vi.stubEnv('TZ', 'Europe/Amsterdam');
    const spring = resolveArticleDateRange('yesterday', {}, new Date(2026, 2, 30, 12).getTime());
    expect(spring.start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(spring.end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(resolveArticleDateRange('day-before-yesterday', {}, new Date(2026, 2, 31, 12).getTime())).toEqual(spring);
    const autumn = resolveArticleDateRange('custom', { start: '2026-10-25', end: '2026-10-25' });
    expect(autumn.end - autumn.start).toBe(25 * 3600000);
  });

  it.each([['24h', 24], ['3d', 72], ['7d', 168]])('uses a rolling %s window ending now', (ageCutoff, hours) => {
    const query = withArticleDateFilters({ status: 'unread' }, { dateRange: 'all', ageCutoff }, now);
    expect(query.publishedAfter).toBe(new Date(now - hours * 3600000).toISOString());
    expect(query.publishedBefore).toBe(new Date(now + 1).toISOString());
  });

  it('distinguishes calendar days from 24h and removes only the chosen restriction', () => {
    const selection = { status: 'unread', categoryId: '2', feedId: '4', search: 'tag:science' };
    const today = withArticleDateFilters(selection, { dateRange: 'today', ageCutoff: 'all' }, now);
    const yesterday = withArticleDateFilters(selection, { dateRange: 'yesterday', ageCutoff: 'all' }, now);
    const rolling = withArticleDateFilters(selection, { dateRange: 'all', ageCutoff: '24h' }, now);
    expect(today.publishedAfter).not.toBe(rolling.publishedAfter);
    expect(yesterday.publishedAfter).not.toBe(rolling.publishedAfter);
    expect(yesterday.publishedBefore).not.toBe(rolling.publishedBefore);
    expect(withArticleDateFilters(selection, { dateRange: 'today', ageCutoff: '24h' }, now)).toEqual(today);
    const combined = withArticleDateFilters(selection, { dateRange: 'yesterday', ageCutoff: '24h' }, now);
    expect(combined).toEqual({ ...selection, publishedAfter: rolling.publishedAfter, publishedBefore: yesterday.publishedBefore });
    expect(withArticleDateFilters(combined, { dateRange: 'yesterday', ageCutoff: 'all' }, now)).toEqual(yesterday);
    expect(withArticleDateFilters(combined, { dateRange: 'all', ageCutoff: '24h' }, now)).toEqual(rolling);
  });

  it('intersects age and calendar constraints and removes only the calendar restriction for All', () => {
    const selection = { status: 'unread', categoryId: '2', feedId: '4', smartFolderId: 7, search: 'tag:science id:>104 @2026-09-22', sort: 'recommended', grouping: 'event' };
    const state = { ageCutoff: '24h', dateRange: 'this-month' };
    const combined = withArticleDateFilters(selection, state, now);
    expect(combined).toEqual({ ...selection, publishedAfter: new Date(now - 86400000).toISOString(), publishedBefore: new Date(now + 1).toISOString() });
    expect(withArticleDateFilters(combined, { ...state, dateRange: 'all' }, now)).toEqual({ ...selection, publishedAfter: new Date(now - 86400000).toISOString(), publishedBefore: new Date(now + 1).toISOString() });
    expect(withArticleDateFilters(combined, { ageCutoff: 'all', dateRange: 'all' }, now)).toEqual(selection);
    expect(withArticleDateFilters({ ...selection, status: 'read' }, state, now)).toEqual({ ...selection, status: 'read' });
    const empty = withArticleDateFilters(selection, { ageCutoff: '24h', dateRange: 'custom', customDateRange: { start: '2025-01-01', end: '2025-01-02' } }, now);
    expect(Date.parse(empty.publishedAfter)).toBeGreaterThan(Date.parse(empty.publishedBefore));
  });
});

describe('calendar dropdown', () => {
  it('labels two days ago with its local weekday and stores a stable range value', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 21, 16));
    const stores = mountContext();
    stores.selectionStore.setAgeCutoff('3d');
    await trigger().trigger('click');
    expect(wrapper.findAll('[role="menuitemradio"]').map(button => button.text().replace('✓', '').trim())).toEqual([
      'All', 'Today', 'Yesterday', 'Saturday', 'This month', 'Custom date...'
    ]);
    await option('Saturday').trigger('click');
    expect(trigger().text()).toBe('Saturday');
    expect(stores.selectionStore.dateRange).toBe('day-before-yesterday');
    expect(stores.selectionStore.ageCutoff).toBe('all');
  });

  it('omits the redundant current-date label', async () => {
    mountContext();
    await wrapper.setProps({ articles: [{ id: 1, publishedAt: new Date().toISOString() }] });
    expect(wrapper.find('.unread-selection-context__current-date').exists()).toBe(false);
  });

  it.each(['All', 'Today', 'Yesterday', 'This month'])('resets the age cutoff when selecting %s', async label => {
    const stores = mountContext();
    stores.selectionStore.setAgeCutoff('24h');
    await trigger().trigger('click');
    await option(label).trigger('click');
    expect(trigger().text()).toBe(label);
    expect(stores.selectionStore.ageCutoff).toBe('all');
    const age = wrapper.get('[role="group"][aria-label="Article age"]');
    expect(age.findAll('button').find(button => button.text() === 'All').attributes('aria-pressed')).toBe('true');
  });

  it.each(['24h', '3d', '7d', 'all'])('resets Yesterday when selecting age %s', async value => {
    const stores = mountContext();
    await trigger().trigger('click');
    await option('Yesterday').trigger('click');
    const age = wrapper.get('[role="group"][aria-label="Article age"]');
    await age.findAll('button').find(button => button.text().toLowerCase() === value).trigger('click');
    expect(trigger().text()).toBe('All');
    expect(stores.selectionStore.dateRange).toBe('all');
    expect(stores.selectionStore.ageCutoff).toBe(value);
  });

  it('defaults to All, toggles the menu, selects an option and resets the age choice', async () => {
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
    expect(stores.selectionStore.ageCutoff).toBe('all');
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
    stores.selectionStore.setAgeCutoff('3d');
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
    expect(stores.selectionStore.ageCutoff).toBe('all');
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
