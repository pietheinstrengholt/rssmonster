import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Settings from '../src/components/model/Settings.vue';
import SettingsSectionError from '../src/components/model/SettingsSectionError.vue';
import SettingsSectionLoading from '../src/components/model/SettingsSectionLoading.vue';

// This function returns the settings navigation for the requested AI state.
const getSettingsNavigation = (AIEnabled, role = 'user') => Settings.computed.settingsNavigation.call({
  $store: {
    data: { currentSelection: { AIEnabled } },
    auth: { getRole: role }
  }
});

// This function mounts Settings with the requested feature and role visibility.
const mountSettings = ({ AIEnabled = false, role = 'user', stubs = {} } = {}) => mount(Settings, {
  attachTo: document.body,
  global: {
    mocks: {
      $store: {
        data: {
          currentSelection: {
            AIEnabled,
            minAdvertisementScore: 0,
            minSentimentScore: 0,
            minQualityScore: 0
          },
          smartFolders: []
        },
        auth: {
          getRole: role,
          token: null
        }
      }
    },
    stubs
  }
});

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

  it('opens the always-available Smart Folders async section', async () => {
    const wrapper = mountSettings();

    expect(wrapper.get('#settings-welcome-title').text()).toBe('Welcome to Settings');

    const navigationButton = await selectSettingsSection(wrapper, 'Smart Folders');
    await vi.waitFor(() => {
      expect(wrapper.find('.smart-folders-hero h3').exists()).toBe(true);
    });

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
});
