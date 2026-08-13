import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads a client source file for structural-token contract assertions.
const readClientSource = path => readFileSync(resolve(process.cwd(), path), 'utf8');

const themeSource = readClientSource('src/assets/styles/theme.css');
const globalStylesSource = readClientSource('src/assets/scss/global.scss');
const preferencesDialogSource = readClientSource('src/components/dialogs/PreferencesDialogShell.vue');

describe('structural design tokens', () => {
  // Verifies the compact foundation retains the established computed values.
  it('defines semantic control, radius, focus, layer, motion, shell, and UI type tokens', () => {
    const expectedTokens = {
      '--control-height-compact': '2rem',
      '--control-height-default': '2.5rem',
      '--control-height-touch': '2.75rem',
      '--radius-compact': '0.375rem',
      '--radius-control': '0.5rem',
      '--radius-panel': '0.875rem',
      '--radius-pill': '999px',
      '--focus-ring-width': '2px',
      '--focus-ring-offset': '2px',
      '--sidebar-width': '266px',
      '--layer-content': '0',
      '--layer-refresh-indicator': '90',
      '--layer-sticky': '100',
      '--layer-dropdown': '1000',
      '--layer-overlay': '2000',
      '--layer-modal': '10000',
      '--layer-notification': '11000',
      '--motion-duration-fast': '0.15s',
      '--motion-duration-normal': '0.2s',
      '--font-size-ui-default': '0.875rem'
    };

    for (const [token, value] of Object.entries(expectedTokens)) {
      expect(themeSource).toContain(`${token}: ${value};`);
    }

    expect(themeSource).toContain('--focus-ring-color: var(--border-focus);');
    expect(themeSource).toContain('--focus-ring-shadow: var(--shadow-focus-primary);');
    expect(globalStylesSource).not.toContain('--sidebar-width:');
  });

  // Verifies shared controls consume the foundation instead of duplicating its values.
  it('adopts structural tokens in shared buttons, forms, dialogs, dropdowns, and notices', () => {
    const migratedSources = [
      globalStylesSource,
      readClientSource('src/components/dialogs/BaseDialog.vue'),
      readClientSource('src/components/shared/AppDropdown.vue'),
      readClientSource('src/components/shared/ActionErrorNotice.vue'),
      readClientSource('src/components/shared/ConnectivityStatus.vue')
    ].join('\n');

    for (const token of [
      '--control-height-default',
      '--radius-control',
      '--focus-ring-color',
      '--layer-dropdown',
      '--layer-modal',
      '--layer-notification',
      '--motion-duration-fast',
      '--font-size-ui-default'
    ]) {
      expect(migratedSources).toContain(`var(${token})`);
    }
  });

  // Verifies icon controls share sizing and interaction states without owning icon content.
  it('defines default and compact semantic icon-button states', () => {
    expect(globalStylesSource).toMatch(
      /\.app-icon-button \{[\s\S]*?width: var\(--control-height-default\);[\s\S]*?height: var\(--control-height-default\);/
    );
    expect(globalStylesSource).toContain('.app-icon-button:hover:not(:disabled)');
    expect(globalStylesSource).toContain('.app-icon-button:active:not(:disabled)');
    expect(globalStylesSource).toMatch(
      /\.app-icon-button:focus-visible \{[\s\S]*?var\(--focus-ring-color\)/
    );
    expect(globalStylesSource).toContain('.app-icon-button:disabled,');
    expect(globalStylesSource).toMatch(
      /\.app-icon-button--compact \{[\s\S]*?width: var\(--control-height-compact\);[\s\S]*?height: var\(--control-height-compact\);/
    );
  });

  // Verifies preference actions retain equal-width mobile layout after adopting shared buttons.
  it('keeps shared preference actions responsive on narrow dialogs', () => {
    expect(preferencesDialogSource).toMatch(
      /@media \(max-width: 575\.98px\)[\s\S]*?\.preferences-dialog__footer-actions \.app-button \{\s*flex: 1;/
    );
  });
});
