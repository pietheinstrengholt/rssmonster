import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { fetchSettings, saveThemeMode } from '../src/api/settings.js';
import { useUiStore } from '../src/store/ui.js';
import { useSelectionStore } from '../src/store/selection.js';
import DesktopToolbar from '../src/components/shell/DesktopToolbar.vue';

vi.mock('../src/api/settings.js', () => ({
  fetchSettings: vi.fn(),
  saveThemeMode: vi.fn()
}));

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

let pinia;
let wrapper;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  saveThemeMode.mockResolvedValue({});
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  useUiStore().resetSessionState();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local theme and background persistence', () => {
  it('keeps the selected theme after a network failure and retries later', async () => {
    saveThemeMode.mockRejectedValueOnce({ code: 'ERR_NETWORK' });
    wrapper = mount(DesktopToolbar, { global: { plugins: [pinia] } });
    await wrapper.get('button[title="Choose theme"]').trigger('click');
    const dark = wrapper.findAll('[role="menuitemradio"]').find(option => option.text() === 'Dark');
    await dark.trigger('click');
    await flushPromises();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('rssmonster-theme-override')).toBe('dark');
    expect(dark.attributes('aria-checked')).toBe('true');
    expect(saveThemeMode).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(saveThemeMode).toHaveBeenLastCalledWith('dark');
    expect(saveThemeMode).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60000);
    expect(saveThemeMode).toHaveBeenCalledTimes(2);
  });

  it('serializes writes and saves the latest choice after an outstanding save', async () => {
    const slowSave = deferred();
    saveThemeMode.mockReturnValueOnce(slowSave.promise);
    const ui = useUiStore();
    ui.selectThemeMode('dark');
    ui.selectThemeMode('system');
    ui.selectThemeMode('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(saveThemeMode).toHaveBeenCalledTimes(1);
    slowSave.resolve({});
    await flushPromises();
    expect(saveThemeMode.mock.calls.map(([mode]) => mode)).toEqual(['dark', 'light']);
  });

  it('preserves an unsaved choice when account settings refresh', async () => {
    saveThemeMode.mockRejectedValue({ response: { status: 503 } });
    const ui = useUiStore();
    ui.selectThemeMode('dark');
    await flushPromises();
    fetchSettings.mockResolvedValue({ data: { themeMode: 'light' } });
    await useSelectionStore().fetchSettings();
    expect(ui.themeMode).toBe('dark');
  });

  it('ignores stale settings even if the new theme finishes saving first', async () => {
    const settings = deferred();
    fetchSettings.mockReturnValue(settings.promise);
    const loading = useSelectionStore().fetchSettings();
    useUiStore().selectThemeMode('dark');
    await flushPromises();
    settings.resolve({ data: { themeMode: 'light' } });
    await loading;
    expect(useUiStore().themeMode).toBe('dark');
  });

  it('ignores settings loaded while a theme save was still pending', async () => {
    const save = deferred();
    const settings = deferred();
    saveThemeMode.mockReturnValueOnce(save.promise);
    useUiStore().selectThemeMode('dark');
    fetchSettings.mockReturnValueOnce(settings.promise);
    const loading = useSelectionStore().fetchSettings();
    save.resolve({});
    await flushPromises();
    settings.resolve({ data: { themeMode: 'light' } });
    await loading;
    expect(useUiStore().themeMode).toBe('dark');
  });

  it('clears scheduled retries when the session ends', async () => {
    saveThemeMode.mockRejectedValue({ code: 'ERR_NETWORK' });
    useUiStore().selectThemeMode('dark');
    await flushPromises();
    useUiStore().resetSessionState();
    await vi.advanceTimersByTimeAsync(60000);
    expect(saveThemeMode).toHaveBeenCalledTimes(1);
  });

  it('ignores saves completing after the session ends', async () => {
    const save = deferred();
    saveThemeMode.mockReturnValueOnce(save.promise);
    useUiStore().selectThemeMode('dark');
    useUiStore().selectThemeMode('light');
    useUiStore().resetSessionState();
    save.resolve({});
    await flushPromises();
    expect(saveThemeMode).toHaveBeenCalledTimes(1);
    expect(useUiStore().themeMode).toBeNull();
  });

  it('does not retry rejected preferences indefinitely', async () => {
    saveThemeMode.mockRejectedValue({ response: { status: 400 } });
    useUiStore().selectThemeMode('dark');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(90000);
    expect(saveThemeMode).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
