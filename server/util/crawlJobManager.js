import { randomUUID } from 'crypto';

// This module manages in-memory crawl jobs and their SSE subscriber lists.
// It is the single source of truth for job state within a single Node.js process.
// No external infrastructure (Redis, queues) is required.

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

// How long (ms) a completed/errored job is kept before being garbage-collected.
const JOB_TTL_MS = parseInt(process.env.CRAWL_JOB_TTL_MS) || 60_000;

// Safety cap for jobs that never reach a terminal state (e.g., unexpected crashes).
const JOB_MAX_AGE_MS = parseInt(process.env.CRAWL_JOB_MAX_AGE_MS) || 30 * 60_000;

// Maximum number of buffered events per job. Prevents unbounded memory use
// when a very large feed list is crawled. Oldest events are dropped first.
const MAX_BUFFERED_EVENTS = 500;

/* ------------------------------------------------------------------
 * Internal state
 * ------------------------------------------------------------------ */

// Map<jobId, Job>
// Job shape:
//   id          – string UUID
//   userId      – number | null  (owner; used by routes to enforce access)
//   status      – 'pending' | 'running' | 'done' | 'error'
//   events      – Event[]        (ring buffer for late-connecting clients)
//   subscribers – Set<Response>  (active SSE response objects)
//   createdAt   – Date
//   completedAt – Date | null
//   _gcTimer    – NodeJS.Timeout (GC handle, kept so tests can clear it)
//   _maxAgeTimer – NodeJS.Timeout (hard safety cleanup timer)
const jobs = new Map();

const toSseMessage = (event) => {
  const eventType = event?.type || 'progress';
  return `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`;
};

/* ------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------ */

// This function creates a new job entry and returns its UUID.
function createJob(userId = null) {
  const id = randomUUID();

  const maxAgeTimer = setTimeout(() => {
    const job = jobs.get(id);
    if (!job) return;

    // Close any lingering subscribers before dropping stale job state.
    for (const res of job.subscribers) {
      try { res.end(); } catch { /* ignore */ }
    }
    job.subscribers.clear();
    jobs.delete(id);
  }, JOB_MAX_AGE_MS);

  jobs.set(id, {
    id,
    userId,
    status: 'pending',
    events: [],
    subscribers: new Set(),
    createdAt: new Date(),
    completedAt: null,
    _gcTimer: null,
    _maxAgeTimer: maxAgeTimer
  });
  return id;
}

// This function publishes one event object to all current subscribers of a job
// and appends it to the event buffer so late-connecting clients receive history.
// Calling with type 'done' or 'error' marks the job complete and schedules GC.
function publishEvent(jobId, event) {
  const job = jobs.get(jobId);
  if (!job) return;

  // Enforce ring-buffer limit
  if (job.events.length >= MAX_BUFFERED_EVENTS) {
    job.events.shift();
  }
  job.events.push(event);

  const payload = toSseMessage(event);
  for (const res of job.subscribers) {
    try {
      res.write(payload);
    } catch {
      // Remove broken subscriber references immediately to avoid repeated write failures.
      job.subscribers.delete(res);
    }
  }

  // Terminal events: mark job complete and schedule removal
  if (event.type === 'done' || event.type === 'error') {
    job.status = event.type;
    job.completedAt = new Date();

    // Close all open SSE connections for this job
    for (const res of job.subscribers) {
      try { res.end(); } catch { /* ignore */ }
    }
    job.subscribers.clear();

    job._gcTimer = setTimeout(() => {
      const staleJob = jobs.get(jobId);
      if (!staleJob) return;
      if (staleJob._maxAgeTimer) {
        clearTimeout(staleJob._maxAgeTimer);
      }
      jobs.delete(jobId);
    }, JOB_TTL_MS);
  } else if (job.status === 'pending') {
    job.status = 'running';
  }
}

// This function subscribes an SSE response to a job's event stream.
// It replays buffered events to catch up a late-connecting client, then
// registers the response for future events. Automatically unsubscribes
// when the client disconnects. Returns false if the job does not exist.
function subscribe(jobId, req, res) {
  const job = jobs.get(jobId);

  if (!job) {
    res.write(toSseMessage({ type: 'error', message: 'Job not found' }));
    res.end();
    return false;
  }

  // Replay buffered history so the client has full context
  for (const event of job.events) {
    try {
      res.write(toSseMessage(event));
    } catch {
      return false;
    }
  }

  // If the job is already finished, end the stream immediately
  if (job.status === 'done' || job.status === 'error') {
    res.end();
    return true;
  }

  job.subscribers.add(res);

  // Automatically remove the response when the client closes the connection
  req.on('close', () => {
    unsubscribe(jobId, res);
  });

  return true;
}

// This function removes a response object from a job's subscriber set.
function unsubscribe(jobId, res) {
  const job = jobs.get(jobId);
  if (job) {
    job.subscribers.delete(res);
  }
}

// This function returns a plain read-only snapshot of a job's metadata.
// Returns null if the job does not exist or has already been garbage-collected.
function getJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    id: job.id,
    userId: job.userId,
    status: job.status,
    eventCount: job.events.length,
    subscriberCount: job.subscribers.size,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  };
}

// This function returns an active (pending/running) job for a user, if any.
function getActiveJobForUser(userId) {
  if (!userId) return null;

  for (const job of jobs.values()) {
    if (job.userId === userId && (job.status === 'pending' || job.status === 'running')) {
      return {
        id: job.id,
        userId: job.userId,
        status: job.status,
        createdAt: job.createdAt
      };
    }
  }

  return null;
}

// This function returns the count of currently tracked jobs (useful for health checks).
function jobCount() {
  return jobs.size;
}

export default {
  createJob,
  publishEvent,
  subscribe,
  unsubscribe,
  getJob,
  getActiveJobForUser,
  jobCount
};
