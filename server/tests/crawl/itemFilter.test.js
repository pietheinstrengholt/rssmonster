import { describe, expect, it } from 'vitest';

import {
  compileItemFilter,
  ItemFilterValidationError,
  matchesItemFilter
} from '../../services/crawl/filtering/itemFilter.js';

describe('feed item filters', () => {
  it.each([
    '/news/',
    '/news/i',
    '!/news/',
    'title:/^news/i',
    'content:/news/',
    'url:/^https:\\/\\/example\\.com\\//',
    'author:/reporter/',
    'category:/technology/'
  ])('compiles the supported expression %s', expression => {
    expect(compileItemFilter(expression)).toMatchObject({ expression });
  });

  it('treats an empty expression as no filter', () => {
    expect(compileItemFilter(null)).toBeNull();
    expect(compileItemFilter('   ')).toBeNull();
  });

  it.each([
    '!',
    'news',
    'unknown:/news/',
    'title:news',
    '/news',
    '/[news/',
    '/news/invalid'
  ])('rejects the invalid expression %s with a stable crawl error', expression => {
    expect(() => compileItemFilter(expression)).toThrow(ItemFilterValidationError);

    try {
      compileItemFilter(expression);
    } catch (error) {
      expect(error).toMatchObject({ code: 'FEED_ITEM_FILTER_INVALID' });
    }
  });

  it('tests atomic filters against title and content independently', () => {
    const titleFilter = compileItemFilter('/^Breaking/');
    const contentFilter = compileItemFilter('/^Opening/');

    expect(matchesItemFilter({
      title: 'Breaking news',
      content: 'Body starts elsewhere'
    }, titleFilter)).toBe(true);
    expect(matchesItemFilter({
      title: 'Unrelated title',
      content: 'Opening paragraph'
    }, contentFilter)).toBe(true);
    expect(matchesItemFilter({
      title: 'Not breaking',
      content: 'Body containing Breaking later'
    }, titleFilter)).toBe(false);
  });

  it('matches each supported field and any supplied category', () => {
    const item = {
      title: 'Release notes',
      content: 'A detailed body',
      url: 'https://example.com/releases/1',
      author: 'Ada Lovelace',
      categories: ['Engineering', 'Releases']
    };

    expect(matchesItemFilter(item, compileItemFilter('title:/release/i'))).toBe(true);
    expect(matchesItemFilter(item, compileItemFilter('content:/detailed/'))).toBe(true);
    expect(matchesItemFilter(item, compileItemFilter('url:/\\/releases\\//'))).toBe(true);
    expect(matchesItemFilter(item, compileItemFilter('author:/Ada/'))).toBe(true);
    expect(matchesItemFilter(item, compileItemFilter('category:/engineering/i'))).toBe(true);
  });

  it('applies negation after matching and treats missing fields as non-matches', () => {
    expect(matchesItemFilter(
      { title: 'Keep this', content: '' },
      compileItemFilter('!title:/discard/i')
    )).toBe(true);
    expect(matchesItemFilter(
      { title: 'Discard this', content: '' },
      compileItemFilter('!title:/discard/i')
    )).toBe(false);
    expect(matchesItemFilter({}, compileItemFilter('!author:/staff/'))).toBe(true);
  });

  it('resets stateful regular expressions between fields and entries', () => {
    const filter = compileItemFilter('/match/g');

    expect(matchesItemFilter({ title: 'match', content: '' }, filter)).toBe(true);
    expect(matchesItemFilter({ title: 'match', content: '' }, filter)).toBe(true);
  });
});
