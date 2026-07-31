import { Op } from 'sequelize';
import { describe, expect, it } from 'vitest';
import { buildTextSearchWhereClause } from '../../services/articleSearch/articleTextSearch.service.js';

// Reads symbol-keyed Sequelize conditions without depending on dialect rendering.
const andConditions = whereClause => whereClause[Op.and] || [];

describe('articleTextSearch.service', () => {
  // Leaves the predicate empty when no textual intent is present.
  it('returns an empty clause without text filters', () => {
    expect(buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: null,
      remainingTokens: []
    })).toEqual({});
  });

  // Combines a title constraint with quoted body intent using AND semantics.
  it('combines title and quoted body filters', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: 'release',
      quotedPhrase: 'stable channel',
      remainingTokens: []
    });

    expect(andConditions(clause)).toHaveLength(2);
    expect(andConditions(clause)[0].attribute.args[0].col).toBe('title');
    expect(andConditions(clause)[1].attribute.args[0].col).toBe('contentOriginal');
  });

  // Groups remaining body terms as alternatives after a title constraint.
  it('groups title-filter body terms as one OR condition', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: 'release',
      quotedPhrase: null,
      remainingTokens: ['linux', 'kernel']
    });

    expect(andConditions(clause)).toHaveLength(2);
    expect(andConditions(clause)[1][Op.or]).toHaveLength(2);
  });

  // Searches quoted phrases across title and body as equivalent locations.
  it('groups a quoted phrase across title and content', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: 'climate report',
      remainingTokens: []
    });

    expect(andConditions(clause)).toHaveLength(1);
    expect(andConditions(clause)[0][Op.or]).toHaveLength(2);
  });

  // Requires every free-text term while allowing either title or body per term.
  it('creates one OR group per free-text token', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: null,
      remainingTokens: ['open', 'source']
    });

    expect(andConditions(clause)).toHaveLength(2);
    expect(andConditions(clause).every(condition => condition[Op.or].length === 2)).toBe(true);
  });
});
