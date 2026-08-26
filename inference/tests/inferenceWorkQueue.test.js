import { describe, expect, it, vi } from 'vitest';
import {
  createInferenceWorkQueue,
  InferenceQueueAbortError,
  InferenceQueueFullError
} from '../src/queue/inferenceWorkQueue.js';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('inference work queue', () => {
  it('starts pending work in FIFO order', async () => {
    const firstDeferred = createDeferred();
    const executionOrder = [];
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 2 });

    const first = queue.enqueue(() => {
      executionOrder.push('first');
      return firstDeferred.promise;
    });
    const second = queue.enqueue(() => {
      executionOrder.push('second');
      return 'second result';
    });
    const third = queue.enqueue(() => {
      executionOrder.push('third');
      return 'third result';
    });

    expect(executionOrder).toEqual(['first']);
    firstDeferred.resolve('first result');

    await expect(first).resolves.toBe('first result');
    await expect(second).resolves.toBe('second result');
    await expect(third).resolves.toBe('third result');
    expect(executionOrder).toEqual(['first', 'second', 'third']);
  });

  it('enforces configurable concurrency', async () => {
    const deferredTasks = Array.from({ length: 4 }, createDeferred);
    let active = 0;
    let maximumActive = 0;
    let started = 0;
    const queue = createInferenceWorkQueue({ concurrency: 2, maximumPending: 2 });
    const jobs = deferredTasks.map(deferred => queue.enqueue(() => {
      started += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return deferred.promise.finally(() => {
        active -= 1;
      });
    }));

    expect(started).toBe(2);
    expect(queue.getSnapshot()).toMatchObject({ running: 2, pending: 2 });

    deferredTasks[0].resolve();
    await jobs[0];
    expect(started).toBe(3);
    expect(maximumActive).toBe(2);

    deferredTasks[1].resolve();
    deferredTasks[2].resolve();
    await Promise.all([jobs[1], jobs[2]]);
    deferredTasks[3].resolve();
    await jobs[3];

    expect(maximumActive).toBe(2);
    expect(queue.getSnapshot()).toMatchObject({ running: 0, pending: 0, completed: 4 });
  });

  it('rejects work when pending capacity is full', async () => {
    const runningDeferred = createDeferred();
    const events = [];
    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 1,
      onEvent: event => events.push(event)
    });
    const running = queue.enqueue(() => runningDeferred.promise);
    const pending = queue.enqueue(() => 'pending');

    await expect(queue.enqueue(() => 'rejected', {
      requestId: 'request-3',
      operation: 'generation'
    })).rejects.toMatchObject({
      name: 'InferenceQueueFullError',
      code: 'INFERENCE_QUEUE_FULL',
      requestId: 'request-3',
      operation: 'generation',
      queue: {
        running: 1,
        pending: 1,
        maximumPending: 1,
        concurrency: 1,
        accepted: 2,
        rejected: 1
      }
    });
    expect(events.at(-1)).toMatchObject({
      type: 'rejected_full',
      requestId: 'request-3',
      operation: 'generation'
    });

    runningDeferred.resolve('running');
    await expect(running).resolves.toBe('running');
    await expect(pending).resolves.toBe('pending');
  });

  it('rejects a pre-aborted job without accepting or executing it', async () => {
    const task = vi.fn();
    const controller = new AbortController();
    const events = [];
    controller.abort();
    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 1,
      onEvent: event => events.push(event)
    });

    await expect(queue.enqueue(task, {
      signal: controller.signal,
      requestId: 'pre-aborted'
    })).rejects.toMatchObject({
      name: 'InferenceQueueAbortError',
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'pre_enqueue',
      requestId: 'pre-aborted'
    });

    expect(task).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toMatchObject({ accepted: 0, aborted: 1 });
    expect(events).toEqual([
      expect.objectContaining({ type: 'aborted_pending', phase: 'pre_enqueue' })
    ]);
  });

  it('removes aborted pending work and cleans up its listener', async () => {
    const runningDeferred = createDeferred();
    const pendingTask = vi.fn();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 1 });
    const running = queue.enqueue(() => runningDeferred.promise);
    const pending = queue.enqueue(pendingTask, { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(InferenceQueueAbortError);
    expect(pendingTask).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledOnce();
    expect(queue.getSnapshot()).toMatchObject({
      running: 1,
      pending: 0,
      accepted: 2,
      aborted: 1
    });

    runningDeferred.resolve();
    await running;
  });

  it('does not start immediate work aborted by its queued lifecycle hook', async () => {
    const controller = new AbortController();
    const task = vi.fn();
    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 0,
      onEvent: event => {
        if (event.type === 'queued') controller.abort();
      }
    });

    await expect(queue.enqueue(task, {
      signal: controller.signal
    })).rejects.toMatchObject({
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'pending'
    });
    expect(task).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toMatchObject({
      running: 0,
      pending: 0,
      accepted: 1,
      aborted: 1
    });
  });

  it('detaches an aborted running consumer until native work settles', async () => {
    const runningDeferred = createDeferred();
    const nextTask = vi.fn(() => 'next result');
    const controller = new AbortController();
    const events = [];
    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 1,
      onEvent: event => events.push(event)
    });
    const running = queue.enqueue(() => runningDeferred.promise, {
      signal: controller.signal,
      requestId: 'running-request',
      operation: 'generation'
    });
    const next = queue.enqueue(nextTask);

    controller.abort();

    await expect(running).rejects.toMatchObject({
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'running',
      requestId: 'running-request'
    });
    expect(nextTask).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toMatchObject({ running: 1, pending: 1, aborted: 1 });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'aborted_running',
      requestId: 'running-request',
      operation: 'generation'
    }));

    runningDeferred.resolve('discarded result');
    await expect(next).resolves.toBe('next result');
    expect(nextTask).toHaveBeenCalledOnce();
    expect(queue.getSnapshot()).toMatchObject({
      running: 0,
      pending: 0,
      accepted: 2,
      aborted: 1,
      completed: 1,
      failed: 0
    });
  });

  it('recovers after synchronous and asynchronous task failures', async () => {
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 2 });
    const synchronousFailure = queue.enqueue(() => {
      throw new Error('synchronous failure');
    });
    const asynchronousFailure = queue.enqueue(() => Promise.reject(
      new Error('asynchronous failure')
    ));
    const recovered = queue.enqueue(() => 'recovered');

    await expect(synchronousFailure).rejects.toThrow('synchronous failure');
    await expect(asynchronousFailure).rejects.toThrow('asynchronous failure');
    await expect(recovered).resolves.toBe('recovered');
    expect(queue.getSnapshot()).toMatchObject({
      running: 0,
      pending: 0,
      accepted: 3,
      completed: 1,
      failed: 2
    });
  });

  it('cleans up abort listeners after normal completion', async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 0 });

    await expect(queue.enqueue(() => 'complete', {
      signal: controller.signal
    })).resolves.toBe('complete');

    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeListener).toHaveBeenCalledOnce();
    controller.abort();
    expect(queue.getSnapshot().aborted).toBe(0);
  });

  it('reports deterministic queue age, counters, and content-safe event metadata', async () => {
    let clock = 100;
    const runningDeferred = createDeferred();
    const events = [];
    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 1,
      now: () => clock,
      onEvent: event => events.push(event)
    });
    const running = queue.enqueue(() => runningDeferred.promise);
    const pending = queue.enqueue(() => 'pending', {
      requestId: 'request\n-2',
      operation: `generation\u0000${'x'.repeat(80)}`
    });

    clock = 135;
    expect(queue.getSnapshot()).toEqual({
      running: 1,
      pending: 1,
      maximumPending: 1,
      concurrency: 1,
      oldestPendingAgeMs: 35,
      accepted: 2,
      rejected: 0,
      aborted: 0,
      completed: 0,
      failed: 0
    });
    expect(events.at(-1)).toMatchObject({
      type: 'queued',
      requestId: 'request-2',
      operation: `generation${'x'.repeat(54)}`
    });
    expect(JSON.stringify(events)).not.toContain('text');

    runningDeferred.resolve();
    await running;
    await pending;
    expect(queue.getSnapshot()).toMatchObject({ completed: 2, oldestPendingAgeMs: 0 });
  });

  it('validates configuration and keeps observer failures isolated', async () => {
    expect(() => createInferenceWorkQueue({
      concurrency: 0,
      maximumPending: 1
    })).toThrow('concurrency must be a positive integer');
    expect(() => createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: -1
    })).toThrow('maximumPending must be a non-negative integer');

    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 0,
      onEvent: () => {
        throw new Error('observer failure');
      }
    });
    await expect(queue.enqueue(() => 'result')).resolves.toBe('result');
  });

  it('exports stable typed queue errors', () => {
    expect(new InferenceQueueFullError({ running: 1 })).toMatchObject({
      name: 'InferenceQueueFullError',
      code: 'INFERENCE_QUEUE_FULL'
    });
    expect(new InferenceQueueAbortError('pending')).toMatchObject({
      name: 'InferenceQueueAbortError',
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'pending'
    });
  });
});
