import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SidebarConfigurationModal from '../src/components/dialogs/SidebarConfigurationModal.vue';
import { useAuthStore } from '../src/store/auth.js';
import { useUiStore } from '../src/store/ui.js';
import { fetchSidebarSettings, saveSidebarSettings } from '../src/api/sidebar.js';

vi.mock('../src/api/sidebar.js', () => ({
  fetchSidebarSettings: vi.fn(),
  saveSidebarSettings: vi.fn()
}));

let wrapper;
const defaults = { showTotalCount: true, declutterCounts: true };
const mountDialog = () => {
  const pinia = createPinia();
  const uiStore = useUiStore(pinia);
  uiStore.setShowModal('SidebarConfiguration');
  wrapper = mount(SidebarConfigurationModal, {
    global: { plugins: [pinia], stubs: { BootstrapIcon: true } }
  });
  return uiStore;
};
beforeEach(() => {
  vi.resetAllMocks();
  fetchSidebarSettings.mockResolvedValue({ data: { settings: defaults } });
  saveSidebarSettings.mockImplementation(async settings => ({ data: { settings } }));
});
afterEach(() => wrapper?.unmount());

describe('Sidebar configuration dialog', () => {
  it('loads saved values and updates the sidebar only after saving', async () => {
    fetchSidebarSettings.mockResolvedValue({ data: { settings: { ...defaults, showTotalCount: false } } });
    const uiStore = mountDialog();
    expect(wrapper.get('[role="switch"]').element.disabled).toBe(true);
    await flushPromises();
    expect(wrapper.get('h2').text()).toBe('Sidebar configuration settings');
    const switches = wrapper.findAll('[role="switch"]');
    expect(switches).toHaveLength(2);
    expect(switches[0].element.checked).toBe(false);
    await switches[0].setValue(true);
    await switches[1].setValue(false);
    expect(uiStore.sidebarSettings).toEqual({ showTotalCount: false, declutterCounts: true });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenCalledWith({ showTotalCount: true, declutterCounts: false });
    expect(uiStore.sidebarSettings).toEqual({ showTotalCount: true, declutterCounts: false });
    expect(uiStore.showModal).toBe('');
  });

  it('cancels without saving draft values', async () => {
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[role="switch"]').setValue(false);
    await wrapper.get('button[aria-label="Close sidebar settings"]').trigger('click');
    expect(uiStore.showModal).toBe('');
    expect(uiStore.sidebarSettings).toEqual(defaults);
    expect(saveSidebarSettings).not.toHaveBeenCalled();
  });

  it('prevents saving when loading fails', async () => {
    fetchSidebarSettings.mockRejectedValue(new Error('offline'));
    mountDialog();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).not.toHaveBeenCalled();
  });

  it('keeps saved counts unchanged on failure and permits retry', async () => {
    saveSidebarSettings.mockRejectedValueOnce(new Error('offline'));
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[role="switch"]').setValue(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be saved');
    expect(uiStore.sidebarSettings).toEqual(defaults);
    expect(uiStore.showModal).toBe('SidebarConfiguration');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(uiStore.sidebarSettings.showTotalCount).toBe(false);
    expect(uiStore.showModal).toBe('');
  });

  it('blocks duplicate saves and dismissal while saving', async () => {
    let resolve;
    saveSidebarSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).toHaveBeenCalledTimes(1);
    expect(wrapper.get('button[aria-label="Close sidebar settings"]').element.disabled).toBe(true);
    resolve({ data: { settings: defaults } });
    await flushPromises();
    expect(uiStore.showModal).toBe('');
  });

  it('ignores a save completing after logout', async () => {
    let resolve;
    saveSidebarSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[role="switch"]').setValue(false);
    await wrapper.get('form').trigger('submit');
    useAuthStore().clearSession();
    resolve({ data: { settings: { showTotalCount: false, declutterCounts: false } } });
    await flushPromises();
    expect(uiStore.sidebarSettings).toEqual(defaults);
  });

  it('ignores a late load after the dialog is closed', async () => {
    let resolve;
    fetchSidebarSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const uiStore = mountDialog();
    wrapper.unmount();
    resolve({ data: { settings: { showTotalCount: false, declutterCounts: false } } });
    await flushPromises();
    expect(uiStore.sidebarSettings).toEqual(defaults);
  });
});
