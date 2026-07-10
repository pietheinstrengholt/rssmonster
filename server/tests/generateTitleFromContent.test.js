import { describe, expect, it } from 'vitest';

import generateTitleFromContent from '../services/crawl/generateTitleFromContent.js';

describe('generateTitleFromContent', () => {
  it('returns the first sentence from plain text', () => {
    expect(generateTitleFromContent('First sentence. Second sentence.'))
      .toBe('First sentence.');
  });

  it('removes HTML and normalizes whitespace', () => {
    expect(generateTitleFromContent('<p>A <strong>social</strong> post!</p><p>More text.</p>'))
      .toBe('A social post!');
  });

  it('uses all available text when it has no sentence punctuation', () => {
    expect(generateTitleFromContent('A short social update'))
      .toBe('A short social update');
  });

  it('returns null for empty content', () => {
    expect(generateTitleFromContent('  ')).toBeNull();
  });
});
