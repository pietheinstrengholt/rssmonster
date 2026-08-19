import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstallPrompt from '../src/components/shared/InstallPrompt.vue';

const installationMocks = vi.hoisted(() => ({
  isIOS: vi.fn(),
  isStandalone: vi.fn()
}));

vi.mock('../src/services/appInstallation.js', () => ({
  isIOSDevice: installationMocks.isIOS,
  isStandaloneWebApp: installationMocks.isStandalone
}));

describe('install guidance', () => {
  beforeEach(() => {
    localStorage.clear();
    installationMocks.isIOS.mockReturnValue(false);
    installationMocks.isStandalone.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures the Chromium install event and prompts only after a click', async () => {
    const prompt = vi.fn().mockResolvedValue();
    const event = new Event('beforeinstallprompt');
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) }
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const wrapper = mount(InstallPrompt);

    window.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
    await wrapper.get('.install-prompt__install').trigger('click');
    await flushPromises();
    expect(prompt).toHaveBeenCalledOnce();
    expect(wrapper.find('.install-prompt').exists()).toBe(false);
  });

  it('shows manual Add to Home Screen guidance on iOS', async () => {
    installationMocks.isIOS.mockReturnValue(true);
    const wrapper = mount(InstallPrompt);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Use the browser Share menu');
    expect(wrapper.find('.install-prompt__install').exists()).toBe(false);
  });

  it('does not offer installation from an installed app', () => {
    installationMocks.isIOS.mockReturnValue(true);
    installationMocks.isStandalone.mockReturnValue(true);

    expect(mount(InstallPrompt).find('.install-prompt').exists()).toBe(false);
  });

  it('hides a captured prompt when installation completes elsewhere', async () => {
    const event = new Event('beforeinstallprompt');
    Object.defineProperties(event, {
      prompt: { value: vi.fn() },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) }
    });
    const wrapper = mount(InstallPrompt);
    window.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    window.dispatchEvent(new Event('appinstalled'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.install-prompt').exists()).toBe(false);
  });

  it('keeps guidance dismissed across app sessions in the same browser', async () => {
    installationMocks.isIOS.mockReturnValue(true);
    const wrapper = mount(InstallPrompt);
    await wrapper.vm.$nextTick();

    await wrapper.get('.install-prompt__dismiss').trigger('click');
    expect(localStorage.getItem('rssmonster-install-prompt-dismissed')).toBe('true');
    expect(wrapper.find('.install-prompt').exists()).toBe(false);

    wrapper.unmount();
    expect(mount(InstallPrompt).find('.install-prompt').exists()).toBe(false);
  });
});
