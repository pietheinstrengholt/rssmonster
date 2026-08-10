import { describe, expect, it } from 'vitest';

import preserveContentKinds from '../../services/feeds/feedsmith/preserveContentKinds.js';
import preserveXmlBases from '../../services/feeds/feedsmith/preserveXmlBases.js';

// This function applies both raw XML preservation steps to one parsed-feed fixture.
const preserveRawEntryMetadata = (parsedFeed, source) => preserveXmlBases(
  preserveContentKinds(parsedFeed, source),
  source
);

describe('raw feed entry correlation', () => {
  it('correlates reordered Atom entries by opaque ID', () => {
    const source = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry xml:base="https://example.com/a/"><id>opaque-a</id>
          <content type="html">A</content></entry>
        <entry xml:base="https://example.com/b/"><id>opaque-b</id>
          <content type="text">B</content></entry>
      </feed>`;
    const parsedFeed = {
      format: 'atom',
      feed: { entries: [{ id: 'opaque-b', content: 'B' }, { id: 'opaque-a', content: 'A' }] }
    };

    preserveRawEntryMetadata(parsedFeed, source);

    expect(parsedFeed.feed.entries).toEqual([
      expect.objectContaining({ id: 'opaque-b', contentKind: 'text', xmlBase: 'https://example.com/b/' }),
      expect.objectContaining({ id: 'opaque-a', contentKind: 'html', xmlBase: 'https://example.com/a/' })
    ]);
  });

  it('keeps correlation aligned when the parser omits an earlier Atom entry', () => {
    const source = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry xml:base="https://example.com/dropped/"><id>dropped</id>
          <content type="html">Dropped</content></entry>
        <entry xml:base="https://example.com/kept/"><id>kept</id>
          <content type="text">Kept</content></entry>
      </feed>`;
    const parsedFeed = {
      format: 'atom',
      feed: { entries: [{ id: 'kept', content: 'Kept' }] }
    };

    preserveRawEntryMetadata(parsedFeed, source);

    expect(parsedFeed.feed.entries[0]).toMatchObject({
      contentKind: 'text',
      xmlBase: 'https://example.com/kept/'
    });
  });

  it('uses unique links when RSS GUIDs are unavailable', () => {
    const source = `
      <rss version="2.0"><channel>
        <item xml:base="https://example.com/a/"><link>/a</link></item>
        <item xml:base="https://example.com/b/"><link>/b</link></item>
      </channel></rss>`;
    const parsedFeed = {
      format: 'rss',
      feed: { entries: [{ link: '/b' }, { link: '/a' }] }
    };

    preserveXmlBases(parsedFeed, source);

    expect(parsedFeed.feed.entries.map(entry => entry.xmlBase)).toEqual([
      'https://example.com/b/',
      'https://example.com/a/'
    ]);
  });

  it('leaves metadata unset when duplicate identities cannot be correlated safely', () => {
    const source = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry xml:base="https://example.com/a/"><id>duplicate</id>
          <content type="html">A</content></entry>
        <entry xml:base="https://example.com/b/"><id>duplicate</id>
          <content type="text">B</content></entry>
      </feed>`;
    const parsedFeed = {
      format: 'atom',
      feed: {
        entries: [
          { id: 'duplicate', content: 'First parsed value' },
          { id: 'duplicate', content: 'Second parsed value' }
        ]
      }
    };

    preserveRawEntryMetadata(parsedFeed, source);

    expect(parsedFeed.feed.entries).toEqual([
      { id: 'duplicate', content: 'First parsed value', xmlBase: null },
      { id: 'duplicate', content: 'Second parsed value', xmlBase: null }
    ]);
  });
});
