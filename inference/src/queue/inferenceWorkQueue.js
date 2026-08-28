const ABORT_ERROR_CODE = 'INFERENCE_QUEUE_ABORTED';
const FULL_ERROR_CODE = 'INFERENCE_QUEUE_FULL';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export const isInferenceQueueControlError = error =>
  error?.code === ABORT_ERROR_CODE || error?.code === FULL_ERROR_CODE;

const validatePositiveInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
};

const validateMaximumPending = value => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('maximumPending must be a non-negative integer');
  }
};

const validateSignal = signal => {
  if (signal == null) return;
  if (
    typeof signal.aborted !== 'boolean' ||
    typeof signal.addEventListener !== 'function' ||
    typeof signal.removeEventListener !== 'function'
  ) {
    throw new TypeError('signal must be an AbortSignal');
  }
};

const validatePriority = value => {
  if (!Number.isSafeInteger(value)) throw new TypeError('priority must be an integer');
};

const sanitizeLabel = (value, maximumLength) => {
  if (typeof value !== 'string') return undefined;
  const sanitized = value.replace(CONTROL_CHARACTERS, '').slice(0, maximumLength);
  return sanitized || undefined;
};

const sanitizeMetadata = ({ requestId, operation } = {}) => {
  const safeRequestId = sanitizeLabel(requestId, 128);
  const safeOperation = sanitizeLabel(operation, 64);
  return Object.freeze({
    ...(safeRequestId ? { requestId: safeRequestId } : {}),
    ...(safeOperation ? { operation: safeOperation } : {})
  });
};

export class InferenceQueueFullError extends Error {
  constructor(queue, metadata = {}) {
    super('Inference queue has reached its pending-work capacity');
    this.name = 'InferenceQueueFullError';
    this.code = FULL_ERROR_CODE;
    this.queue = Object.freeze({ ...queue });
    Object.assign(this, metadata);
  }
}

export class InferenceQueueAbortError extends Error {
  constructor(phase, metadata = {}) {
    super(`Inference queue job aborted during ${phase}`);
    this.name = 'InferenceQueueAbortError';
    this.code = ABORT_ERROR_CODE;
    this.phase = phase;
    Object.assign(this, metadata);
  }
}

export const createInferenceWorkQueue = ({
  concurrency = 1,
  maximumPending,
  onEvent = () => {},
  now = Date.now
} = {}) => {
  validatePositiveInteger(concurrency, 'concurrency');
  validateMaximumPending(maximumPending);
  if (typeof onEvent !== 'function') throw new TypeError('onEvent must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const pendingJobs = [];
  const counters = {
    accepted: 0,
    rejected: 0,
    aborted: 0,
    completed: 0,
    failed: 0
  };
  let running = 0;

  const getSnapshot = () => Object.freeze({
    running,
    pending: pendingJobs.length,
    maximumPending,
    concurrency,
    oldestPendingAgeMs: pendingJobs.length > 0
      ? Math.max(0, now() - pendingJobs[0].enqueuedAt)
      : 0,
    ...counters
  });

  const emit = (type, metadata, details = {}) => {
    const event = Object.freeze({ type, ...metadata, ...details, ...getSnapshot() });
    try {
      onEvent(event);
    } catch {
      // Observability callbacks must not change inference queue behavior.
    }
  };

  const removeAbortListener = job => {
    if (!job.signal || !job.abortHandler) return;
    job.signal.removeEventListener('abort', job.abortHandler);
    job.abortHandler = null;
  };

  const createAbortError = (job, phase) => new InferenceQueueAbortError(phase, job.metadata);

  const settleRunningJob = (job, outcome, value) => {
    running -= 1;
    job.state = 'settled';
    removeAbortListener(job);
    const executionMs = Math.max(0, now() - job.startedAt);

    if (!job.detached) {
      if (outcome === 'completed') {
        counters.completed += 1;
        emit('completed', job.metadata, { executionMs });
        job.resolve(value);
      } else {
        counters.failed += 1;
        emit('failed', job.metadata, { executionMs });
        job.reject(value);
      }
    }

    drain();
  };

  const startJob = job => {
    job.state = 'running';
    running += 1;
    job.startedAt = now();
    emit('started', job.metadata, {
      queueWaitMs: Math.max(0, job.startedAt - job.enqueuedAt)
    });

    let result;
    try {
      result = job.task();
    } catch (error) {
      settleRunningJob(job, 'failed', error);
      return;
    }

    Promise.resolve(result).then(
      value => settleRunningJob(job, 'completed', value),
      error => settleRunningJob(job, 'failed', error)
    );
  };

  function drain() {
    while (running < concurrency && pendingJobs.length > 0) {
      startJob(pendingJobs.shift());
    }
  }

  const queuePendingJob = job => {
    const insertAt = pendingJobs.findIndex(candidate => candidate.priority < job.priority);
    if (insertAt === -1) pendingJobs.push(job);
    else pendingJobs.splice(insertAt, 0, job);
  };

  const abortJob = job => {
    if (job.state === 'pending') {
      const pendingIndex = pendingJobs.indexOf(job);
      if (pendingIndex !== -1) pendingJobs.splice(pendingIndex, 1);
      job.state = 'settled';
      removeAbortListener(job);
      counters.aborted += 1;
      emit('aborted_pending', job.metadata, { phase: 'pending' });
      job.reject(createAbortError(job, 'pending'));
      return;
    }

    if (job.state === 'running' && !job.detached) {
      job.detached = true;
      removeAbortListener(job);
      counters.aborted += 1;
      emit('aborted_running', job.metadata, {
        phase: 'running',
        executionMs: Math.max(0, now() - job.startedAt)
      });
      job.reject(createAbortError(job, 'running'));
    }
  };

  const enqueue = (task, options = {}) => {
    if (typeof task !== 'function') throw new TypeError('task must be a function');
    const { signal, priority = 0 } = options;
    validateSignal(signal);
    validatePriority(priority);
    const metadata = sanitizeMetadata(options);

    if (signal?.aborted) {
      counters.aborted += 1;
      emit('aborted_pending', metadata, { phase: 'pre_enqueue' });
      return Promise.reject(new InferenceQueueAbortError('pre_enqueue', metadata));
    }

    if (running >= concurrency && pendingJobs.length >= maximumPending) {
      counters.rejected += 1;
      emit('rejected_full', metadata);
      return Promise.reject(new InferenceQueueFullError(getSnapshot(), metadata));
    }

    const enqueuedAt = now();
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const job = {
      task,
      signal,
      metadata,
      priority,
      enqueuedAt,
      resolve,
      reject,
      abortHandler: null,
      detached: false,
      startedAt: null,
      state: 'pending'
    };

    const startImmediately = running < concurrency;
    counters.accepted += 1;
    if (!startImmediately) queuePendingJob(job);
    if (signal) {
      job.abortHandler = () => abortJob(job);
      signal.addEventListener('abort', job.abortHandler, { once: true });
      if (signal.aborted) abortJob(job);
    }

    if (job.state === 'settled') return promise;
    emit('queued', metadata);
    if (startImmediately && job.state === 'pending') startJob(job);
    return promise;
  };

  return Object.freeze({ enqueue, getSnapshot });
};

export default createInferenceWorkQueue;
