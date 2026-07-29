import { describe, expect, it } from 'vitest';
import {
  getGreaderParameterValues,
  normalizeGreaderParameterValues
} from '../../utils/greaderParameters.js';
import {
  DEFAULT_STREAM_ITEM_COUNT,
  MAX_STREAM_ITEM_COUNT,
  GreaderStreamError,
  parseStreamCount
} from '../../services/greader/streamQuery.js';

describe('Google Reader parameter normalization', () => {
  it('normalizes strings and nested Express arrays without losing order', () => {
    expect(normalizeGreaderParameterValues([
      'first',
      ['second', 'third']
    ])).toEqual(['first', 'second', 'third']);
  });

  it.each(['s', 'i', 'a', 'r', 'it', 'xt'])(
    'preserves repeated %s values from URL-encoded bodies and queries',
    name => {
      const req = {
        body: { [name]: ['body-one', 'body-two'] },
        query: { [name]: ['query-one', 'query-two'] }
      };

      expect(getGreaderParameterValues(req, name)).toEqual([
        'body-one',
        'body-two',
        'query-one',
        'query-two'
      ]);
    }
  );

  it('uses a bounded default stream count', () => {
    expect(parseStreamCount([])).toBe(DEFAULT_STREAM_ITEM_COUNT);
    expect(parseStreamCount([String(MAX_STREAM_ITEM_COUNT + 1)]))
      .toBe(MAX_STREAM_ITEM_COUNT);
  });

  it.each(['-1', '1.5', 'many'])(
    'rejects malformed stream count %s',
    value => {
      expect(() => parseStreamCount([value])).toThrow(GreaderStreamError);
    }
  );
});
