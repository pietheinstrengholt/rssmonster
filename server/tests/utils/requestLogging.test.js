import { describe, expect, it } from 'vitest';

import { redactSensitiveQueryValues } from '../../utils/requestLogging.js';

describe('request logging', () => {
  it('redacts compatibility API credentials while preserving other parameters', () => {
    expect(
      redactSensitiveQueryValues(
        '/api/fever?api_key=secret&items=&with_ids=3'
      )
    ).toBe('/api/fever?api_key=[REDACTED]&items=&with_ids=3');

    expect(
      redactSensitiveQueryValues(
        '/api/greader/accounts/ClientLogin?Email=user&Passwd=secret'
      )
    ).toBe(
      '/api/greader/accounts/ClientLogin?Email=user&Passwd=[REDACTED]'
    );
  });
});
