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
    expect(andConditions(clause)[1].attribute.args[0].col).toBe('contentText');
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
    expect(andConditions(clause)[1][Op.or].every(
      condition => condition.attribute.args[0].col === 'contentText'
    )).toBe(true);
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
    expect(andConditions(clause)[0][Op.or].map(
      condition => condition.attribute.args[0].col
    )).toEqual(['title', 'contentText']);
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
    expect(andConditions(clause).every(condition => (
      condition[Op.or][1].attribute.args[0].col === 'contentText'
    ))).toBe(true);
  });

  // Uses MySQL full text to narrow candidates while retaining deterministic term checks.
  it('builds hybrid MySQL predicates for free-text terms', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: null,
      remainingTokens: ['open-source', 'reader'],
      dialect: 'mysql',
      escapeValue: value => `'${value}'`
    });

    expect(andConditions(clause)).toHaveLength(3);
    expect(andConditions(clause)[0].val).toBe(
      "MATCH(`title`, `contentText`) AGAINST ('+open* +source* +reader*' IN BOOLEAN MODE)"
    );
    expect(andConditions(clause).slice(1).every(condition => condition[Op.or].length === 2)).toBe(true);
  });

  // Keeps short terms out of MATCH and enforces them with deterministic predicates instead.
  it('retains short MySQL terms without relying on the full-text token index', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: null,
      remainingTokens: ['AI'],
      dialect: 'mysql',
      escapeValue: value => `'${value}'`
    });

    expect(andConditions(clause)).toHaveLength(1);
    expect(andConditions(clause)[0][Op.or].map(
      condition => condition.attribute.args[0].col
    )).toEqual(['title', 'contentText']);
  });

  // Narrows phrase candidates with MATCH and verifies literal adjacency afterward.
  it('builds hybrid MySQL predicates for quoted text', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: 'climate report',
      remainingTokens: [],
      dialect: 'mysql',
      escapeValue: value => `'${value}'`
    });

    expect(andConditions(clause)).toHaveLength(2);
    expect(andConditions(clause)[0].val).toBe(
      "MATCH(`title`, `contentText`) AGAINST ('+climate* +report*' IN BOOLEAN MODE)"
    );
    expect(andConditions(clause)[1][Op.or]).toHaveLength(2);
  });

  // Retains title-only and body-term semantics for explicit title filters.
  it('retains deterministic predicates with a title field filter', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: 'release',
      quotedPhrase: null,
      remainingTokens: ['stable'],
      dialect: 'mysql',
      escapeValue: value => `'${value}'`
    });

    expect(andConditions(clause)).toHaveLength(2);
    expect(andConditions(clause)[0].attribute.args[0].col).toBe('title');
    expect(andConditions(clause)[1][Op.or][0].attribute.args[0].col).toBe('contentText');
  });

  // Keeps punctuation-only intent deterministic rather than dropping the search condition.
  it('retains punctuation-only MySQL search intent', () => {
    const clause = buildTextSearchWhereClause({
      titleFilter: null,
      quotedPhrase: null,
      remainingTokens: ['+++'],
      dialect: 'mysql',
      escapeValue: value => `'${value}'`
    });

    expect(andConditions(clause)).toHaveLength(1);
    expect(andConditions(clause)[0][Op.or]).toHaveLength(2);
  });
});
