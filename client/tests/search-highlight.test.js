// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  highlightHtmlText,
  highlightTextSegments,
  parseSearchHighlightTerms
} from '../src/services/searchHighlight.js';

describe('search highlighting', () => {
  it('keeps quoted phrases together and unquoted terms separate', () => {
    expect(parseSearchHighlightTerms('"Windows 11" unread:true sort:desc')).toEqual(['Windows 11']);
    expect(parseSearchHighlightTerms('windows 11 unread:true')).toEqual(['windows', '11']);
  });

  it('extracts title text while ignoring non-text filters and quoted dates', () => {
    expect(parseSearchHighlightTerms('title:"Windows 11" tag:microsoft @"2 days ago"')).toEqual(['Windows 11']);
    expect(parseSearchHighlightTerms('briefing:true @today')).toEqual([]);
  });

  it('splits plain text case-insensitively without interpreting markup', () => {
    expect(highlightTextSegments('Windows <11>', ['windows', '<11>'])).toEqual([
      { text: 'Windows', highlighted: true },
      { text: ' ', highlighted: false },
      { text: '<11>', highlighted: true }
    ]);
  });

  it('highlights only HTML text nodes and preserves links and attributes', () => {
    const html = highlightHtmlText(
      '<p>Windows <a href="/windows-11">Windows 11</a></p>',
      ['Windows 11']
    );

    expect(html).toContain('<a href="/windows-11"><mark class="search-highlight">Windows 11</mark></a>');
    expect(html).not.toContain('/<mark');
  });
});
