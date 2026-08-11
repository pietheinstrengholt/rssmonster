import { acceptHMRUpdate, defineStore } from 'pinia';
import { triggerCrawl as triggerCrawlAPI } from '../api/crawl.js';
import { startFeedRefresh as startFeedRefreshAPI } from '../api/feeds.js';
import { notifyActionError } from '../services/actionNotifications.js';
import {
  FEED_REFRESH_EVENT_TYPES,
  openFeedRefreshEvents,
  parseFeedRefreshEvent
} from '../services/feedRefreshStream.js';

const refreshRuntimeByStore = new WeakMap();

// Creates the initial progress presentation for a feed-refresh job.
export function createFeedRefreshProgress() {
  return {
    visible: false,
    currentFeedLabel: 'Waiting to start...',
    progressPercent: 0,
    totalFeeds: 0,
    processedFeeds: 0,
    newArticles: 0,
    errors: 0,
    logs: []
  };
}

// Creates reactive state for one session's feed-refresh lifecycle.
const initialFeedRefreshState = () => ({
  currentJobId: null,
  running: false,
  error: null,
  completionStatus: 'idle',
  successfulCompletionId: 0,
  refreshGeneration: 0,
  streamGeneration: 0,
  progress: createFeedRefreshProgress()
});

// Returns non-reactive stream and timer resources owned by one store instance.
const getRefreshRuntime = store => {
  if (!refreshRuntimeByStore.has(store)) {
    refreshRuntimeByStore.set(store, {
      completionTimer: null,
      eventListeners: [],
      eventSource: null,
      fallbackTimer: null
    });
  }

  return refreshRuntimeByStore.get(store);
};

export const useFeedRefreshStore = defineStore('feedRefresh', {
  // This state owns the active refresh job and its application-wide presentation.
  state: initialFeedRefreshState,

  actions: {
    // Starts one live refresh job and falls back only when live startup is unavailable.
    async startRefresh() {
      if (this.running) return;

      this.running = true;
      this.currentJobId = null;
      this.error = null;
      this.completionStatus = 'running';
      const refreshGeneration = ++this.refreshGeneration;
      this.resetProgress();
      this.progress.visible = true;
      this.appendLog('Starting refresh...');

      try {
        const response = await startFeedRefreshAPI();
        const jobId = response?.data?.jobId;
        const reused = Boolean(response?.data?.reused);

        if (this.refreshGeneration !== refreshGeneration) return;

        if (!jobId) {
          throw new Error('Missing refresh job id');
        }

        this.currentJobId = jobId;
        if (reused) {
          this.appendLog('Resuming live updates for an already running refresh job.');
        }

        this.openEventStream(jobId);
      } catch (error) {
        if (this.refreshGeneration !== refreshGeneration) return;
        this.appendLog('Live refresh unavailable. Falling back to standard refresh.');
        await this.runFallbackRefresh(error, refreshGeneration);
      }
    },

    // Clears the prior job's displayed refresh metrics.
    resetProgress() {
      this.progress = createFeedRefreshProgress();
    },

    // Adds one timestamped status line to the bounded progress log.
    appendLog(message) {
      const timestamp = new Date().toLocaleTimeString();
      this.progress.logs.unshift(`${timestamp} - ${message}`);
      this.progress.logs = this.progress.logs.slice(0, 8);
    },

    // Applies a server progress event to the shared refresh metrics.
    updateProgress(payload) {
      if (!payload || typeof payload !== 'object') return;

      const totalFeeds = Number(payload.totalFeeds || 0);
      const processedFeeds = Number(payload.processedFeeds || payload.currentFeed || 0);

      this.progress.totalFeeds = totalFeeds;
      this.progress.processedFeeds = processedFeeds;
      this.progress.newArticles = Number(payload.newArticles || 0);
      this.progress.errors = Number(payload.errors || 0);

      if (payload.feedName) {
        const currentFeed = Number(payload.currentFeed || processedFeeds || 0);
        this.progress.currentFeedLabel = `${payload.feedName} (${currentFeed}/${totalFeeds || '?'})`;
      } else if (totalFeeds > 0) {
        this.progress.currentFeedLabel = `${processedFeeds}/${totalFeeds} feeds`;
      }

      if (totalFeeds > 0) {
        this.progress.progressPercent = Math.min(
          100,
          Math.round((processedFeeds / totalFeeds) * 100)
        );
      }
    },

    // Applies one parsed refresh event while guarding against stale stream generations.
    handleStreamEvent(event, streamGeneration) {
      if (this.streamGeneration !== streamGeneration) return;

      try {
        const { type, payload } = parseFeedRefreshEvent(event);
        this.updateProgress(payload);

        switch (type) {
          case 'refresh_started':
            this.appendLog(`Refresh started for ${payload.totalFeeds || 0} feeds.`);
            break;
          case 'feed_started':
            this.appendLog(`Started: ${payload.feedName || payload.feedId}`);
            break;
          case 'feed_parsed':
            this.appendLog(`Parsed ${payload.entries || 0} entries from ${payload.feedName || payload.feedId}.`);
            break;
          case 'articles_inserted_updated':
            this.appendLog(`Articles for ${payload.feedName || payload.feedId}: +${payload.feedNewArticles || 0} new, ${payload.feedUpdatedArticles || 0} updated.`);
            break;
          case 'feed_error':
            this.appendLog(`Error in ${payload.feedName || payload.feedId}: ${payload.message || 'unknown error'}`);
            break;
          case 'feed_completed':
            this.appendLog(`Completed: ${payload.feedName || payload.feedId}`);
            break;
          case 'done':
            this.appendLog('Refresh completed.');
            this.finishStream(true);
            break;
          case 'error':
            this.appendLog(payload.message || 'Refresh failed.');
            this.error = { message: payload.message || 'Refresh failed.' };
            this.finishStream(false);
            break;
          default:
            break;
        }
      } catch (error) {
        this.appendLog('Received invalid progress payload.');
        console.warn('Invalid SSE payload', error);
      }
    },

    // Connects the authenticated progress stream for the active refresh job.
    openEventStream(jobId) {
      this.closeEventStream();

      const runtime = getRefreshRuntime(this);
      const eventSource = openFeedRefreshEvents(jobId);
      runtime.eventSource = eventSource;
      const streamGeneration = this.streamGeneration;

      // This handler applies named server events through the active generation guard.
      const handleEvent = event => {
        this.handleStreamEvent(event, streamGeneration);
      };

      // This handler reports when the active stream establishes a connection.
      eventSource.onopen = () => {
        if (this.streamGeneration === streamGeneration) {
          this.appendLog('Live connection established.');
        }
      };

      // This handler closes a disconnected stream without starting a duplicate crawl.
      eventSource.onerror = () => {
        if (this.streamGeneration !== streamGeneration) return;
        this.appendLog('Live updates disconnected.');
        this.error = { message: 'Live updates disconnected.' };
        this.finishStream(false);
      };

      // This operation retains every listener registration for explicit teardown.
      FEED_REFRESH_EVENT_TYPES.forEach(type => {
        eventSource.addEventListener(type, handleEvent);
        runtime.eventListeners.push({ type, handler: handleEvent });
      });
    },

    // Falls back to the legacy refresh endpoint when live startup fails.
    async runFallbackRefresh(error, refreshGeneration = this.refreshGeneration) {
      const runtime = getRefreshRuntime(this);

      try {
        await triggerCrawlAPI();
        if (this.refreshGeneration !== refreshGeneration) return;
        // This callback leaves fallback progress visible long enough to read.
        runtime.fallbackTimer = setTimeout(() => {
          if (this.refreshGeneration !== refreshGeneration) return;
          this.appendLog('Standard refresh completed.');
          this.running = false;
          this.currentJobId = null;
          this.completionStatus = 'fallback-complete';
          this.progress.visible = false;
          runtime.fallbackTimer = null;
        }, 2000);
      } catch (fallbackError) {
        if (this.refreshGeneration !== refreshGeneration) return;
        this.running = false;
        this.currentJobId = null;
        this.completionStatus = 'error';
        this.progress.visible = false;
        const refreshError = fallbackError || error;
        this.error = { message: refreshError?.message || 'Feed refresh failed' };
        console.error('Error refreshing feeds after stream fallback:', refreshError);
        notifyActionError('Could not refresh feeds. Please try again.', refreshError);
      }
    },

    // Closes a terminal stream and publishes completion after the existing display delay.
    finishStream(success) {
      this.closeEventStream();
      const runtime = getRefreshRuntime(this);
      const refreshGeneration = this.refreshGeneration;

      if (!success && !this.error) {
        this.error = { message: 'Feed refresh failed' };
      }

      // This callback briefly preserves the terminal progress state before hiding it.
      runtime.completionTimer = setTimeout(() => {
        if (this.refreshGeneration !== refreshGeneration) return;
        this.running = false;
        this.currentJobId = null;
        this.completionStatus = success ? 'success' : 'error';
        this.progress.visible = false;
        runtime.completionTimer = null;
        if (success) {
          this.successfulCompletionId += 1;
        }
      }, 500);
    },

    // Releases the active stream request and invalidates all of its callbacks.
    closeEventStream() {
      const runtime = getRefreshRuntime(this);
      if (!runtime.eventSource) return;

      const eventSource = runtime.eventSource;
      // This operation unregisters every named callback from the active stream.
      runtime.eventListeners.forEach(({ type, handler }) => {
        eventSource.removeEventListener?.(type, handler);
      });
      runtime.eventListeners = [];
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.close();
      runtime.eventSource = null;
      this.streamGeneration += 1;
    },

    // Stops transport resources and delayed callbacks owned by this session.
    teardown() {
      const runtime = getRefreshRuntime(this);
      this.refreshGeneration += 1;
      this.closeEventStream();
      clearTimeout(runtime.completionTimer);
      clearTimeout(runtime.fallbackTimer);
      runtime.completionTimer = null;
      runtime.fallbackTimer = null;
      this.running = false;
      this.currentJobId = null;
      this.progress.visible = false;
    },

    // Clears refresh state and transport resources when the authenticated user changes.
    resetSessionState() {
      this.teardown();
      const refreshGeneration = this.refreshGeneration;
      const streamGeneration = this.streamGeneration;
      this.$patch({
        ...initialFeedRefreshState(),
        refreshGeneration,
        streamGeneration
      });
    }
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFeedRefreshStore, import.meta.hot));
}
