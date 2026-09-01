import { randomUUID } from 'node:crypto';
import {
  OPML_PREVIEW_TIMEOUT_MS,
  buildOpmlPreview,
  markOpmlConnectionStatus,
  prepareOpmlSubscriptions
} from './opmlImport.js';

export const OPML_PREVIEW_RESULT_TTL_MS = 10 * 60 * 1000;
const OPML_PREVIEW_MAX_AGE_MS = OPML_PREVIEW_TIMEOUT_MS + 60 * 1000;
const jobs = new Map();

const schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return timer;
};

const connectionCandidates = subscriptions => subscriptions.filter(subscription =>
  !subscription.alreadySubscribed && !subscription.duplicateInFile
);

const jobSnapshot = job => ({
  previewId: job.id,
  status: job.status,
  checkedFeeds: job.checkedFeeds,
  totalFeeds: job.totalFeeds,
  ...(job.status === 'completed' ? { preview: job.preview } : {}),
  ...(job.status === 'failed' ? { error: job.error } : {})
});

const finishJob = (job, updates) => {
  Object.assign(job, updates);
  clearTimeout(job.cleanupTimer);
  job.cleanupTimer = schedule(() => {
    jobs.delete(job.id);
  }, OPML_PREVIEW_RESULT_TTL_MS);
};

// This function starts one user-owned in-memory OPML validation job.
export const startOpmlPreviewJob = async ({ userId, content }, {
  idFactory = randomUUID,
  clock = Date.now,
  prepare = prepareOpmlSubscriptions,
  markConnections = markOpmlConnectionStatus,
  buildPreview = buildOpmlPreview
} = {}) => {
  const deadlineAt = clock() + OPML_PREVIEW_TIMEOUT_MS;
  const prepared = await prepare({ userId, content });
  const subscriptions = prepared.subscriptions;
  const id = idFactory();
  const job = {
    id,
    userId,
    status: 'running',
    checkedFeeds: 0,
    totalFeeds: connectionCandidates(subscriptions).length,
    preview: null,
    error: null,
    cleanupTimer: schedule(() => jobs.delete(id), OPML_PREVIEW_MAX_AGE_MS)
  };
  jobs.set(id, job);

  void Promise.resolve()
    .then(async () => {
      const validatedSubscriptions = await markConnections({
        userId,
        subscriptions,
        deadlineAt
      }, {
        clock,
        onProgress: () => {
          job.checkedFeeds = Math.min(job.checkedFeeds + 1, job.totalFeeds);
        }
      });
      finishJob(job, {
        status: 'completed',
        preview: buildPreview({
          subscriptions: validatedSubscriptions,
          existingCategoryNames: prepared.existingCategoryNames
        })
      });
    })
    .catch(error => {
      console.error('Error validating OPML preview:', error);
      finishJob(job, {
        status: 'failed',
        error: 'OPML preview validation failed'
      });
    });

  return jobSnapshot(job);
};

// This function returns a job only to the user who created it.
export const getOpmlPreviewJob = ({ previewId, userId }) => {
  const job = jobs.get(previewId);
  if (!job || job.userId !== userId) return null;
  return jobSnapshot(job);
};

// This function clears in-memory job state for controlled shutdown and tests.
export const clearOpmlPreviewJobs = () => {
  for (const job of jobs.values()) clearTimeout(job.cleanupTimer);
  jobs.clear();
};

export default {
  startOpmlPreviewJob,
  getOpmlPreviewJob,
  clearOpmlPreviewJobs
};
