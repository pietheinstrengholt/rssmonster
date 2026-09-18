import { getCrawlEnvironment } from '../../../config/crawlSettings.js';
// Coordinates publisher requests by canonical URL and origin-wide capacity.

// Produces one stable HTTP URL without a fragment for request identity.
export const canonicalizeRequestUrl = value => {
  const url = new URL(value);
  url.hash = '';
  return url.href;
};

// Creates the stable queue-expiration error shared with feed execution callers.
const createQueueTimeoutError = () => {
  const error = new Error('The request expired while waiting for origin capacity');
  error.name = 'TimeoutError';
  error.code = 'FEED_EXECUTION_TIMEOUT';
  return error;
};

// Creates a FIFO per-origin concurrency and request-spacing coordinator.
export const createOriginRequestPolicy = ({
  maxConcurrency = 2,
  minSpacingMs = 250,
  getLimits = () => ({ maxConcurrency, minSpacingMs }),
  clock = () => Date.now(),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = timer => clearTimeout(timer)
} = {}) => {
  const origins = new Map();

  // Removes one queued permit request and settles its cancellation exactly once.
  const removeQueued = (origin, queued, error) => {
    const state = origins.get(origin);
    if (!state || queued.settled) return;
    const index = state.queue.indexOf(queued);
    if (index === -1) return;
    state.queue.splice(index, 1);
    queued.settled = true;
    if (queued.timer) cancelSchedule(queued.timer);
    queued.signal?.removeEventListener('abort', queued.abort);
    queued.reject(error);
    drain(origin);
  };

  // Starts queued permits fairly when one origin has capacity and spacing budget.
  const drain = origin => {
    const state = origins.get(origin);
    if (!state || state.active >= (state.queue[0]?.concurrency ?? 1) || state.queue.length === 0) {
      if (state && state.active === 0 && state.queue.length === 0) {
        origins.delete(origin);
      }
      return;
    }

    const waitMs = state.lastStartedAt === null
      ? 0
      : Math.max(0, state.queue[0].spacingMs - (clock() - state.lastStartedAt));
    if (waitMs > 0) {
      if (!state.timer) {
        state.timer = schedule(() => {
          state.timer = null;
          drain(origin);
        }, waitMs);
      }
      return;
    }

    const queued = state.queue.shift();
    if (queued.settled) {
      drain(origin);
      return;
    }
    queued.settled = true;
    if (queued.timer) cancelSchedule(queued.timer);
    queued.signal?.removeEventListener('abort', queued.abort);
    state.active += 1;
    state.lastStartedAt = clock();
    let released = false;
    // Releases one origin permit idempotently after its full response lifetime.
    const release = () => {
      if (released) return;
      released = true;
      state.active -= 1;
      drain(origin);
    };
    queued.resolve(release);
    drain(origin);
  };

  const policy = {
    // Acquires one publisher-origin permit or rejects before a queued deadline.
    acquire: (url, { deadlineAt = null, signal = null } = {}) => {
      const origin = new URL(url).origin;
      if (signal?.aborted) {
        return Promise.reject(signal.reason || createQueueTimeoutError());
      }
      if (
        deadlineAt !== null &&
        Number.isFinite(Number(deadlineAt)) &&
        clock() >= Number(deadlineAt)
      ) {
        return Promise.reject(createQueueTimeoutError());
      }
      if (!origins.has(origin)) {
        origins.set(origin, {
          active: 0,
          lastStartedAt: null,
          queue: [],
          timer: null
        });
      }

      const limits = getLimits();
      return new Promise((resolve, reject) => {
        const queued = {
          concurrency: Math.max(1, Number.parseInt(limits.maxConcurrency, 10) || 1),
          spacingMs: Math.max(0, Number.parseInt(limits.minSpacingMs, 10) || 0),
          abort: null,
          reject,
          resolve,
          settled: false,
          signal,
          timer: null
        };
        queued.abort = () => removeQueued(
          origin,
          queued,
          signal.reason || createQueueTimeoutError()
        );
        signal?.addEventListener('abort', queued.abort, { once: true });
        if (deadlineAt !== null && Number.isFinite(Number(deadlineAt))) {
          queued.timer = schedule(
            () => removeQueued(origin, queued, createQueueTimeoutError()),
            Math.max(0, Number(deadlineAt) - clock())
          );
        }
        origins.get(origin).queue.push(queued);
        drain(origin);
      });
    },

    // Runs compatibility operations while holding a permit through settlement.
    run: async (url, operation, options = {}) => {
      const release = await policy.acquire(url, options);
      try {
        return await operation();
      } finally {
        release();
      }
    }
  };

  return Object.freeze(policy);
};

// Creates an in-flight promise registry for semantically identical requests.
export const createRequestCoalescer = () => {
  const inFlight = new Map();

  return Object.freeze({
    // Shares work while preserving independent subscriber cancellation and deadlines.
    run: (key, operation, {
      deadlineAt = null,
      signal = null,
      clock = () => Date.now(),
      schedule = (callback, delayMs) => setTimeout(callback, delayMs),
      cancelSchedule = timer => clearTimeout(timer)
    } = {}) => {
      let entry = inFlight.get(key);
      if (!entry) {
        const controller = new AbortController();
        entry = {
          controller,
          pending: Promise.resolve().then(() => operation(controller.signal)),
          settled: false,
          subscribers: 0
        };
        inFlight.set(key, entry);
        void entry.pending.finally(() => {
          entry.settled = true;
          if (inFlight.get(key) === entry) inFlight.delete(key);
        }).catch(() => {});
      }

      entry.subscribers += 1;
      return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        // Detaches only this subscriber and aborts shared work after the last leaves.
        const settle = (handler, value) => {
          if (settled) return;
          settled = true;
          if (timer) cancelSchedule(timer);
          signal?.removeEventListener('abort', abort);
          entry.subscribers -= 1;
          handler(value);
          if (entry.subscribers === 0 && !entry.settled) {
            entry.controller.abort(createQueueTimeoutError());
          }
        };
        // Rejects only this subscriber when its cancellation context expires.
        const abort = () => settle(
          reject,
          signal?.reason || createQueueTimeoutError()
        );

        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        if (deadlineAt !== null && Number.isFinite(Number(deadlineAt))) {
          const remainingMs = Number(deadlineAt) - clock();
          if (remainingMs <= 0) {
            settle(reject, createQueueTimeoutError());
            return;
          }
          timer = schedule(
            () => settle(reject, createQueueTimeoutError()),
            remainingMs
          );
        }
        entry.pending.then(
          value => settle(resolve, value),
          error => settle(reject, error)
        );
      });
    }
  });
};

export const originRequestPolicy = createOriginRequestPolicy({
  getLimits: () => {
    const environment = getCrawlEnvironment();
    const spacing = Number.parseInt(environment.FEED_ORIGIN_MIN_SPACING_MS, 10);
    return {
      maxConcurrency: Number.parseInt(environment.FEED_ORIGIN_MAX_CONCURRENCY, 10) || 2,
      minSpacingMs: Number.isInteger(spacing) && spacing >= 0 ? spacing : 250
    };
  }
});

export const requestCoalescer = createRequestCoalescer();

export default {
  canonicalizeRequestUrl,
  createOriginRequestPolicy,
  createRequestCoalescer,
  originRequestPolicy,
  requestCoalescer
};
