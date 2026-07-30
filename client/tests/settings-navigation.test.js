import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Settings from '../src/components/model/Settings.vue';

// This function returns the settings navigation for the requested AI state.
const getSettingsNavigation = (AIEnabled, role = 'user') => Settings.computed.settingsNavigation.call({
  $store: {
    data: { currentSelection: { AIEnabled } },
    auth: { getRole: role }
  }
});

// This function mounts Settings with the requested feature and role visibility.
const mountSettings = ({ AIEnabled = false, role = 'user' } = {}) => mount(Settings, {
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
    }
  }
});

// This function selects a settings section by its visible navigation label.
const selectSettingsSection = async (wrapper, label) => {
  const navigationButton = wrapper
    .findAll('.settings-sidebar-item')
    .find(button => button.text() === label);

  expect(navigationButton).toBeDefined();
  await navigationButton.trigger('click');
  await flushPromises();
};

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

    await selectSettingsSection(wrapper, 'Smart Folders');
    await vi.waitFor(() => {
      expect(wrapper.find('.smart-folders-hero h3').exists()).toBe(true);
    });

    expect(wrapper.get('.smart-folders-hero h3').text()).toBe('Smart Folders');
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
});
