import { describe, it, expect } from 'vitest';
import {
  ArticleExpressionValidationError,
  MAX_ARTICLE_SEARCH_LENGTH,
  parseArticleQuery,
  validateArticleExpression
} from '../../services/articleSearch/articleQueryParser.service.js';

describe('articleQueryParser.service', () => {
  it('parses mixed filters and quoted text', () => {
    const result = parseArticleQuery({ search: 'favorite:true quality:>0.7 @today "AI agents"' });

    expect(result).toEqual({
      text: 'AI agents',
      textMode: 'exact',
      filters: {
        star: true,
        quality: {
          operator: '>',
          value: 0.7
        },
        date: {
          type: 'today'
        }
      },
      sort: 'desc',
      limit: null,
      hasSearchIntent: true
    });
  });

  it('keeps legacy star filter as a favorite alias', () => {
    const result = parseArticleQuery({ search: 'star:true' });

    expect(result.filters.star).toBe(true);
  });

  it('parses days ago date expressions', () => {
    const result = parseArticleQuery({ search: '@"2 days ago"' });

    expect(result.filters.date).toEqual({
      type: 'daysAgo',
      value: 2
    });
    expect(result.text).toBe('');
    expect(result.textMode).toBe('none');
  });

  it('parses last day date expressions', () => {
    const result = parseArticleQuery({ search: '@"last monday"' });

    expect(result.filters.date).toEqual({
      type: 'lastDay',
      value: 'monday'
    });
  });

  it('accepts real calendar dates and rejects normalized or impossible dates', () => {
    const leapDay = parseArticleQuery({ search: '@2024-02-29' });
    const normalizedDate = parseArticleQuery({ search: '@2026-02-31' });
    const impossibleDate = parseArticleQuery({ search: '@2026-99-99' });

    expect(leapDay.filters.date).toEqual({ type: 'date', value: '2024-02-29' });
    expect(leapDay.hasSearchIntent).toBe(true);
    expect(normalizedDate.filters.date).toBeNull();
    expect(impossibleDate.filters.date).toBeNull();
    expect(normalizedDate.hasSearchIntent).toBe(false);
    expect(impossibleDate.hasSearchIntent).toBe(false);
  });

  it('does not let an invalid date replace an earlier valid date filter', () => {
    const result = parseArticleQuery({ search: '@today @2026-02-31' });

    expect(result.filters.date).toEqual({ type: 'today' });
    expect(result.hasSearchIntent).toBe(true);
  });

  it('keeps unquoted text as terms', () => {
    const result = parseArticleQuery({ search: 'unread:true AI agents' });

    expect(result.filters.unread).toBe(true);
    expect(result.text).toBe('AI agents');
    expect(result.textMode).toBe('terms');
  });

  it('canonicalizes the legacy Trust sort while parsing a limit', () => {
    const result = parseArticleQuery({ search: 'sort:trust limit:50', defaultSort: 'desc' });

    expect(result.sort).toBe('quality');
    expect(result.limit).toBe(50);
    expect(result.hasSearchIntent).toBe(true);
  });

  it('parses the Top Stories sort using its canonical API identifier', () => {
    const result = parseArticleQuery({ search: 'sort:topStories', defaultSort: 'desc' });

    expect(result.sort).toBe('topStories');
    expect(result.hasSearchIntent).toBe(true);
  });

  it('does not activate search intent for malformed numeric filters', () => {
    const quality = parseArticleQuery({ search: 'quality:nope' });
    const freshness = parseArticleQuery({ search: 'freshness:nope' });

    expect(quality.filters.quality).toBeNull();
    expect(freshness.filters.freshness).toBeNull();
    expect(quality.hasSearchIntent).toBe(false);
    expect(freshness.hasSearchIntent).toBe(false);
  });

  it('handles long hostile filter input without ambiguous regex backtracking', () => {
    const invalidNumber = parseArticleQuery({ search: `quality:${'1'.repeat(50_000)}x` });
    const trailingPunctuation = parseArticleQuery({ search: `term${'.'.repeat(50_000)}` });
    const whitespace = ' '.repeat(50_000);
    const textFilters = parseArticleQuery({
      search: `tag:${whitespace} title:${whitespace} author:${whitespace}`
    });

    expect(invalidNumber.filters.quality).toBeNull();
    expect(trailingPunctuation.text).toBe('term');
    expect(textFilters.filters).toEqual({});
  });

  it('parses event and freshness filters', () => {
    const result = parseArticleQuery({
      search: 'event:true eventCount:>=3 freshness:>=0.5 sort:attention'
    });

    expect(result.filters.event).toBe(true);
    expect(result.filters.eventCount).toBe(3);
    expect(result.filters.freshness).toEqual({
      operator: '>=',
      value: 0.5
    });
    expect(result.sort).toBe('attention');
    expect(result.text).toBe('');
    expect(result.textMode).toBe('none');
  });

  it('parses island boolean filters', () => {
    const included = parseArticleQuery({ search: 'island:true' });
    const excluded = parseArticleQuery({ search: 'island:false' });

    expect(included.filters.island).toBe(true);
    expect(excluded.filters.island).toBe(false);
    expect(included.textMode).toBe('none');
    expect(excluded.textMode).toBe('none');
  });

  it('parses briefing boolean filters', () => {
    const included = parseArticleQuery({ search: 'briefing:true' });
    const excluded = parseArticleQuery({ search: 'briefing:false' });

    expect(included.filters.briefing).toBe(true);
    expect(excluded.filters.briefing).toBe(false);
    expect(included.textMode).toBe('none');
    expect(excluded.textMode).toBe('none');
  });

  it('parses developing boolean filters', () => {
    const included = parseArticleQuery({ search: 'developing:true' });
    const excluded = parseArticleQuery({ search: 'developing:false' });

    expect(included.filters.developing).toBe(true);
    expect(excluded.filters.developing).toBe(false);
    expect(included.textMode).toBe('none');
    expect(excluded.textMode).toBe('none');
  });

  it('parses normal article view and event count shorthand', () => {
    const result = parseArticleQuery({ search: 'event:false eventCount:2' });

    expect(result.filters.event).toBe(false);
    expect(result.filters.eventCount).toBe(2);
  });

  it('supports title exact phrase filter', () => {
    const result = parseArticleQuery({ search: 'title:"AI Safety" openai' });

    expect(result.filters.title).toBe('AI Safety');
    expect(result.filters.titleExact).toBe(true);
    expect(result.text).toBe('openai');
  });

  it('parses remaining field filters and unquoted title and author values', () => {
    const fields = parseArticleQuery({
      search: 'firstSeen:12h tag:security language:EN sort:quality'
    });
    const title = parseArticleQuery({ search: 'title:OpenAI' });
    const author = parseArticleQuery({ search: 'author:Ada' });
    const quotedAuthor = parseArticleQuery({ search: 'author:"Ada Lovelace"' });

    expect(fields.filters).toMatchObject({
      firstSeenAge: { value: 12, unit: 'h' },
      tag: 'security',
      language: 'en'
    });
    expect(fields.sort).toBe('quality');
    expect(title.filters.title).toBe('OpenAI');
    expect(author.filters.author).toBe('Ada');
    expect(quotedAuthor.filters.author).toBe('Ada Lovelace');
  });
});

describe('persisted article expression validation', () => {
  it('returns the shared parser result for a valid Smart Folder expression', () => {
    const result = validateArticleExpression(
      'unread:true tag:security quality:>=0.70 @today sort:recommended limit:50'
    );

    expect(result).toMatchObject({
      filters: {
        unread: true,
        tag: 'security',
        quality: { operator: '>=', value: 0.7 },
        date: { type: 'today' }
      },
      sort: 'recommended',
      limit: 50,
      hasSearchIntent: true
    });
  });

  it('allows ordinary free text while rejecting unknown structured fields', () => {
    expect(validateArticleExpression('security policy')).toMatchObject({
      text: 'security policy',
      textMode: 'terms'
    });

    expect(() => validateArticleExpression('quallity:>=0.7')).toThrowError(
      expect.objectContaining({
        name: 'ArticleExpressionValidationError',
        code: 'EXPRESSION_UNKNOWN_FILTER',
        message: 'Unknown expression field: "quallity".',
        token: 'quallity:>=0.7'
      })
    );
  });

  it.each([
    ['', 'EXPRESSION_REQUIRED'],
    ['quality=nope', 'EXPRESSION_INVALID_TOKEN'],
    ['quality:nope', 'EXPRESSION_INVALID_TOKEN'],
    ['unread:maybe', 'EXPRESSION_INVALID_TOKEN'],
    ['language:english', 'EXPRESSION_INVALID_TOKEN'],
    ['sort:newest', 'EXPRESSION_INVALID_TOKEN'],
    ['limit:0', 'EXPRESSION_INVALID_TOKEN'],
    ['tag:', 'EXPRESSION_INVALID_TOKEN'],
    ['title:""', 'EXPRESSION_INVALID_TOKEN'],
    ['@2026-02-31', 'EXPRESSION_INVALID_TOKEN'],
    ['@tomorrow', 'EXPRESSION_INVALID_TOKEN'],
    ['title:"unterminated', 'EXPRESSION_UNTERMINATED_QUOTE']
  ])('rejects invalid persisted expression %j', (expression, code) => {
    try {
      validateArticleExpression(expression);
      throw new Error('Expected expression validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ArticleExpressionValidationError);
      expect(error.code).toBe(code);
    }
  });

  it('enforces the shared expression length limit', () => {
    expect(() => validateArticleExpression('x'.repeat(MAX_ARTICLE_SEARCH_LENGTH + 1)))
      .toThrowError(expect.objectContaining({ code: 'EXPRESSION_TOO_LONG' }));
  });

  it('supports an explicitly empty optional expression', () => {
    expect(validateArticleExpression('', { allowEmpty: true })).toMatchObject({
      textMode: 'none',
      hasSearchIntent: false
    });
  });
});
