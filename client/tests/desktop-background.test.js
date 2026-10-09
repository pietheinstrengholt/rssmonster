import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SettingsDesktopBackground from '../src/components/settings/SettingsDesktopBackground.vue';
import DesktopActivity from '../src/components/shared/DesktopActivity.vue';
import Settings from '../src/components/settings/Settings.vue';
import { desktopActivityLabel } from '../src/services/desktopActivity';
import { fetchDesktopSettings, saveDesktopSettings, fetchDesktopActivity } from '../src/api/desktop';

vi.mock('../src/api/desktop', () => ({ fetchDesktopSettings: vi.fn(), saveDesktopSettings: vi.fn(), fetchDesktopActivity: vi.fn() }));
const settings = { automaticRefresh: true, refreshIntervalMinutes: 15, continueInTray: true, launchAtLogin: false, startMinimized: false };
const response = { settings, capabilities: { tray: true, login: false, loginReason: 'Portable builds may move.' } };
beforeEach(() => {
  vi.resetAllMocks();
  fetchDesktopSettings.mockResolvedValue({ data: response });
  fetchDesktopActivity.mockResolvedValue({ data: { status: 'idle', lastRefreshAt: null } });
  saveDesktopSettings.mockImplementation(async settings => ({ data: { ...response, settings } }));
});
afterEach(() => { vi.useRealTimers(); });
it('saves background settings, clears incompatible minimized state, and explains unavailable sign-in', async () => {
  const wrapper = mount(SettingsDesktopBackground, { global: { stubs: { DesktopActivity: true } } });
  await flushPromises();
  expect(wrapper.get('#launchAtLogin').element.disabled).toBe(true);
  expect(wrapper.text()).toContain('Portable builds may move.');
  await wrapper.get('#startMinimized').setValue(true);
  await wrapper.get('#continueInTray').setValue(false);
  expect(wrapper.get('#startMinimized').element.checked).toBe(false);
  expect(wrapper.get('#startMinimized').element.disabled).toBe(true);
  await wrapper.get('#desktop-refresh-interval').setValue('30');
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveDesktopSettings).toHaveBeenCalledWith({ ...settings, refreshIntervalMinutes: 30, continueInTray: false });
  expect(wrapper.get('[role=status]').text()).toBe('Desktop settings saved.');
  wrapper.unmount();
});
it('retains settings edits and explains rejected saves', async () => {
  saveDesktopSettings.mockRejectedValue({ response: { data: { message: 'System tray is unavailable.' } } });
  const wrapper = mount(SettingsDesktopBackground, { global: { stubs: { DesktopActivity: true } } });
  await flushPromises();
  await wrapper.get('#automaticRefresh').setValue(false);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('System tray is unavailable');
  expect(wrapper.get('#automaticRefresh').element.checked).toBe(false);
  wrapper.unmount();
});
it('navigation appears only for Desktop administrators', () => {
  const navigation = (desktop, role) => Settings.computed.settingsNavigation.call({ selectionStore: { currentSelection: { DesktopEnabled: desktop } }, authStore: { role } }).find(row => row.key === 'desktopBackground').visible;
  expect(navigation(true, 'admin')).toBe(true);
  expect(navigation(false, 'admin')).toBe(false);
  expect(navigation(true, 'user')).toBe(false);
});
it('activity separates feed crawling from AI, displays failures, and stops polling on unmount', async () => {
  vi.useFakeTimers();
  fetchDesktopActivity.mockResolvedValue({ data: { status: 'refreshing', processingArticles: true, lastRefreshAt: null, newArticles: null } });
  const wrapper = mount(DesktopActivity);
  await flushPromises();
  expect(wrapper.text()).toContain('Refreshing feeds · Processing articles');
  fetchDesktopActivity.mockResolvedValue({ data: { status: 'error', lastRefreshAt: null, failedFeeds: 2, newArticles: 0 } });
  await vi.advanceTimersByTimeAsync(5000);
  expect(wrapper.text()).toContain('Some feeds could not be refreshed');
  await wrapper.get('button').trigger('click');
  expect(wrapper.emitted('details')).toHaveLength(1);
  wrapper.unmount();
  const requests = fetchDesktopActivity.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetchDesktopActivity.mock.calls.length).toBe(requests);
  expect(desktopActivityLabel({ status: 'processing' })).toBe('Processing articles…');
  expect(desktopActivityLabel({ status: 'disabled' })).toBe('Automatic refresh disabled');
});
