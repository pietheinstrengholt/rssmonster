import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readClientSource = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const themeSource = readClientSource('src/assets/styles/theme.css');
const lightTheme = themeSource.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? '';
const darkTheme = themeSource.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)?.[1] ?? '';
const globalStyles = readClientSource('src/assets/scss/global.scss');

describe('theme color semantics', () => {
  it('keeps brand orange independent from the amber warning palette', () => {
    expect(lightTheme).toContain('--color-brand: #EA650D;');
    expect(lightTheme).toContain('--color-warning: #B45309;');
    expect(darkTheme).toContain('--color-brand: #EA650D;');
    expect(darkTheme).toContain('--color-warning: #F59E0B;');
    expect(lightTheme).not.toContain('--color-warning: var(--color-brand);');
    expect(darkTheme).not.toContain('--color-warning: var(--color-brand);');
  });

  it('defines independent warning actions, surfaces, and borders', () => {
    for (const source of [lightTheme, darkTheme]) {
      for (const token of [
        '--color-warning-action',
        '--color-warning-action-hover',
        '--surface-warning',
        '--surface-warning-hover',
        '--border-warning',
        '--border-warning-strong'
      ]) {
        expect(source).toContain(`${token}:`);
      }
    }

    expect(globalStyles).toContain('background: var(--color-warning-action);');
    expect(globalStyles).toContain('background: var(--color-warning-action-hover);');
    expect(themeSource).toMatch(
      /\.app-notice--warning \{[^}]*color: var\(--color-warning\);[^}]*background-color: var\(--surface-warning\);[^}]*border-color: var\(--border-warning\);/s
    );
  });

  it('keeps feed creation on brand-owned borders and surfaces', () => {
    expect(themeSource).toContain('--settings-orange-border: var(--border-brand);');
    expect(themeSource).toContain('--sidebar-action-add-background: var(--surface-brand-soft);');
    expect(themeSource).toContain('--sidebar-action-add-border: var(--border-brand);');
  });
});
