import { describe, expect, it } from 'vitest';
import {
  GreaderItemIdError,
  parseGreaderItemId,
  parseRequestedGreaderItemIds,
  serializeGreaderItemId
} from '../../services/greader/itemIds.js';

describe('Google Reader item IDs', () => {
  it('serializes positive database IDs as padded lowercase hexadecimal IDs', () => {
    expect(serializeGreaderItemId(26)).toBe(
      'tag:google.com,2005:reader/item/000000000000001a'
    );
  });

  it('parses decimal, bare hexadecimal, and exact full hexadecimal IDs', () => {
    expect(parseGreaderItemId('26')).toBe(26);
    expect(parseGreaderItemId('000000000000001a')).toBe(26);
    expect(parseGreaderItemId(
      'tag:google.com,2005:reader/item/000000000000001A'
    )).toBe(26);
  });

  it.each([
    '',
    '0',
    '-1',
    '1.5',
    ' 1',
    'tag:google.com,2005:reader/item/0000000000000001junk',
    'tag:google.com,2005:reader/item/000000000000001',
    'tag:google.com,2005:reader/item/gggggggggggggggg',
    '000000000000001',
    '000000000000001ag',
    'ffffffffffffffff',
    '2147483648',
    Number.MAX_SAFE_INTEGER + 1
  ])('rejects malformed, overflowing, or unsafe ID %s', value => {
    expect(() => parseGreaderItemId(value)).toThrow(GreaderItemIdError);
  });

  it('deduplicates equivalent decimal and hexadecimal IDs in first-seen order', () => {
    expect(parseRequestedGreaderItemIds([
      '2',
      'tag:google.com,2005:reader/item/0000000000000001',
      '0000000000000002',
      '1'
    ])).toEqual([2, 1]);
  });
});
