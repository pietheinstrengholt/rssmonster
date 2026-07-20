import { describe, expect, it } from 'vitest';
import Settings from '../src/components/model/Settings.vue';

// This function returns the settings navigation for the requested AI state.
const getSettingsNavigation = (AIEnabled) => Settings.computed.settingsNavigation.call({
  $store: {
    data: { currentSelection: { AIEnabled } },
    auth: { getRole: 'user' }
  }
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
});
