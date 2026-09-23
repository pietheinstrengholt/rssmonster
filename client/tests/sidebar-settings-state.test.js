import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';
import { fetchSettings } from '../src/api/settings.js';

vi.mock('../src/api/settings.js', () => ({
  fetchSettings: vi.fn(),
  saveViewMode: vi.fn(),
  saveThemeMode: vi.fn()
}));
const defaults = { showTotalCount: true, declutterCounts: true, hideZeroCountItems: false, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false };
const saved = { sectionOrder: ['pinned', 'categories', 'smart-folders', 'all-feeds', 'top-tags'], showTotalCount: false, declutterCounts: false, hideZeroCountItems: true, automaticallyHideInactiveFeeds: true, inactiveFeedDays: 60, sortOrder: 'name', showFeedFavicons: false, sortByCurrentSelection: true };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

describe('Saved sidebar settings', () => {
  it('restores settings during startup and resets them between users', async () => {
    fetchSettings.mockResolvedValue({ data: { sidebarSettings: saved } });
    await useSelectionStore().fetchSettings();
    const ui = useUiStore();
    expect(ui.sidebarSettings).toEqual(saved);
    expect(ui.sidebarSectionOrder).toEqual(saved.sectionOrder);
    ui.resetSessionState();
    expect(ui.sidebarSettings).toEqual(defaults);
    expect(ui.sidebarSectionOrder).toEqual(['pinned', 'smart-folders', 'all-feeds', 'top-tags', 'categories']);
  });

  it('does not overwrite a newly saved preference with an older startup response', async () => {
    let resolve;
    fetchSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = useSelectionStore().fetchSettings();
    useUiStore().setSidebarSettings(saved);
    resolve({ data: { sidebarSettings: defaults } });
    await pending;
    expect(useUiStore().sidebarSettings).toEqual(saved);
  });

  it('ignores startup settings from an invalidated session', async () => {
    let resolve;
    fetchSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const selection = useSelectionStore();
    const pending = selection.fetchSettings();
    selection.invalidateSessionRequests();
    selection.resetSessionState();
    useUiStore().resetSessionState();
    resolve({ data: { sidebarSettings: saved } });
    await pending;
    expect(useUiStore().sidebarSettings).toEqual(defaults);
  });
});
