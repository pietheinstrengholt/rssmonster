import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = resolve('public/manifest.webmanifest');

describe('generated web app manifest', () => {
  it('has stable identity, attributable launch URL, and dedicated maskable icons', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const maskableIcons = manifest.icons.filter(icon => icon.purpose === 'maskable');

    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/?source=pwa');
    expect(maskableIcons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' })
    ]));
    expect(maskableIcons.every(icon => icon.src.includes('-maskable-'))).toBe(true);
  });
});
