import {
  completeProcessingJob,
  deadLetterProcessingJob,
  DEFAULT_PROCESSING_JOB_LEASE_MS,
  renewProcessingJobLease,
  retryProcessingJob
} from './processingJobQueue.js';
import { recordProcessingFailure } from '../observability/processingFailures.js';
import {
  handleArticleEnrichmentJob,
  markArticleEnrichmentFailed
} from './handlers/articleEnrichmentJobHandler.js';
import { handleSemanticLabelJob } from './handlers/semanticLabelJobHandler.js';

const rowValue = (row, field) => typeof row?.getDataValue === 'function'
  ? row.getDataValue(field)
  : row?.[field];

const safeJobTarget = job => {
  const type = rowValue(job, 'type');
  const payload = rowValue(job, 'payload') || {};
  return type === 'semantic_label'
    ? { targetType: payload.targetType || null, targetId: payload.targetId || null }
    : { articleId: rowValue(job, 'articleId') || payload.articleId || null };
};

export const processingJobLogContext = job => ({
  jobId: rowValue(job, 'id'),
  type: rowValue(job, 'type'),
  attempt: Number(rowValue(job, 'attempts') || 0),
  userId: Number(rowValue(job, 'userId')),
  target: safeJobTarget(job)
});

const compactLogField = ([key, value]) => value === undefined
  ? null
  : `${key}=${JSON.stringify(value)}`;

// Formats job lifecycle data as one safe, grep-friendly worker log line.
export const formatProcessingJobLogLine = (job, event, details = {}) => {
  const fields = Object.entries({
    ...processingJobLogContext(job),
    ...details
  }).map(compactLogField).filter(Boolean);
  return `[AiWorker] ${event} ${fields.join(' ')}`;
};

const logJobEvent = (logger, job, event, details = {}) => {
  logger?.log?.(formatProcessingJobLogLine(job, event, details));
};

export const processingJobHandlerRegistry = new Map([
  ['article_enrichment', handleArticleEnrichmentJob],
  ['semantic_label', handleSemanticLabelJob]
]);

export const getProcessingJobHandler = type => processingJobHandlerRegistry.get(type) || null;

const lifecycleIdentity = (job, leaseOwner) => ({
  jobId: rowValue(job, 'id'),
  userId: Number(rowValue(job, 'userId')),
  leaseOwner
});

const leaseLostError = cause => {
  const error = new Error('Processing job lease was lost', cause ? { cause } : undefined);
  error.name = 'ProcessingJobLeaseLostError';
  error.code = 'PROCESSING_JOB_LEASE_LOST';
  error.retryable = true;
  return error;
};

const unknownHandlerError = type => {
  const error = new Error(`No processing-job handler is registered for ${type}`);
  error.code = 'PROCESSING_JOB_HANDLER_MISSING';
  error.retryable = false;
  return error;
};

const recordJobFailure = async ({ job, error, status }) => {
  const jobType = rowValue(job, 'type');
  const payload = rowValue(job, 'payload') || {};
  const semanticLabelJob = jobType === 'semantic_label';
  return recordProcessingFailure({
    executionId: rowValue(job, 'id'),
    userId: rowValue(job, 'userId'),
    stage: jobType,
    failureType: error.code === 'INFERENCE_QUEUE_FULL' ? 'UNAVAILABLE' : null,
    severity: status === 'dead' ? 'ERROR' : 'WARNING',
    code: error.code,
    error,
    message: error.message,
    subjectType: semanticLabelJob ? payload.targetType : 'article',
    subjectId: semanticLabelJob ? payload.targetId : rowValue(job, 'articleId'),
    feedId: error.processingFeedId,
    articleId: semanticLabelJob ? null : rowValue(job, 'articleId'),
    retryable: error.retryable !== false,
    attemptNumber: Number(rowValue(job, 'attempts')),
    context: {
      jobId: rowValue(job, 'id'),
      jobType: rowValue(job, 'type'),
      jobStatus: status,
      ...(error.requestId ? { requestId: error.requestId } : {})
    }
  });
};

// Records an abandoned lease as a recoverable abnormal outcome without retaining job payloads.
export const recordRecoveredProcessingJobLease = async job => {
  const error = Object.assign(new Error('Processing job lease expired before completion'), {
    name: 'ProcessingJobLeaseExpiredError',
    code: 'PROCESSING_JOB_LEASE_EXPIRED',
    retryable: true
  });
  await recordJobFailure({ job, error, status: 'pending' });
};

// Executes one already-claimed job; worker polling remains a separate concern.
export const executeClaimedProcessingJob = async (job, {
  leaseOwner = rowValue(job, 'leaseOwner'),
  leaseMs = DEFAULT_PROCESSING_JOB_LEASE_MS,
  heartbeatIntervalMs = Math.max(1000, Math.floor(leaseMs / 3)),
  signal = null,
  logger = null
} = {}) => {
  const executionStartedAt = Date.now();
  const identity = lifecycleIdentity(job, leaseOwner);
  const handler = getProcessingJobHandler(rowValue(job, 'type'));
  const leaseAbortController = new AbortController();
  const inferenceSignal = signal
    ? AbortSignal.any([signal, leaseAbortController.signal])
    : leaseAbortController.signal;
  let leaseLost = false;
  let renewalInFlight = null;

  const renewLease = async () => {
    if (leaseLost) throw leaseLostError();
    if (!renewalInFlight) {
      renewalInFlight = renewProcessingJobLease(identity, { leaseMs })
        .then(renewed => {
          if (!renewed) {
            leaseLost = true;
            leaseAbortController.abort(leaseLostError());
          }
          return renewed;
        })
        .catch(error => {
          leaseLost = true;
          leaseAbortController.abort(leaseLostError(error));
          throw error;
        })
        .finally(() => {
          renewalInFlight = null;
        });
    }
    let renewed;
    try {
      renewed = await renewalInFlight;
    } catch (error) {
      throw leaseLostError(error);
    }
    if (!renewed) throw leaseLostError();
  };

  const heartbeat = setInterval(() => {
    renewLease().catch(() => {});
  }, heartbeatIntervalMs);
  heartbeat.unref?.();

  try {
    logJobEvent(logger, job, 'processing_job.started');
    if (!handler) throw unknownHandlerError(rowValue(job, 'type'));
    await renewLease();
    const result = await handler(job, {
      assertLease: renewLease,
      signal: inferenceSignal
    });
    await renewLease();
    const completed = await completeProcessingJob(identity);
    if (!completed) throw leaseLostError();
    logJobEvent(logger, job, 'processing_job.completed', {
      status: 'succeeded',
      processingLatencyMs: Date.now() - executionStartedAt
    });
    return { status: 'succeeded', result };
  } catch (caughtError) {
    const error = caughtError?.code
      ? caughtError
      : Object.assign(new Error('Processing job execution failed'), {
          code: 'PROCESSING_JOB_FAILED',
          retryable: true,
          cause: caughtError
        });
    const retryable = error.retryable !== false;
    const lifecycle = retryable
      ? await retryProcessingJob(identity, error)
      : {
          updated: await deadLetterProcessingJob(identity, error),
          status: 'dead'
        };
    const status = lifecycle.updated ? lifecycle.status : 'lease_lost';
    if (status === 'dead' && rowValue(job, 'type') === 'article_enrichment') {
      try {
        await markArticleEnrichmentFailed(job);
      } catch (markError) {
        const guardedError = markError?.code
          ? markError
          : Object.assign(new Error('Failed to mark exhausted article enrichment'), {
              code: 'ARTICLE_ENRICHMENT_FAILURE_STATE_WRITE_FAILED',
              retryable: true,
              cause: markError
        });
        await recordJobFailure({ job, error: guardedError, status: 'dead' });
      }
    }
    await recordJobFailure({ job, error, status });
    logJobEvent(logger, job, 'processing_job.failed', {
      status,
      errorCode: error.code,
      retryable,
      processingLatencyMs: Date.now() - executionStartedAt,
      ...(lifecycle.availableAt ? { availableAt: lifecycle.availableAt.toISOString() } : {})
    });
    return { status, error, lifecycle };
  } finally {
    clearInterval(heartbeat);
  }
};

export default processingJobHandlerRegistry;
