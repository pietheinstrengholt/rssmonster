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
const defaults = { showTotalCount: true, declutterCounts: true };
const saved = { showTotalCount: false, declutterCounts: false };

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
    ui.resetSessionState();
    expect(ui.sidebarSettings).toEqual(defaults);
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
