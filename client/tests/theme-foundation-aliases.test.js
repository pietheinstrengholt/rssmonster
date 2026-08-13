import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/styles/theme.css'), 'utf8');
const lightTheme = themeSource.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? '';
const darkTheme = themeSource.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)?.[1] ?? '';

describe('theme foundation aliases', () => {
  it('defines the canonical surface hierarchy in both themes', () => {
    for (const token of [
      '--surface-page',
      '--surface-chrome',
      '--surface-card',
      '--surface-control',
      '--surface-hover',
      '--surface-selected',
      '--surface-disabled'
    ]) {
      expect(lightTheme).toContain(`${token}:`);
      expect(darkTheme).toContain(`${token}:`);
    }
  });

  it('derives repeated light text and selected colors from foundation tokens', () => {
    expect(lightTheme).toContain('--text-muted: var(--text-secondary);');
    expect(lightTheme).toContain('--text-placeholder: var(--text-secondary);');
    expect(lightTheme).toContain('--text-icon: var(--text-primary);');
    expect(lightTheme).toContain('--color-primary-soft: var(--surface-selected);');
    expect(lightTheme).toContain('--badge-similar-bg: var(--surface-selected);');
    expect(lightTheme).toContain('--reader-list-item-selected-background: var(--surface-selected);');
  });

  it('derives supporting dark surfaces from the canonical hierarchy', () => {
    expect(darkTheme).toContain('--surface-hover: var(--surface-chrome);');
    expect(darkTheme).toContain('--surface-control: var(--surface-chrome);');
    expect(darkTheme).toContain('--surface-disabled: var(--surface-chrome);');
    expect(darkTheme).toContain('--bg-input: var(--surface-card);');
    expect(darkTheme).toContain('--bg-bounce: var(--surface-page);');
    expect(darkTheme).toContain('--text-placeholder: var(--text-muted);');
    expect(darkTheme).toContain('--text-icon: var(--text-primary);');
    expect(darkTheme).toContain('--text-muted: #8B95A5;');
    expect(darkTheme).toContain('--text-tertiary: #6B7280;');
  });

  it('does not define retired ambiguous surface names', () => {
    for (const token of ['--bg-secondary', '--bg-muted', '--bg-option', '--bg-subtle', '--bg-primary']) {
      expect(themeSource).not.toContain(token);
    }
  });
});
