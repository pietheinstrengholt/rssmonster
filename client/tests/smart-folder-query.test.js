import { describe, expect, it } from 'vitest';
import {
  buildSmartFolderQuery,
  createEmptySmartFolderConfig,
  normalizeSmartFolderTag,
  parseSmartFolderQuery,
  parseSmartFolderScoreToken,
  quoteSmartFolderValue,
  stripSmartFolderQuotes,
  tokenizeSmartFolderQuery
} from '../src/components/settings/smartFolders/smartFolderQuery.js';

describe('Smart Folder query domain', () => {
  it.each([
    ['security', 'security'],
    [' security, ai ', 'security'],
    ['machine learning', 'machine'],
    ['', '']
  ])('normalizes the supported single tag from %j', (value, expected) => {
    expect(normalizeSmartFolderTag(value)).toBe(expected);
  });

  it.each([
    ['plain', 'plain'],
    ['Daily Brief', '"Daily Brief"'],
    ['Jane "JJ" Doe', '"Jane \\"JJ\\" Doe"']
  ])('quotes generated values without changing established output', (value, expected) => {
    expect(quoteSmartFolderValue(value)).toBe(expected);
    expect(stripSmartFolderQuotes(expected)).toBe(value);
  });

  it('tokenizes quoted field values and free text using the existing boundaries', () => {
    expect(tokenizeSmartFolderQuery(
      'tag:"machine learning" title:"Daily Brief" "free phrase" limit:20'
    )).toEqual([
      'tag:"machine learning"',
      'title:"Daily Brief"',
      '"free phrase"',
      'limit:20'
    ]);
  });

  it.each([
    ['quality:>=0.80', 0.8],
    ['freshness:>=.45', 0.45],
    ['quality:invalid', 0]
  ])('parses score token %j', (token, expected) => {
    expect(parseSmartFolderScoreToken(token)).toBe(expected);
  });

  it('parses every supported editor domain and preserves unknown tokens as free text', () => {
    const config = parseSmartFolderQuery(
      'read:true favorite:true clicked:true hot:true firstSeen:12h '
      + 'tag:"machine learning" title:"Daily Brief" author:Jane language:nl '
      + 'quality:>=0.80 freshness:>=.45 developing:true sort:asc '
      + 'limit:75 unknown:value "free phrase"'
    );

    expect(config).toMatchObject({
      limitCount: 75,
      status: {
        unread: false,
        read: true,
        favorite: true,
        clicked: true,
        hot: true
      },
      date: {
        useRelative: true,
        relativeAmount: 12,
        relativeUnit: 'h'
      },
      content: {
        tags: 'machine',
        title: 'Daily Brief',
        author: 'Jane',
        language: 'nl',
        text: 'unknown:value free phrase'
      },
      scores: {
        quality: 0.8,
        freshness: 0.45
      },
      events: {
        isDeveloping: true,
        isNotDeveloping: false
      },
      sort: { field: 'published-asc' }
    });
  });

  it.each([
    ['@today', '@today'],
    ['@yesterday', '@yesterday'],
    ['@lastweek', '@lastweek'],
    ['@last7days', 'firstSeen:7d'],
    ['@last30days', 'firstSeen:30d']
  ])('preserves the established date mapping for %s', (preset, expectedToken) => {
    const config = createEmptySmartFolderConfig();
    config.date.preset = preset;

    expect(buildSmartFolderQuery(config)).toBe(`${expectedToken} limit:50`);
  });

  it('generates filters in the established order with the established aliases', () => {
    const config = createEmptySmartFolderConfig();
    Object.assign(config, {
      name: 'Configured',
      limitCount: 40,
      status: {
        unread: true,
        read: false,
        favorite: true,
        clicked: true,
        hot: true
      },
      date: {
        preset: '',
        useRelative: true,
        relativeAmount: 3,
        relativeUnit: 'd'
      },
      content: {
        tags: 'security',
        title: 'Daily Brief',
        author: 'Jane Doe',
        text: 'zero trust',
        language: 'en'
      },
      scores: { quality: 0.7, freshness: 0.5 },
      events: {
        isEvent: true,
        isNotEvent: false,
        useMinimumCount: true,
        minimumCount: 3
      },
      sort: { field: 'published-desc' }
    });

    expect(buildSmartFolderQuery(config)).toBe(
      'unread:true favorite:true clicked:true hot:true firstSeen:3d '
      + 'tag:security title:"Daily Brief" author:"Jane Doe" language:en '
      + '"zero trust" quality:>=0.70 freshness:>=0.50 event:true '
      + 'eventCount:>=3 sort:desc limit:40'
    );
  });

  it('round-trips a representable query through the editor configuration', () => {
    const query = 'unread:true favorite:true firstSeen:8h tag:security '
      + 'title:"Daily Brief" author:"Jane Doe" language:en "zero trust" '
      + 'quality:>=0.70 freshness:>=0.50 event:true sort:recommended limit:40';

    expect(buildSmartFolderQuery(parseSmartFolderQuery(query))).toBe(query);
  });

  it('canonicalizes a legacy Trust sort when opening and rebuilding a folder', () => {
    const config = parseSmartFolderQuery('unread:true sort:trust limit:50');

    expect(config.sort.field).toBe('quality');
    expect(buildSmartFolderQuery(config)).toBe('unread:true sort:quality limit:50');
  });

  it.each([
    ['topStories', 'topStories'],
    ['topstories', 'topStories'],
    ['TOPSTORIES', 'topStories']
  ])('canonicalizes the %s Top Stories sort token', (storedSort, expectedSort) => {
    const query = `unread:true sort:${storedSort} limit:50`;

    expect(buildSmartFolderQuery(parseSmartFolderQuery(query)))
      .toBe(`unread:true sort:${expectedSort} limit:50`);
  });

  it.each(['developing:true', 'developing:false'])(
    'round-trips the developing story filter %s',
    developingFilter => {
      const query = `${developingFilter} limit:50`;

      expect(buildSmartFolderQuery(parseSmartFolderQuery(query))).toBe(query);
    }
  );
});
