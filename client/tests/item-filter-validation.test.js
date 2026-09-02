import { describe, expect, it } from 'vitest';
import { validateItemFilter } from '../src/services/itemFilterValidation.js';

describe('item filter validation', () => {
  it.each([
    null,
    '',
    '   ',
    '/foo/',
    '/foo/i',
    'title:/foo/i',
    'content:/foo/i',
    'url:/foo/i',
    'author:/foo/i',
    'category:/foo/i',
    '!title:/foo/i',
    '!/foo/i',
    'url:/\\/gaming\\//',
    '/^https:\\/\\/example\\.com\\//'
  ])('accepts %s', expression => {
    expect(validateItemFilter(expression)).toEqual({ valid: true, error: '' });
  });

  it.each([
    ['!', 'after the exclamation mark'],
    ['foo', 'Use /.../ syntax'],
    ['summary:/foo/', 'Unsupported field'],
    ['title:foo', 'start and end with a forward slash'],
    ['/foo', 'must end with a forward slash'],
    ['/(/', 'could not be parsed'],
    ['/foo/ii', 'could not be parsed'],
    ['/foo/unknown', 'could not be parsed']
  ])('rejects %s with an understandable error', (expression, message) => {
    const result = validateItemFilter(expression);

    expect(result.valid).toBe(false);
    expect(result.error).toContain(message);
  });
});
