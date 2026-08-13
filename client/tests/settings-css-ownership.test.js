import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import settingsSource from '../src/components/settings/Settings.vue?raw';

const settingsStyles = readFileSync(
  resolve(process.cwd(), 'src/assets/css/settings.css'),
  'utf8'
);
const settingsComponentSources = import.meta.glob(
  '../src/components/settings/**/*.vue',
  { eager: true, import: 'default', query: '?raw' }
);

describe('Settings CSS ownership', () => {
  // Verifies Settings owns the only runtime import of its feature-wide stylesheet.
  it('imports settings.css once at the Settings surface boundary', () => {
    const importOwners = Object.entries(settingsComponentSources)
      .filter(([, source]) => source.includes('assets/css/settings.css'))
      .map(([path]) => path);

    expect(importOwners).toEqual(['../src/components/settings/Settings.vue']);
    expect(settingsSource).toContain('class="settings-surface"');
    expect(settingsSource).not.toContain('settings-overlay"');
  });

  // Verifies shared selectors remain feature-wide while feed-table presentation stays local.
  it('contains shared Settings selectors beneath settings-surface', () => {
    for (const selector of ['action-row', 'info-icon', 'input-invalid']) {
      expect(settingsStyles).toContain(`.settings-surface .${selector}`);
    }

    expect(settingsStyles).not.toContain('.settings-surface .feeds-table');
    expect(settingsStyles).not.toContain("[data-theme='dark'] .settings-surface .settings-dialog p");
    expect(settingsStyles).not.toContain("[data-theme='dark'] .settings-surface .settings-group label");
    expect(settingsStyles).not.toMatch(/\[data-theme='dark'\][^{]*\.settings-(?:dialog|header|content)[^{]*\{[^}]*(?:^|;)\s*color:/ms);
    expect(settingsStyles).not.toMatch(/:root\[data-theme='dark'\]\s*\{[^}]*\bp\s*\{/s);
    expect(settingsComponentSources['../src/components/settings/SettingsFeedsOverview.vue']).not.toMatch(/data-theme='dark'[^\n]*\bp(?:\W|$)/);
  });

  // Verifies the desktop rail keeps long navigation labels on one line without changing the mobile layout.
  it('provides a wide desktop navigation rail', () => {
    expect(settingsStyles).toMatch(/\.settings-surface \.settings-layout\s*\{[^}]*grid-template-columns: 200px minmax\(0, 1fr\);/s);
    expect(settingsStyles).toMatch(/@media \(max-width: 879px\)[\s\S]*?\.settings-surface \.settings-layout\s*\{[^}]*grid-template-columns: 1fr;/);
  });

  // Verifies ordinary Settings pages share a deliberately small presentation vocabulary.
  it('owns shared page, panel, toolbar, action, and state primitives', () => {
    for (const selector of [
      'settings-page',
      'settings-panel',
      'settings-toolbar',
      'settings-control',
      'settings-action-footer',
      'settings-state'
    ]) {
      expect(settingsStyles).toContain(`.settings-surface .${selector}`);
    }

    const sources = Object.values(settingsComponentSources).join('\n');
    for (const className of ['settings-page', 'settings-panel', 'settings-toolbar', 'settings-control', 'settings-action-footer', 'settings-state']) {
      expect(sources).toContain(className);
    }
  });

  it('uses one sticky action zone across editable Settings pages', () => {
    for (const component of [
      'SettingsSmartFolders.vue',
      'SettingsActions.vue',
      'SettingsScores.vue',
      'SettingsOfficialSources.vue'
    ]) {
      const source = settingsComponentSources[`../src/components/settings/${component}`];
      expect(source.match(/class="settings-action-footer"/g)).toHaveLength(1);
    }

    expect(settingsStyles).toMatch(/\.settings-surface \.settings-action-footer\s*\{[^}]*position: sticky;[^}]*bottom: -28px;/s);
    expect(Object.values(settingsComponentSources).join('\n')).not.toMatch(/actions-save-area|scores-actions|official-sources-save-area|settings-section__actions/);
  });

  it('derives Settings control geometry from shared tokens', () => {
    expect(settingsStyles).toMatch(/\.settings-surface \.settings-control\s*\{[^}]*min-height: var\(--control-height-default\);[^}]*border-radius: var\(--radius-control\);/s);
    expect(settingsStyles).toContain('min-height: var(--control-height-compact);');
    expect(settingsStyles).toContain('width: var(--control-height-default);');
  });

  it('uses the same shared treatment for every Settings add action', () => {
    for (const component of [
      'SettingsSmartFolders.vue',
      'SettingsActions.vue',
      'SettingsOfficialSources.vue',
      'smartFolders/SmartFolderInsights.vue'
    ]) {
      const source = settingsComponentSources[`../src/components/settings/${component}`];
      expect(source).toContain('class="app-button settings-add-button"');
    }

    expect(settingsStyles).toMatch(/\.settings-surface \.settings-add-button\s*\{[^}]*background-color: var\(--settings-orange-text\);[^}]*border-color: var\(--settings-orange-text\);[^}]*color: var\(--text-inverted\);/s);
    expect(settingsStyles).toMatch(/\[data-theme='dark'\] \.settings-surface \.settings-add-button\s*\{[^}]*background-color: var\(--settings-orange-bg\);[^}]*border-color: var\(--settings-orange-border\);[^}]*color: var\(--text-inverted\);/s);
  });

  it('leaves the Official Sources save action to the shared primary-button treatment', () => {
    const source = settingsComponentSources['../src/components/settings/SettingsOfficialSources.vue'];

    expect(source).toContain('class="official-sources-save-button app-button app-button--primary"');
    expect(source).not.toMatch(/\.official-sources-save-button\s*[,:{]/);
  });

  it('uses only the dialog, panel, control, and pill radius roles', () => {
    const sources = [settingsStyles, ...Object.values(settingsComponentSources)].join('\n');
    const radiusValues = [...sources.matchAll(/border-radius:\s*([^;]+);/g)]
      .map(([, value]) => value.trim());

    expect(new Set(radiusValues)).toEqual(new Set([
      'var(--radius-dialog)',
      'var(--radius-panel)',
      'var(--radius-control)',
      'var(--radius-pill)',
      'inherit',
      '0'
    ]));
  });

  it('uses the application focus treatment for the initially focused close control', () => {
    expect(settingsStyles).toMatch(/\.settings-surface \.settings-close-button:focus-visible\s*\{[^}]*outline: var\(--focus-ring-width\) solid var\(--focus-ring-color\);[^}]*outline-offset: var\(--focus-ring-offset\);/s);
  });
});
