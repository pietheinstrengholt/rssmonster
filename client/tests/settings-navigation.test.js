import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Settings from '../src/components/settings/Settings.vue';
import SettingsSectionError from '../src/components/settings/SettingsSectionError.vue';
import SettingsSectionLoading from '../src/components/settings/SettingsSectionLoading.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

// This function returns the settings navigation for the requested AI state.
const getSettingsNavigation = (AIEnabled, role = 'user') => {
  const stores = createFocusedStores({
    auth: { role },
    selection: { currentSelection: { AIEnabled } }
  });
  return Settings.computed.settingsNavigation.call(stores);
};

// This function mounts Settings with the requested feature and role visibility.
const mountSettings = ({ AIEnabled = false, role = 'user', stubs = {} } = {}) => {
  const stores = createFocusedStores({
    auth: { role },
    selection: {
      currentSelection: {
        AIEnabled,
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0
      }
    },
    overview: { fetchSmartFolders: vi.fn().mockResolvedValue() }
  });
  return mount(Settings, {
    attachTo: document.body,
    global: {
      plugins: [stores.pinia],
      stubs
    }
  });
};

// This function selects a settings section by its visible navigation label.
const selectSettingsSection = async (wrapper, label) => {
  await flushPromises();
  const navigationButton = wrapper
    .findAll('.settings-sidebar-item')
    .find(button => button.text() === label);

  expect(navigationButton).toBeDefined();
  navigationButton.element.focus();
  await navigationButton.trigger('click');
  await flushPromises();
  return navigationButton;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Settings navigation', () => {
  // Verifies the modal exposes the stable feature boundary that contains shared Settings CSS.
  it('renders the Settings ownership boundary', () => {
    const wrapper = mountSettings();

    expect(wrapper.get('.settings-surface').classes()).toContain('settings-overlay');
    expect(wrapper.get('.settings-surface .settings-dialog').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows Smart Folders when AI features are disabled', () => {
    const navigation = getSettingsNavigation(false);
    const smartFolders = navigation.find(item => item.key === 'smartfolders');

    expect(smartFolders).toMatchObject({
      label: 'Smart Folders',
      description: 'Create dynamic saved searches',
      visible: true
    });
  });

  it('continues to hide settings that require AI when AI features are disabled', () => {
    const navigation = getSettingsNavigation(false);

    expect(navigation.find(item => item.key === 'scores')?.visible).toBe(false);
    expect(navigation.find(item => item.key === 'topics')?.visible).toBe(false);
    expect(navigation.find(item => item.key === 'islands')?.visible).toBe(false);
  });

  it('preserves admin-only visibility for Manage Users', () => {
    expect(getSettingsNavigation(true, 'admin').find(item => item.key === 'users')?.visible).toBe(true);
    expect(getSettingsNavigation(true, 'user').find(item => item.key === 'users')?.visible).toBe(false);
  });

  // Verifies unknown section state falls back to the welcome component and overview copy.
  it('falls back safely when an unknown section is selected', () => {
    const context = {
      active: 'missing',
      activeNavigationItem: undefined
    };

    expect(Settings.computed.activeSectionDescription.call(context)).toBe('Settings — Overview');
    expect(Settings.computed.activeComponent.call(context)).toBe('SettingsWelcome');
  });

  // Verifies feed detail state updates only the persistent Settings subtitle.
  it('describes feed details while keeping Feeds as the active section', () => {
    expect(Settings.computed.activeSectionDescription.call({
      active: 'feeds',
      feedDetailsActive: true,
      activeNavigationItem: { label: 'Feeds', description: 'Manage RSS subscriptions' }
    })).toBe('Settings — Feeds — Feed details');
  });

  it('opens the always-available Smart Folders async section', async () => {
    const wrapper = mountSettings();

    expect(wrapper.get('#settings-welcome-title').text()).toBe('Welcome to Settings');

    const navigationButton = await selectSettingsSection(wrapper, 'Smart Folders');
    await vi.waitFor(() => {
      expect(wrapper.find('.smart-folders-hero h3').exists()).toBe(true);
    }, { timeout: 3000 });

    expect(wrapper.get('.smart-folders-hero h3').text()).toBe('Smart Folders');
    expect(document.activeElement).toBe(navigationButton.element);
    wrapper.unmount();
  });

  it('opens an AI-dependent async section when AI features are enabled', async () => {
    const wrapper = mountSettings({ AIEnabled: true });

    await selectSettingsSection(wrapper, 'Scores');
    await vi.waitFor(() => {
      expect(wrapper.find('#scores-intro-title').exists()).toBe(true);
    });

    expect(wrapper.get('#scores-intro-title').text()).toBe('About AI Content Scoring');
    expect(wrapper.get('.settings-subtitle').text()).toContain('Scores');
    wrapper.unmount();
  });

  it('keeps navigation focus while an async section is loading', async () => {
    const wrapper = mountSettings({
      stubs: {
        SettingsSmartFolders: SettingsSectionLoading
      }
    });

    const navigationButton = await selectSettingsSection(wrapper, 'Smart Folders');
    const loadingState = wrapper.get('[role="status"]');

    expect(loadingState.attributes('aria-live')).toBe('polite');
    expect(loadingState.attributes('aria-atomic')).toBe('true');
    expect(document.activeElement).toBe(navigationButton.element);
    wrapper.unmount();
  });

  it('keeps navigation focus when an async section shows its error state', async () => {
    const wrapper = mountSettings({
      stubs: {
        SettingsSmartFolders: SettingsSectionError
      }
    });

    const navigationButton = await selectSettingsSection(wrapper, 'Smart Folders');
    const errorState = wrapper.get('[role="alert"]');

    expect(errorState.text()).toContain('Could not load this section');
    expect(errorState.attributes('aria-live')).toBe('assertive');
    expect(errorState.attributes('aria-atomic')).toBe('true');
    expect(document.activeElement).toBe(navigationButton.element);
    wrapper.unmount();
  });

  // Verifies child save events are forwarded as a Settings refresh request.
  it('forwards saved section events as force reload requests', async () => {
    const wrapper = mountSettings({
      stubs: {
        SettingsWelcome: {
          name: 'SettingsWelcomeStub',
          template: '<div />',
          emits: ['close', 'saved', 'forceReload']
        }
      }
    });
    await flushPromises();

    const section = wrapper.findComponent({ name: 'SettingsWelcomeStub' });
    section.vm.$emit('saved');
    section.vm.$emit('forceReload');
    section.vm.$emit('close');
    await wrapper.get('.settings-close-button').trigger('click');
    await flushPromises();

    expect(wrapper.vm.active).toBe('welcome');
    expect(wrapper.emitted('forceReload')).toHaveLength(2);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  // Verifies section changes restore a connected navigation button when focus leaves the dialog.
  it('restores navigation focus after a section change', () => {
    const navigationButton = {
      isConnected: true,
      focus: vi.fn()
    };
    const context = {
      active: 'welcome',
      $refs: {
        settingsDialog: {
          contains: vi.fn(() => false)
        }
      },
      $nextTick: callback => callback()
    };

    Settings.methods.selectSection.call(context, 'actions', {
      currentTarget: navigationButton
    });

    expect(context.active).toBe('actions');
    expect(navigationButton.focus).toHaveBeenCalledOnce();
  });
});
