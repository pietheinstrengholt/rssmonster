import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInferenceCircuitBreaker,
  getInferenceCircuitConfig,
  InferenceCircuitOpenError
} from '../../services/inference/inferenceCircuitBreaker.js';
import {
  requestInferenceJson,
  resetInferenceCircuitBreakerForTests
} from '../../services/inference/inferenceClient.js';

const successResponse = result => new Response(JSON.stringify(result), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

const unavailableError = () => Object.assign(new Error('fetch failed'), {
  cause: { code: 'ECONNREFUSED' }
});

const createDeferred = () => {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createHarness = ({ failureThreshold = 2, cooldownMs = 1_000 } = {}) => {
  let currentTime = 10_000;
  const logger = { warn: vi.fn() };
  const now = () => currentTime;
  const circuitBreaker = createInferenceCircuitBreaker({
    failureThreshold,
    cooldownMs,
    now,
    logger
  });
  return {
    circuitBreaker,
    logger,
    now,
    setTime: value => {
      currentTime = value;
    }
  };
};

const failUntilOpen = async ({ circuitBreaker, now }, fetchImplementation, count = 2) => {
  for (let index = 0; index < count; index += 1) {
    await requestInferenceJson('/api/classifications/article', {}, {
      requestId: `failure-${index}`,
      fetchImplementation,
      circuitBreaker,
      now
    }).catch(() => {});
  }
};

describe('inference circuit breaker', () => {
  beforeEach(() => {
    vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
    resetInferenceCircuitBreakerForTests();
  });

  afterEach(() => {
    resetInferenceCircuitBreakerForTests();
    vi.unstubAllEnvs();
  });

  it('opens at the threshold and immediately rejects without fetch', async () => {
    const harness = createHarness();
    const fetchImplementation = vi.fn().mockRejectedValue(unavailableError());
    await failUntilOpen(harness, fetchImplementation);

    expect(harness.circuitBreaker.getSnapshot()).toEqual({
      state: 'open',
      consecutiveFailures: 2,
      openedAt: 10_000,
      retryAt: 11_000,
      halfOpenProbeActive: false
    });

    const requestNow = vi.fn()
      .mockReturnValueOnce(20_000)
      .mockReturnValue(20_025);
    await expect(requestInferenceJson('/api/classifications/article', { private: 'content' }, {
      requestId: 'rejected-request',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: requestNow
    })).rejects.toMatchObject({
      name: 'InferenceCircuitOpenError',
      code: 'INFERENCE_CIRCUIT_OPEN',
      requestId: 'rejected-request',
      inferencePath: '/api/classifications/article',
      durationMs: 25,
      retryAfterMs: 1_000
    });
    await expect(requestInferenceJson('/api/classifications/article', {}, {
      requestId: 'second-rejected-request',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({ code: 'INFERENCE_CIRCUIT_OPEN' });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(harness.logger.warn.mock.calls.filter(([message]) =>
      message.includes('circuit_opened'))).toHaveLength(1);
    expect(harness.logger.warn.mock.calls.some(([message]) =>
      message.includes('request_rejected_circuit_open') &&
      message.includes('requestId="rejected-request"') &&
      !message.includes('content'))).toBe(true);
    expect(harness.logger.warn.mock.calls.filter(([message]) =>
      message.includes('request_rejected_circuit_open'))).toHaveLength(1);
  });

  it('allows exactly one half-open probe and closes on success', async () => {
    const harness = createHarness();
    const fetchImplementation = vi.fn().mockRejectedValue(unavailableError());
    await failUntilOpen(harness, fetchImplementation);
    harness.setTime(11_000);
    const probe = createDeferred();
    fetchImplementation.mockImplementation(() => probe.promise);

    const probeRequest = requestInferenceJson('/api/test', {}, {
      requestId: 'probe-request',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    });
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(3));

    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'parallel-request',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toBeInstanceOf(InferenceCircuitOpenError);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(harness.circuitBreaker.getSnapshot().halfOpenProbeActive).toBe(true);

    probe.resolve(successResponse({ ok: true }));
    await expect(probeRequest).resolves.toEqual({ ok: true });
    expect(harness.circuitBreaker.getSnapshot()).toEqual({
      state: 'closed',
      consecutiveFailures: 0,
      openedAt: null,
      retryAt: null,
      halfOpenProbeActive: false
    });
    expect(harness.logger.warn.mock.calls.some(([message]) =>
      message.includes('circuit_half_open'))).toBe(true);
    expect(harness.logger.warn.mock.calls.some(([message]) =>
      message.includes('circuit_closed'))).toBe(true);
  });

  it('reopens when the half-open probe has a qualifying failure', async () => {
    const harness = createHarness();
    const fetchImplementation = vi.fn().mockRejectedValue(unavailableError());
    await failUntilOpen(harness, fetchImplementation);
    harness.setTime(11_000);

    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'failed-probe',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({ code: 'INFERENCE_UNAVAILABLE' });

    expect(harness.circuitBreaker.getSnapshot()).toEqual({
      state: 'open',
      consecutiveFailures: 3,
      openedAt: 11_000,
      retryAt: 12_000,
      halfOpenProbeActive: false
    });
    expect(harness.logger.warn.mock.calls.filter(([message]) =>
      message.includes('circuit_opened'))).toHaveLength(2);
  });

  it('resets consecutive failures after a successful closed-state request', async () => {
    const harness = createHarness();
    const fetchImplementation = vi.fn()
      .mockRejectedValueOnce(unavailableError())
      .mockResolvedValueOnce(successResponse({ ok: true }))
      .mockRejectedValueOnce(unavailableError());

    await requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    }).catch(() => {});
    expect(harness.circuitBreaker.getSnapshot().consecutiveFailures).toBe(1);

    await requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    });
    expect(harness.circuitBreaker.getSnapshot().consecutiveFailures).toBe(0);

    await requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    }).catch(() => {});
    expect(harness.circuitBreaker.getSnapshot()).toMatchObject({
      state: 'closed',
      consecutiveFailures: 1
    });
  });

  it('resets availability failures after a responsive non-qualifying HTTP error', async () => {
    const harness = createHarness();
    const fetchImplementation = vi.fn()
      .mockRejectedValueOnce(unavailableError())
      .mockResolvedValueOnce(new Response('invalid request', { status: 400 }))
      .mockRejectedValueOnce(unavailableError());

    await requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    }).catch(() => {});
    await requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    }).catch(() => {});
    await requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    }).catch(() => {});

    expect(harness.circuitBreaker.getSnapshot()).toMatchObject({
      state: 'closed',
      consecutiveFailures: 1
    });
  });

  it('honors Retry-After before allowing a probe', async () => {
    const harness = createHarness({ failureThreshold: 1, cooldownMs: 1_000 });
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"not_ready"}', {
        status: 503,
        headers: { 'Retry-After': '5' }
      }))
      .mockResolvedValue(successResponse({ ok: true }));

    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'not-ready',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({ status: 503, inferenceErrorCode: 'not_ready' });
    expect(harness.circuitBreaker.getSnapshot().retryAt).toBe(15_000);

    harness.setTime(14_999);
    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'too-early',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({ retryAfterMs: 1 });
    expect(fetchImplementation).toHaveBeenCalledOnce();

    harness.setTime(15_000);
    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'recovery-probe',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).resolves.toEqual({ ok: true });
    expect(harness.circuitBreaker.getSnapshot().state).toBe('closed');
  });

  it('does not count ordinary 4xx, malformed caller payloads, or caller aborts', async () => {
    const harness = createHarness({ failureThreshold: 1 });
    const badRequestFetch = vi.fn().mockResolvedValue(new Response('invalid', { status: 400 }));

    await expect(requestInferenceJson('/api/test', {}, {
      fetchImplementation: badRequestFetch,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({ status: 400 });

    const circular = {};
    circular.self = circular;
    await expect(requestInferenceJson('/api/test', circular, {
      fetchImplementation: badRequestFetch,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toBeInstanceOf(TypeError);

    const controller = new AbortController();
    const feedTimeoutError = Object.assign(new Error('feed deadline reached'), {
      name: 'TimeoutError',
      code: 'FEED_EXECUTION_TIMEOUT'
    });
    const abortFetch = vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const abortedRequest = requestInferenceJson('/api/test', {}, {
      signal: controller.signal,
      fetchImplementation: abortFetch,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    });
    const abortExpectation = expect(abortedRequest).rejects.toBe(feedTimeoutError);
    await vi.waitFor(() => expect(abortFetch).toHaveBeenCalledOnce());
    controller.abort(feedTimeoutError);
    await abortExpectation;

    expect(harness.circuitBreaker.getSnapshot()).toMatchObject({
      state: 'closed',
      consecutiveFailures: 0
    });
  });

  it('does not open a circuit for an intentional queue-full response', async () => {
    const harness = createHarness({ failureThreshold: 1 });
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(
      '{"error":"inference_queue_full"}',
      { status: 429 }
    ));

    await expect(requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({
      code: 'INFERENCE_UNAVAILABLE',
      status: 429,
      inferenceErrorCode: 'inference_queue_full'
    });
    expect(harness.circuitBreaker.getSnapshot()).toMatchObject({
      state: 'closed',
      consecutiveFailures: 0
    });
  });

  it('counts a timeout while consuming a successful response body', async () => {
    const harness = createHarness({ failureThreshold: 1 });
    const fetchImplementation = vi.fn(async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
    }));

    await expect(requestInferenceJson('/api/test', {}, {
      timeoutMs: 5,
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({
      name: 'InferenceTimeoutError',
      code: 'INFERENCE_TIMEOUT'
    });
    expect(harness.circuitBreaker.getSnapshot()).toMatchObject({
      state: 'open',
      consecutiveFailures: 1
    });
  });

  it('counts a transport failure while consuming a successful response body', async () => {
    const harness = createHarness({ failureThreshold: 1 });
    const bodyError = Object.assign(new TypeError('terminated'), {
      cause: { code: 'ECONNRESET' }
    });
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(bodyError)
    });

    await expect(requestInferenceJson('/api/test', {}, {
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({
      name: 'InferenceServiceUnavailableError',
      code: 'INFERENCE_UNAVAILABLE',
      transportCode: 'ECONNRESET'
    });
    expect(harness.circuitBreaker.getSnapshot()).toMatchObject({
      state: 'open',
      consecutiveFailures: 1
    });
  });

  it('does not log arbitrary inference error codes or response content', async () => {
    const privateMarker = 'private-title https://user:password@example.com?token=secret';
    const harness = createHarness({ failureThreshold: 1 });
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: privateMarker }),
      { status: 503 }
    ));

    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'safe-circuit-log',
      fetchImplementation,
      circuitBreaker: harness.circuitBreaker,
      now: harness.now
    })).rejects.toMatchObject({
      message: 'Inference request failed with HTTP 503',
      inferenceErrorCode: null
    });

    const logs = harness.logger.warn.mock.calls.flat().join('\n');
    expect(logs).toContain('cause="http_503"');
    expect(logs).not.toContain(privateMarker);
    expect(logs).not.toContain('password');
  });

  it('keeps separately created circuit state isolated', async () => {
    const first = createHarness({ failureThreshold: 1 });
    const second = createHarness({ failureThreshold: 1 });

    await failUntilOpen(first, vi.fn().mockRejectedValue(unavailableError()), 1);

    expect(first.circuitBreaker.getSnapshot().state).toBe('open');
    expect(second.circuitBreaker.getSnapshot().state).toBe('closed');
  });

  it('shares circuit state within one capability', async () => {
    const logger = { warn: vi.fn() };
    const failingFetch = vi.fn().mockRejectedValue(unavailableError());
    const environment = {
      INFERENCE_CIRCUIT_FAILURE_THRESHOLD: '1',
      INFERENCE_CIRCUIT_COOLDOWN_MS: '1000'
    };

    await requestInferenceJson('/api/test', {}, {
      circuitKey: 'classification',
      requestId: 'shared-failure',
      fetchImplementation: failingFetch,
      environment,
      logger
    }).catch(() => {});

    const secondFetch = vi.fn().mockResolvedValue(successResponse({ ok: true }));
    await expect(requestInferenceJson('/api/test', {}, {
      circuitKey: 'classification',
      requestId: 'shared-rejection',
      fetchImplementation: secondFetch
    })).rejects.toMatchObject({
      code: 'INFERENCE_CIRCUIT_OPEN',
      requestId: 'shared-rejection'
    });
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('keeps default circuit state isolated between capabilities', async () => {
    const environment = {
      INFERENCE_CIRCUIT_FAILURE_THRESHOLD: '1',
      INFERENCE_CIRCUIT_COOLDOWN_MS: '1000'
    };
    const failingFetch = vi.fn().mockRejectedValue(unavailableError());

    await requestInferenceJson('/api/classifications/article', {}, {
      circuitKey: 'classification',
      environment,
      fetchImplementation: failingFetch
    }).catch(() => {});

    const embeddingFetch = vi.fn().mockResolvedValue(successResponse({ embeddings: [] }));
    await expect(requestInferenceJson('/api/embeddings', {}, {
      circuitKey: 'embeddings',
      environment,
      fetchImplementation: embeddingFetch
    })).resolves.toEqual({ embeddings: [] });
    expect(embeddingFetch).toHaveBeenCalledOnce();
  });

  it('validates environment configuration', () => {
    expect(getInferenceCircuitConfig({})).toEqual({
      failureThreshold: 5,
      cooldownMs: 30_000
    });
    expect(() => getInferenceCircuitConfig({
      INFERENCE_CIRCUIT_FAILURE_THRESHOLD: '0'
    })).toThrow('INFERENCE_CIRCUIT_FAILURE_THRESHOLD must be a positive integer');
    expect(() => getInferenceCircuitConfig({
      INFERENCE_CIRCUIT_COOLDOWN_MS: '1.5'
    })).toThrow('INFERENCE_CIRCUIT_COOLDOWN_MS must be a positive integer');
  });
});
