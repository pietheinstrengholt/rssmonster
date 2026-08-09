import { describe, expect, it } from 'vitest';

import {
  buildFetchAttemptState,
  buildFetchOutcomeState
} from '../../services/feeds/feedFetchState.js';

describe('feed fetch state transitions', () => {
  it('records only attempt time and the compatibility timestamp on attempts', () => {
    const attemptedAt = new Date('2026-08-09T10:00:00.000Z');

    expect(buildFetchAttemptState(attemptedAt)).toEqual({
      lastAttemptAt: attemptedAt,
      lastFetched: attemptedAt
    });
  });

  it('updates validators and change observations after changed responses', () => {
    const completedAt = new Date('2026-08-09T10:00:05.000Z');
    const nextFetchAt = new Date('2026-08-09T10:30:05.000Z');
    const cacheFreshUntil = new Date('2026-08-09T10:10:05.000Z');
    const lastPublishedAt = new Date('2026-08-09T09:55:00.000Z');
    const updates = buildFetchOutcomeState({
      feed: { consecutiveFailures: 3 },
      outcome: {
        type: 'changed',
        bodyHash: 'content-hash',
        policy: {
          etag: '"feed-v2"',
          lastModified: 'Sun, 09 Aug 2026 09:55:00 GMT',
          cacheFreshUntil
        },
        response: {
          headers: {
            etag: '"feed-v2"',
            'last-modified': 'Sun, 09 Aug 2026 09:55:00 GMT'
          }
        }
      },
      completedAt,
      nextFetchAt,
      lastPublishedAt,
      observedEntryIntervalMs: 900000
    });

    expect(updates).toEqual({
      lastFetchOutcome: 'changed',
      nextFetchAt,
      lastSuccessAt: completedAt,
      consecutiveFailures: 0,
      errorCount: 0,
      errorMessage: null,
      errorSince: null,
      status: 'active',
      etag: '"feed-v2"',
      lastModified: 'Sun, 09 Aug 2026 09:55:00 GMT',
      cacheFreshUntil,
      lastChangedAt: completedAt,
      contentHash: 'content-hash',
      lastPublishedAt,
      observedEntryIntervalMs: 900000
    });
  });

  it.each(['unchanged', 'not_modified'])(
    'records %s as successful without changing content observations',
    outcomeType => {
      const completedAt = new Date('2026-08-09T11:00:00.000Z');
      const updates = buildFetchOutcomeState({
        feed: { consecutiveFailures: 2 },
        outcome: {
          type: outcomeType,
          bodyHash: 'same-hash',
          policy: { etag: '"current"' },
          response: { headers: { etag: '"current"' } }
        },
        completedAt
      });

      expect(updates).toEqual({
        lastFetchOutcome: outcomeType,
        lastSuccessAt: completedAt,
        consecutiveFailures: 0,
        errorCount: 0,
        errorMessage: null,
        errorSince: null,
        status: 'active',
        etag: '"current"',
        ...(outcomeType === 'unchanged'
          ? { lastModified: null, cacheFreshUntil: null }
          : {})
      });
      expect(updates).not.toHaveProperty('lastChangedAt');
      expect(updates).not.toHaveProperty('contentHash');
      expect(updates).not.toHaveProperty('lastPublishedAt');
      expect(updates).not.toHaveProperty('observedEntryIntervalMs');
    }
  );

  it('clears obsolete validators on a successful 200 response', () => {
    const updates = buildFetchOutcomeState({
      feed: { consecutiveFailures: 0 },
      outcome: {
        type: 'unchanged',
        policy: {},
        response: { headers: {} }
      }
    });

    expect(updates).toMatchObject({
      etag: null,
      lastModified: null,
      cacheFreshUntil: null
    });
  });

  it('increments failures without overwriting successful response state', () => {
    const completedAt = new Date('2026-08-09T11:05:00.000Z');
    const errorSince = new Date('2026-08-08T11:05:00.000Z');
    const nextFetchAt = new Date('2026-08-09T12:00:00.000Z');
    const updates = buildFetchOutcomeState({
      feed: { consecutiveFailures: 4, errorSince },
      outcome: { type: 'timed_out' },
      completedAt,
      nextFetchAt,
      diagnosticMessage: 'The total feed deadline expired'
    });

    expect(updates).toEqual({
      lastFetchOutcome: 'timed_out',
      nextFetchAt,
      consecutiveFailures: 5,
      errorCount: 5,
      errorMessage: 'The total feed deadline expired',
      errorSince,
      status: 'active'
    });
    expect(updates).not.toHaveProperty('lastSuccessAt');
    expect(updates).not.toHaveProperty('lastChangedAt');
  });

  it('does not commit validators from a malformed representation', () => {
    const completedAt = new Date('2026-08-09T11:10:00.000Z');
    const updates = buildFetchOutcomeState({
      feed: { consecutiveFailures: 1 },
      outcome: {
        type: 'malformed',
        policy: {
          etag: '"unusable"',
          lastModified: 'Sun, 09 Aug 2026 09:55:00 GMT'
        }
      },
      completedAt,
      diagnosticMessage: 'Invalid XML'
    });

    expect(updates).toEqual({
      lastFetchOutcome: 'malformed',
      consecutiveFailures: 2,
      errorCount: 2,
      errorMessage: 'Invalid XML',
      errorSince: completedAt,
      status: 'active'
    });
    expect(updates).not.toHaveProperty('etag');
    expect(updates).not.toHaveProperty('lastModified');
  });

  it.each([
    ['malformed', 2, 'Feed failed parsing repeatedly'],
    ['security_rejected', 0, 'Resolved address is not public']
  ])('atomically quarantines %s without scheduling an automatic retry', (
    outcomeType,
    consecutiveFailures,
    diagnosticMessage
  ) => {
    const completedAt = new Date('2026-08-09T11:15:00.000Z');

    expect(buildFetchOutcomeState({
      feed: { consecutiveFailures },
      outcome: { type: outcomeType },
      completedAt,
      nextFetchAt: null,
      diagnosticMessage,
      quarantined: true
    })).toEqual({
      lastFetchOutcome: outcomeType,
      nextFetchAt: null,
      consecutiveFailures: consecutiveFailures + 1,
      errorCount: consecutiveFailures + 1,
      errorMessage: diagnosticMessage,
      errorSince: completedAt,
      status: 'error'
    });
  });

  it('rejects outcomes outside the closed acquisition contract', () => {
    expect(() => buildFetchOutcomeState({
      feed: { consecutiveFailures: 0 },
      outcome: { type: 'undici_socket_error' }
    })).toThrow('Unsupported fetch outcome: undici_socket_error');
  });
});
