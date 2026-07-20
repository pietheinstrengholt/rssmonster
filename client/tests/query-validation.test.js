import { describe, expect, it } from 'vitest';
import {
  knownKeywords,
  validateSearchQuery,
  validateSmartFolderQuery
} from '../src/services/queryValidation.js';

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
