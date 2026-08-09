import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isVerboseFeedLogging,
  logFeedDebug,
  redactFeedLogText,
  redactFeedUrlCredentials,
  warnFeedDebug
} from '../../services/feeds/feedLogging.js';

describe('feed diagnostic logging', () => {
  afterEach(() => {
    delete process.env.CRAWL_VERBOSE_LOGGING;
    vi.restoreAllMocks();
  });

  it('suppresses detailed diagnostics by default', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logFeedDebug('candidate');
    warnFeedDebug('retry');

    expect(isVerboseFeedLogging()).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['1', 'true', 'yes', 'on'])(
    'enables diagnostics for %s',
    value => {
      process.env.CRAWL_VERBOSE_LOGGING = value;
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});

      logFeedDebug('candidate');

      expect(isVerboseFeedLogging()).toBe(true);
      expect(log).toHaveBeenCalledWith('candidate');
    }
  );

  it('redacts sensitive query credentials from direct and embedded URLs', () => {
    const url = 'https://feeds.example.test/rss?view=full&api_key=secret&token=also-secret';

    expect(redactFeedUrlCredentials(url)).toContain('view=full');
    expect(redactFeedUrlCredentials(url)).toContain('api_key=REDACTED');
    expect(redactFeedUrlCredentials(url)).toContain('token=REDACTED');
    expect(redactFeedLogText(`Failed ${url}.`)).not.toContain('secret');
  });

  it('sanitizes verbose string, error, and structured diagnostics before logging', () => {
    process.env.CRAWL_VERBOSE_LOGGING = 'true';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const credentialUrl = 'https://feeds.example.test/rss?password=private';

    logFeedDebug(
      `Candidate ${credentialUrl}`,
      new Error(`Request failed for ${credentialUrl}`),
      { resolvedUrl: credentialUrl }
    );

    const serialized = JSON.stringify(log.mock.calls[0]);
    expect(serialized).not.toContain('private');
    expect(serialized).toContain('REDACTED');
  });
});
