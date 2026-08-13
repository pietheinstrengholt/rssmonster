import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readClientSource = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const themeSource = readClientSource('src/assets/styles/theme.css');
const darkTheme = themeSource.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)?.[1] ?? '';
const sidebarSource = readClientSource('src/components/sidebar/Sidebar.vue');
const appSource = readClientSource('src/App.vue');

const tokenHex = (source, token) => source.match(new RegExp(`${token}: #(\\w{6});`))?.[1];
const luminance = hex => {
  const channels = hex.match(/../g)
    .map(channel => Number.parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (foreground, background) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

describe('dark muted text contrast', () => {
  it('keeps functional muted text readable on dark application surfaces', () => {
    const muted = tokenHex(darkTheme, '--text-muted');

    for (const surface of ['--surface-page', '--surface-card', '--surface-chrome']) {
      expect(contrast(muted, tokenHex(darkTheme, surface))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reserves the lower-contrast tertiary token for decorative content', () => {
    expect(sidebarSource).toContain('color: var(--text-muted);');
    expect(sidebarSource).not.toContain('color: var(--text-tertiary);');
    expect(appSource).toMatch(/\.auth-divider \{[^}]*color: var\(--text-tertiary\);/s);
  });
});
