import { describe, expect, it } from 'vitest';
import {
  expressionPatterns,
  knownKeywords,
  levenshteinDistance,
  normalizeQuerySortAliasesForApi,
  normalizeSortValueForApi,
  validateQuery,
  validateSearchQuery,
  validateSmartFolderQuery
} from '../src/services/queryValidation.js';

describe('query validation fundamentals', () => {
  it('allows empty searches but requires a smart folder expression', () => {
    expect(validateSearchQuery('   ')).toEqual({ valid: true, error: '' });
    expect(validateSmartFolderQuery(null)).toEqual({
      valid: false,
      error: 'Query cannot be empty'
    });
  });

  it('uses the permissive empty-query policy by default', () => {
    expect(validateQuery()).toEqual({ valid: true, error: '' });
  });

  it('leaves API sort values and query aliases unchanged', () => {
    expect(normalizeSortValueForApi('recommended')).toBe('recommended');
    expect(normalizeQuerySortAliasesForApi('sort:quality unread:true'))
      .toBe('sort:quality unread:true');
  });

  it('calculates edit distance for equal, inserted, removed, and replaced characters', () => {
    expect(levenshteinDistance('title', 'title')).toBe(0);
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('', 'tag')).toBe(3);
    expect(levenshteinDistance('read', '')).toBe(4);
  });
});

describe('query validation supported expressions', () => {
  it.each([
    'favorite:true',
    'star:false',
    'unread:true',
    'read:false',
    'clicked:true',
    'seen:false',
    'event:true',
    'developing:true',
    'hot:false',
    'tag:ai',
    'title:"machine learning"',
    'author:"Ada Lovelace"',
    'language:nld',
    'sort:recommended',
    'limit:25',
    'quality:>=0.75',
    'freshness:.5',
    'firstSeen:24h',
    '@today',
    '@yesterday',
    '@lastweek'
  ])('accepts %s', expression => {
    expect(validateSearchQuery(expression)).toEqual({ valid: true, error: '' });
  });

  it.each([
    '@7 days ago',
    '@"14 days ago"',
    '@last monday',
    '@"last Sunday"'
  ])('accepts the multi-word date expression %s', expression => {
    expect(validateSearchQuery(`unread:true ${expression}`))
      .toEqual({ valid: true, error: '' });
  });

  it('accepts comma-separated expressions and trailing punctuation', () => {
    expect(validateSearchQuery('unread:true, tag:science; quality:0.8.'))
      .toEqual({ valid: true, error: '' });
  });

  it('allows ordinary plain-text search terms', () => {
    expect(validateSearchQuery('distributed systems')).toEqual({ valid: true, error: '' });
  });

  it('keeps every documented keyword backed by an expression pattern', () => {
    expect(expressionPatterns.map(pattern => pattern.name))
      .toEqual(expect.arrayContaining(knownKeywords));
  });
});

describe('query validation diagnostics', () => {
  it('reports expressions that were merged without whitespace', () => {
    expect(validateSearchQuery('quality:0.6tag:ai')).toEqual({
      valid: false,
      error: 'Separate expressions with spaces. Example: quality:0.6 tag:ai'
    });
  });

  it('suggests a known keyword for a close misspelling', () => {
    expect(validateSearchQuery('titel:ai')).toEqual({
      valid: false,
      error: 'Unknown keyword "titel". Did you mean "title"?'
    });
  });

  it('lists supported filters for an unrelated keyword', () => {
    expect(validateSearchQuery('publisher:example')).toEqual({
      valid: false,
      error: `Unknown filter: "publisher". Valid filters: ${knownKeywords.join(', ')}`
    });
  });

  it.each(['limit:many', 'sort:newest', '@tomorrow'])(
    'reports the invalid known expression %s',
    expression => {
      expect(validateSearchQuery(expression)).toEqual({
        valid: false,
        error: `Invalid expression: "${expression}"`
      });
    }
  );
});

describe('query validation island filters', () => {
  it('accepts island:true and island:false in searches and smart folders', () => {
    expect(validateSearchQuery('island:true')).toEqual({ valid: true, error: '' });
    expect(validateSmartFolderQuery('unread:true island:false')).toEqual({ valid: true, error: '' });
    expect(knownKeywords).toContain('island');
  });

  it('reports invalid island filter syntax', () => {
    expect(validateSearchQuery('island=yes')).toEqual({
      valid: false,
      error: 'Use colon (:) not equals (=). Example: quality:0.6'
    });
    expect(validateSearchQuery('island:maybe')).toEqual({
      valid: false,
      error: 'Invalid expression: "island:maybe"'
    });
  });
});

describe('query validation briefing filters', () => {
  it('accepts briefing:true and briefing:false in searches and smart folders', () => {
    expect(validateSearchQuery('briefing:true')).toEqual({ valid: true, error: '' });
    expect(validateSmartFolderQuery('unread:true briefing:false')).toEqual({ valid: true, error: '' });
    expect(knownKeywords).toContain('briefing');
  });

  it('reports invalid briefing filter syntax', () => {
    expect(validateSearchQuery('briefing=yes')).toEqual({
      valid: false,
      error: 'Use colon (:) not equals (=). Example: quality:0.6'
    });
    expect(validateSearchQuery('briefing:maybe')).toEqual({
      valid: false,
      error: 'Invalid expression: "briefing:maybe"'
    });
  });
});

describe('query validation developing filters', () => {
  it('accepts developing:true and developing:false in searches and smart folders', () => {
    expect(validateSearchQuery('developing:true')).toEqual({ valid: true, error: '' });
    expect(validateSmartFolderQuery('unread:true developing:false'))
      .toEqual({ valid: true, error: '' });
    expect(knownKeywords).toContain('developing');
  });

  it('reports invalid developing filter syntax', () => {
    expect(validateSearchQuery('developing=yes')).toEqual({
      valid: false,
      error: 'Use colon (:) not equals (=). Example: quality:0.6'
    });
    expect(validateSearchQuery('developing:maybe')).toEqual({
      valid: false,
      error: 'Invalid expression: "developing:maybe"'
    });
  });
});

describe('query validation trust sorting', () => {
  it('accepts trust sorting in searches and smart folders', () => {
    expect(validateSearchQuery('sort:trust')).toEqual({ valid: true, error: '' });
    expect(validateSmartFolderQuery('unread:true sort:trust')).toEqual({ valid: true, error: '' });
  });
});

// Verifies both supported event-count forms without ambiguous whitespace matching.
describe('query validation event count filters', () => {
  it('accepts event counts with and without the minimum-count operator', () => {
    expect(validateSearchQuery('eventCount:2')).toEqual({ valid: true, error: '' });
    expect(validateSearchQuery('eventCount:>=3')).toEqual({ valid: true, error: '' });
  });
});

describe('query validation calendar dates', () => {
  it('accepts real dates, including leap days', () => {
    expect(validateSearchQuery('@2024-02-29')).toEqual({ valid: true, error: '' });
  });

  it.each(['2026-02-31', '2026-99-99', '2025-02-29'])(
    'rejects invalid calendar date %s',
    invalidDate => {
      expect(validateSearchQuery(`@${invalidDate}`)).toEqual({
        valid: false,
        error: `Invalid calendar date: "${invalidDate}"`
      });
    }
  );
});
