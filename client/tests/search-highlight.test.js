// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  highlightHtmlText,
  highlightTextSegments,
  parseSearchHighlightTerms
} from '../src/services/searchHighlight.js';
import Article from '../src/components/articles/Article.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';

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

  it.each([Article, ArticleReaderLayout])(
    'suppresses terms from an active Smart Folder query in $name',
    component => {
      const selectionStore = {
        currentSelection: {
          search: 'Windows 11',
          smartFolderId: 4
        }
      };

      expect(component.computed.highlightTerms.call({ selectionStore })).toEqual([]);

      selectionStore.currentSelection.smartFolderId = null;
      expect(component.computed.highlightTerms.call({ selectionStore })).toEqual(['Windows', '11']);
    }
  );
});
