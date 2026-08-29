import { describe, expect, it } from 'vitest';

import AppShell, { DIALOG_COMPONENTS } from '../src/AppShell.vue';
import appShellSource from '../src/AppShell.vue?raw';

const supportedDialogs = [
  ['NewCategory', 'NewCategory'],
  ['NewFeed', 'NewFeed'],
  ['DeleteCategory', 'DeleteCategory'],
  ['DeleteFeed', 'DeleteFeed'],
  ['RenameCategory', 'RenameCategory'],
  ['UpdateFeed', 'UpdateFeed'],
  ['Cleanup', 'Cleanup'],
  ['ManageUsers', 'SettingsManageUsers'],
  ['BriefingPreferences', 'BriefingPreferencesModal'],
  ['UnreadConfiguration', 'UnreadConfigurationModal']
];

// Resolves the AppShell computed property against a specific public store identifier.
const resolveActiveDialog = identifier => AppShell.computed.activeDialogComponent.call({
  uiStore: {
    showModal: identifier
  }
});

describe('AppShell dialog registry', () => {
  // Keeps dialogs outside shell scrolling and stacking contexts on compact mobile layouts.
  it('renders the active dialog in the document-level overlay host', () => {
    expect(appShellSource).toMatch(
      /<Teleport to="body">\s*<component :is="activeDialogComponent" v-if="activeDialogComponent" \/>\s*<\/Teleport>/
    );
  });

  // Verifies every supported identifier retains its expected explicit async component.
  it.each(supportedDialogs)('maps %s to %s', async (identifier, expectedName) => {
    const asyncComponent = DIALOG_COMPONENTS[identifier];
    const resolvedComponent = await asyncComponent.__asyncLoader();

    expect(resolveActiveDialog(identifier)).toBe(asyncComponent);
    expect(resolvedComponent.name).toBe(expectedName);
  });

  // Verifies the registry is exhaustive and rejects unsupported store values safely.
  it('renders no dialog for empty or unknown identifiers', () => {
    expect(Object.keys(DIALOG_COMPONENTS)).toEqual(
      supportedDialogs.map(([identifier]) => identifier)
    );
    expect(resolveActiveDialog('')).toBeNull();
    expect(resolveActiveDialog(false)).toBeNull();
    expect(resolveActiveDialog('UnexpectedDialog')).toBeNull();
  });
});
