import { describe, expect, it, vi } from 'vitest';
import {
  resolvePublisherSelfUrl,
  validatePublisherSelfIdentity,
  verifySameFeedEvidence
} from '../../services/feeds/feedSelfIdentity.js';

// Builds one normalized feed with stable publisher entry identities.
const feedFixture = (overrides = {}) => ({
  format: 'atom',
  title: 'Publisher News',
  selfUrl: null,
  entries: [
    {
      externalIdType: 'atom-id',
      externalId: 'entry-1',
      url: 'https://publisher.example/articles/1'
    },
    {
      externalIdType: 'atom-id',
      externalId: 'entry-2',
      url: 'https://publisher.example/articles/2'
    }
  ],
  ...overrides
});

describe('publisher self identity validation', () => {
  it('resolves relative declarations against the final redirected feed URL', () => {
    expect(resolvePublisherSelfUrl(
      '../canonical.xml',
      'https://cdn.example.test/feeds/current/feed.xml'
    )).toBe('https://cdn.example.test/feeds/canonical.xml');
  });

  it.each([
    ['ftp://publisher.example/feed', 'must use HTTP or HTTPS'],
    ['https://user:secret@publisher.example/feed', 'credentials are not allowed'],
    ['http://[invalid', 'malformed']
  ])('rejects unsafe declaration %s', (declaration, message) => {
    expect(() => resolvePublisherSelfUrl(
      declaration,
      'https://publisher.example/feed.xml'
    )).toThrow(message);
  });

  it('accepts an exact raw representation hash across origins', () => {
    expect(verifySameFeedEvidence({
      sourceFeed: feedFixture(),
      sourceFinalUrl: 'https://cdn.example/feed.xml',
      sourceBodyHash: 'same-body',
      candidateFeed: feedFixture(),
      candidateFinalUrl: 'https://publisher.example/feed.xml',
      candidateBodyHash: 'same-body'
    })).toMatchObject({ accepted: true, bodyHashMatch: true });
  });

  it('requires stable entry evidence and never accepts title alone', () => {
    expect(verifySameFeedEvidence({
      sourceFeed: feedFixture({ entries: [] }),
      sourceFinalUrl: 'https://source.example/feed.xml',
      candidateFeed: feedFixture({ entries: [] }),
      candidateFinalUrl: 'https://other.example/feed.xml'
    })).toMatchObject({
      accepted: false,
      titleMatch: true,
      sharedEntries: 0
    });
  });

  it('accepts strongly matching recent identities across origins', () => {
    expect(verifySameFeedEvidence({
      sourceFeed: feedFixture(),
      sourceFinalUrl: 'https://cdn.example/feed.xml',
      candidateFeed: feedFixture(),
      candidateFinalUrl: 'https://publisher.example/feed.xml'
    })).toMatchObject({
      accepted: true,
      sameOrigin: false,
      sharedEntries: 2
    });
  });

  it('keeps unreachable, malformed, and unrelated declarations non-fatal', async () => {
    const source = feedFixture({ selfUrl: 'https://publisher.example/self.xml' });
    const unreachable = await validatePublisherSelfIdentity({
      parsedFeed: source,
      finalFeedUrl: 'https://cdn.example/feed.xml',
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'transient_failure',
        error: { message: 'network unavailable' }
      })
    });
    const malformed = await validatePublisherSelfIdentity({
      parsedFeed: source,
      finalFeedUrl: 'https://cdn.example/feed.xml',
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'malformed',
        error: { message: 'HTML is not a feed' }
      })
    });
    const unrelated = await validatePublisherSelfIdentity({
      parsedFeed: source,
      finalFeedUrl: 'https://cdn.example/feed.xml',
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'changed',
        response: { url: 'https://publisher.example/self.xml', redirects: [] },
        parsedFeed: feedFixture({
          title: 'Different feed',
          entries: [{
            externalIdType: 'atom-id',
            externalId: 'unrelated',
            url: 'https://publisher.example/unrelated'
          }]
        })
      })
    });

    expect(unreachable).toMatchObject({ accepted: false, status: 'unreachable' });
    expect(malformed).toMatchObject({ accepted: false, status: 'malformed' });
    expect(unrelated).toMatchObject({ accepted: false, status: 'unrelated' });
  });

  it('propagates execution timeout instead of recording an unreachable self URL', async () => {
    const timeoutError = Object.assign(new Error('validation timed out'), {
      name: 'TimeoutError',
      code: 'FEED_EXECUTION_TIMEOUT'
    });

    await expect(validatePublisherSelfIdentity({
      parsedFeed: feedFixture({
        selfUrl: 'https://publisher.example/timeout.xml'
      }),
      finalFeedUrl: 'https://cdn.example/feed.xml',
      acquireCandidate: vi.fn().mockRejectedValue(timeoutError)
    })).rejects.toBe(timeoutError);
  });

  it('uses a fresh persisted rejection without another candidate request', async () => {
    const selfUrl = 'https://publisher.example/rejected.xml';
    const acquireCandidate = vi.fn();
    const validation = await validatePublisherSelfIdentity({
      feed: {
        publisherSelfUrl: selfUrl,
        publisherSelfStatus: 'unrelated',
        publisherSelfCheckedAt: new Date('2026-08-09T09:00:00.000Z'),
        publisherSelfDiagnostic: 'Previously unrelated'
      },
      parsedFeed: feedFixture({ selfUrl }),
      finalFeedUrl: 'https://cdn.example/feed.xml',
      clock: () => new Date('2026-08-09T10:00:00.000Z'),
      acquireCandidate
    });

    expect(validation).toMatchObject({
      accepted: false,
      status: 'unrelated',
      cached: true,
      fetched: false
    });
    expect(acquireCandidate).not.toHaveBeenCalled();
  });

  it('rejects a malicious cross-origin self URL without strong shared identities', async () => {
    const malicious = await validatePublisherSelfIdentity({
      parsedFeed: feedFixture({ selfUrl: 'https://victim.example/feed.xml' }),
      finalFeedUrl: 'https://attacker.example/feed.xml',
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'changed',
        response: { url: 'https://victim.example/feed.xml', redirects: [] },
        bodyHash: 'victim-body',
        parsedFeed: feedFixture({
          title: 'Victim feed',
          selfUrl: 'https://victim.example/feed.xml',
          entries: [{
            externalIdType: 'atom-id',
            externalId: 'victim-entry',
            url: 'https://victim.example/articles/1'
          }]
        })
      })
    });

    expect(malicious).toMatchObject({ accepted: false, status: 'unrelated' });
  });
});
