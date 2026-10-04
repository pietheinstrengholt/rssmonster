import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import SettingsOfflineReading from '../src/components/settings/SettingsOfflineReading.vue';
import { useOfflineReadingStore } from '../src/store/offlineReading.js';
import { offlineAccount, offlineReading } from '../src/services/offlineReading.js';

let pinia;
let profile;
let wrapper;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  profile = { enabled: false, articleLimit: 100, activeGeneration: 'old', preparedArticleCount: 50 };
  const store = useOfflineReadingStore();
  store.account = offlineAccount(1);
  store.profile = profile;
  vi.spyOn(offlineReading, 'getProfile').mockImplementation(async () => profile);
  vi.spyOn(offlineReading, 'updateConfiguration').mockImplementation(async (account, changes) => (profile = { ...profile, ...changes }));
  vi.spyOn(offlineReading, 'refreshSnapshot').mockImplementation(async () => profile);
  vi.spyOn(offlineReading, 'clearSnapshot').mockImplementation(async () => { profile = null; });
  wrapper = mount(SettingsOfflineReading, { global: { plugins: [pinia] } });
});
afterEach(() => { wrapper.unmount(); vi.restoreAllMocks(); });
const button = label => wrapper.findAll('button').find(item => item.text() === label);

describe('offline Settings', () => {
  it('enables downloads, and disabling retains the snapshot', async () => {
    await wrapper.get('input[role="switch"]').setValue(true);
    await flushPromises();
    expect(profile.enabled).toBe(true);
    expect(offlineReading.refreshSnapshot).toHaveBeenCalledOnce();
    await wrapper.get('input[role="switch"]').setValue(false);
    await flushPromises();
    expect(profile.enabled).toBe(false);
    expect(profile.activeGeneration).toBe('old');
    expect(wrapper.text()).toContain('Existing downloads are retained');
    expect(offlineReading.clearSnapshot).not.toHaveBeenCalled();
  });
  it('saves a changed limit and refreshes when enabled', async () => {
    profile.enabled = true;
    useOfflineReadingStore().profile = { ...profile };
    await wrapper.get('input[value="500"]').setValue(true);
    await flushPromises();
    expect(profile.articleLimit).toBe(500);
    expect(offlineReading.refreshSnapshot).toHaveBeenCalledOnce();
  });
  it('allows disabled configuration without downloading', async () => {
    await wrapper.get('input[value="50"]').setValue(true);
    await flushPromises();
    expect(profile.articleLimit).toBe(50);
    expect(offlineReading.refreshSnapshot).not.toHaveBeenCalled();
  });
  it('shows progress and provides Refresh now', async () => {
    profile.enabled = true;
    useOfflineReadingStore().profile = { ...profile };
    await flushPromises();
    let finish;
    offlineReading.refreshSnapshot.mockImplementation((account, progress) => {
      progress({ status: 'preparing', prepared: 72, total: 100 });
      return new Promise(resolve => { finish = resolve; });
    });
    await button('Refresh now').trigger('click');
    expect(wrapper.text()).toContain('72 of 100 articles prepared');
    expect(wrapper.get('progress').attributes('value')).toBe('72');
    expect(button('Refresh now').attributes('disabled')).toBeDefined();
    finish(profile);
    await flushPromises();
    expect(wrapper.find('progress').exists()).toBe(false);
  });
  it('confirms Clear offline data and removes configuration and articles', async () => {
    await button('Clear offline data').trigger('click');
    expect(offlineReading.clearSnapshot).not.toHaveBeenCalled();
    expect(wrapper.get('[role="dialog"]').text()).toContain('Clear offline data?');
    const confirm = wrapper.get('[role="dialog"]').findAll('button').find(item => item.text() === 'Clear offline data');
    await confirm.trigger('click');
    await flushPromises();
    expect(offlineReading.clearSnapshot).toHaveBeenCalledWith(offlineAccount(1));
    expect(wrapper.text()).toContain('No articles downloaded yet.');
    expect(useOfflineReadingStore().profile).toBeNull();
  });
});
