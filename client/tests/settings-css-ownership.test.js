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
    expect(settingsSource).toContain('class="settings-surface settings-overlay"');
  });

  // Verifies shared selectors remain feature-wide while feed-table presentation stays local.
  it('contains shared Settings selectors beneath settings-surface', () => {
    for (const selector of ['action-row', 'info-icon', 'input-invalid']) {
      expect(settingsStyles).toContain(`.settings-surface .${selector}`);
    }

    expect(settingsStyles).not.toContain('.settings-surface .feeds-table');
    expect(settingsStyles).toContain(":root[data-theme='dark'] .settings-surface .settings-dialog p");
    expect(settingsStyles).not.toMatch(/:root\[data-theme='dark'\]\s*\{[^}]*\bp\s*\{/s);
  });
});
