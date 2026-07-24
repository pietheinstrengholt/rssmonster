import { describe, expect, it } from 'vitest';

import { formatLogString } from '../../utils/logging.js';

describe('formatLogString', () => {
  it('quotes plain string values', () => {
    expect(formatLogString('AI News')).toBe('"AI News"');
  });

  it('escapes quotes and backslashes without ambiguous boundaries', () => {
    expect(formatLogString('AI \\"News"')).toBe('"AI \\\\\\"News\\""');
  });

  it('escapes control characters to keep logs on one line', () => {
    const formatted = formatLogString('first\nsecond\r\tthird');

    expect(formatted).toBe('"first\\nsecond\\r\\tthird"');
    expect(formatted).not.toMatch(/[\n\r\t]/);
  });
});
