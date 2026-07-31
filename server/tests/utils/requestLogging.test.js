import { describe, expect, it } from 'vitest';

import {
  REQUEST_LOG_FORMAT,
  redactSensitiveQueryValues,
  requestUrlForLogging
} from '../../utils/requestLogging.js';

describe('request logging', () => {
  it('redacts compatibility API credentials while preserving other parameters', () => {
    expect(
      redactSensitiveQueryValues(
        '/api/fever?api_key=secret&items=&with_ids=3'
      )
    ).toBe('/api/fever?api_key=[REDACTED]&items=&with_ids=3');

    expect(
      redactSensitiveQueryValues(
        '/api/fever?action=login&username=user&password=secret'
      )
    ).toBe(
      '/api/fever?action=login&username=user&password=[REDACTED]'
    );

    expect(
      redactSensitiveQueryValues(
        '/api/greader/accounts/ClientLogin?Email=user&Passwd=secret'
      )
    ).toBe(
      '/api/greader/accounts/ClientLogin?Email=user&Passwd=[REDACTED]'
    );

    expect(
      redactSensitiveQueryValues(
        '/api/greader/reader/api/0/edit-tag?i=1&T=action-token'
      )
    ).toBe(
      '/api/greader/reader/api/0/edit-tag?i=1&T=[REDACTED]'
    );

    expect(
      redactSensitiveQueryValues(
        '/api/feeds/refresh/job-7/events?token=primary.jwt.session-token'
      )
    ).toBe(
      '/api/feeds/refresh/job-7/events?token=[REDACTED]'
    );
  });

  it('keeps bearer credentials out of the configured request log output', () => {
    const bearerToken = 'primary.jwt.session-token';
    const loggedUrl = requestUrlForLogging({
      headers: {
        authorization: `Bearer ${bearerToken}`
      },
      originalUrl: `/api/feeds/refresh/job-7/events?token=${bearerToken}`
    });

    expect(loggedUrl).toBe(
      '/api/feeds/refresh/job-7/events?token=[REDACTED]'
    );
    expect(loggedUrl).not.toContain(bearerToken);
    expect(REQUEST_LOG_FORMAT).not.toContain('authorization');
  });
});
