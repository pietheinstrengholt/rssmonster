import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const documentation = read('src/assets/styles/README.md');
const themeSource = read('src/assets/styles/theme.css');

const documentedTokens = [
  ...documentation.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)
].map((match) => match[1]);
const registeredTokens = new Set(
  [...themeSource.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((match) => match[1])
);

describe('theme documentation', () => {
  it('only documents tokens that exist in the theme registry', () => {
    expect([...new Set(documentedTokens)].filter((token) => !registeredTokens.has(token))).toEqual([]);
  });

  it('does not reference the retired aspirational sidebar palette', () => {
    for (const token of ['--bg-sidebar', '--bg-toolbar', '--bg-menu-item', '--bg-selected-soft']) {
      expect(documentation).not.toContain(token);
    }
  });
});
