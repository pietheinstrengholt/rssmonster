import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { hashVisibleText } from '../../utils/articleContentHashes.js';

// This function returns the SHA-256 value expected for meaningful normalized text.
const hashValue = value => createHash('sha256').update(value).digest('hex');

describe('article content hashes', () => {
  it.each([undefined, null, '', '  \n\t  '])(
    'returns null for absent visible text value %s',
    value => {
      expect(hashVisibleText(value)).toBeNull();
    }
  );

  it('hashes normalized meaningful visible text', () => {
    expect(hashVisibleText('  Article\n\tbody  ')).toBe(hashValue('Article body'));
  });
});
