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
