import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalizeRequestUrl,
  createOriginRequestPolicy,
  createRequestCoalescer
} from '../../services/feeds/http/requestCoordination.js';

// Flushes promise continuations used to start and release queued operations.
const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('per-origin request coordination', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bounds concurrency independently for each publisher origin', async () => {
    const policy = createOriginRequestPolicy({
      maxConcurrency: 2,
      minSpacingMs: 0
    });
    let active = 0;
    let maximumActive = 0;
    const releases = [];
    // Holds one operation so the test can observe the active concurrency bound.
    const operation = () => new Promise(resolve => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      releases.push(() => {
        active -= 1;
        resolve();
      });
    });

    const requests = [
      policy.run('https://publisher.example/a', operation),
      policy.run('https://publisher.example/b', operation),
      policy.run('https://publisher.example/c', operation)
    ];
    await flushPromises();

    expect(active).toBe(2);
    expect(maximumActive).toBe(2);
    releases.shift()();
    await vi.waitFor(() => expect(active).toBe(2));
    releases.splice(0).forEach(release => release());
    await Promise.all(requests);
  });

  it('does not let a busy origin block another publisher', async () => {
    const policy = createOriginRequestPolicy({
      maxConcurrency: 1,
      minSpacingMs: 0
    });
    const starts = [];
    let releaseFirst;
    const first = policy.run('https://alpha.example/one', () => {
      starts.push('alpha-one');
      return new Promise(resolve => { releaseFirst = resolve; });
    });
    const second = policy.run('https://alpha.example/two', async () => {
      starts.push('alpha-two');
    });
    const otherOrigin = policy.run('https://beta.example/one', async () => {
      starts.push('beta-one');
    });
    await flushPromises();

    expect(starts).toEqual(['alpha-one', 'beta-one']);
    releaseFirst();
    await Promise.all([first, second, otherOrigin]);
    expect(starts).toEqual(['alpha-one', 'beta-one', 'alpha-two']);
  });

  it('spaces FIFO request starts from the same origin', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
    const starts = [];
    const policy = createOriginRequestPolicy({
      maxConcurrency: 2,
      minSpacingMs: 100,
      clock: () => Date.now()
    });
    const requests = ['one', 'two', 'three'].map(label =>
      policy.run(`https://publisher.example/${label}`, async () => {
        starts.push([label, Date.now()]);
      })
    );
    await flushPromises();
    expect(starts.map(([label]) => label)).toEqual(['one']);

    await vi.advanceTimersByTimeAsync(99);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts.map(([label]) => label)).toEqual(['one', 'two']);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(requests);
    expect(starts.map(([label]) => label)).toEqual(['one', 'two', 'three']);
    expect(starts[2][1] - starts[1][1]).toBe(100);
  });

  it('expires a queued request before origin capacity becomes available', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
    const policy = createOriginRequestPolicy({
      maxConcurrency: 1,
      minSpacingMs: 0,
      clock: () => Date.now()
    });
    const release = await policy.acquire('https://publisher.example/slow');
    const queued = policy.acquire('https://publisher.example/expired', {
      deadlineAt: Date.now() + 100
    });
    const expiration = expect(queued).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'FEED_EXECUTION_TIMEOUT'
    });

    await vi.advanceTimersByTimeAsync(100);
    await expiration;
    release();
  });

  it('holds a permit until its owner releases the complete response lifetime', async () => {
    const policy = createOriginRequestPolicy({
      maxConcurrency: 1,
      minSpacingMs: 0
    });
    const firstRelease = await policy.acquire('https://publisher.example/one');
    let secondAcquired = false;
    const second = policy.acquire('https://publisher.example/two')
      .then(release => {
        secondAcquired = true;
        return release;
      });
    await flushPromises();

    expect(secondAcquired).toBe(false);
    firstRelease();
    const secondRelease = await second;
    expect(secondAcquired).toBe(true);
    secondRelease();
  });
});

describe('canonical request coalescing', () => {
  it('shares simultaneous canonical requests and forgets settled work', async () => {
    const coalescer = createRequestCoalescer();
    const canonical = canonicalizeRequestUrl(
      'https://EXAMPLE.com:443/feed.xml#section'
    );
    let calls = 0;
    let release;
    // Holds the shared request until both callers have joined it.
    const operation = () => {
      calls += 1;
      return new Promise(resolve => { release = resolve; });
    };

    const first = coalescer.run(canonical, operation);
    const second = coalescer.run(
      canonicalizeRequestUrl('https://example.com/feed.xml'),
      operation
    );
    await flushPromises();
    expect(calls).toBe(1);
    release('response');
    await expect(Promise.all([first, second])).resolves.toEqual([
      'response',
      'response'
    ]);

    await expect(coalescer.run(canonical, async () => {
      calls += 1;
      return 'fresh response';
    })).resolves.toBe('fresh response');
    expect(calls).toBe(2);
  });
});
