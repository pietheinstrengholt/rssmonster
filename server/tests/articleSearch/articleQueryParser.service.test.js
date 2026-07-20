import { describe, it, expect } from 'vitest';
import { parseArticleQuery } from '../../services/articleSearch/articleQueryParser.service.js';

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
      limit: null
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

  it('keeps unquoted text as terms', () => {
    const result = parseArticleQuery({ search: 'unread:true AI agents' });

    expect(result.filters.unread).toBe(true);
    expect(result.text).toBe('AI agents');
    expect(result.textMode).toBe('terms');
  });

  it('parses sort and limit', () => {
    const result = parseArticleQuery({ search: 'sort:asc limit:50', defaultSort: 'desc' });

    expect(result.sort).toBe('asc');
    expect(result.limit).toBe(50);
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
});
