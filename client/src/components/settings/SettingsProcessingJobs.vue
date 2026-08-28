<template>
  <div class="processing-jobs-settings settings-page">
    <SettingsPageIntro
      eyebrow="Settings — AI Processing"
      icon="cpu-fill"
      title="Background AI processing"
      title-id="processing-jobs-title"
    >
      Check whether article analysis and semantic labels are processing normally without
      interrupting feed crawling.
    </SettingsPageIntro>

    <div v-if="loading" class="settings-state" role="status" aria-live="polite">
      <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
      <span>Loading processing status...</span>
    </div>

    <template v-else-if="processingStatus">
      <section
        class="processing-health settings-panel"
        :class="`processing-health--${health.status}`"
        aria-labelledby="processing-health-title"
        aria-live="polite"
      >
        <div class="processing-health__main">
          <span class="processing-health__icon" aria-hidden="true">
            <BootstrapIcon :icon="healthIcon" />
          </span>
          <div>
            <div class="processing-health__heading">
              <h4 id="processing-health-title">AI processing</h4>
              <span class="app-status-badge" :class="healthBadgeClass">
                {{ healthLabel }}
              </span>
            </div>
            <p>{{ healthDescription }}</p>
          </div>
        </div>
        <span class="processing-health__worker">
          Worker {{ health.workerRunning ? 'active' : 'not reporting' }}
        </span>
      </section>

      <div class="processing-primary-metrics" aria-label="Primary processing metrics">
        <SettingsMetric label="Pending" :value="formatNumber(summary.pending)" />
        <SettingsMetric label="Processing" :value="formatNumber(summary.running)" />
        <SettingsMetric label="Failed" :value="formatNumber(summary.dead)" />
      </div>

      <section class="processing-secondary settings-panel" aria-labelledby="processing-details-title">
        <h4 id="processing-details-title">Current activity</h4>
        <dl>
          <div>
            <dt>Retrying</dt>
            <dd>{{ formatNumber(summary.retrying) }}</dd>
          </div>
          <div>
            <dt>Oldest waiting</dt>
            <dd>{{ formatAge(summary.oldestPendingAgeSeconds) }}</dd>
          </div>
          <div>
            <dt>Average duration</dt>
            <dd>{{ formatDuration(summary.averageProcessingLatencyMs) }}</dd>
          </div>
          <div>
            <dt>Completed today</dt>
            <dd>{{ formatNumber(summary.completedToday) }}</dd>
          </div>
        </dl>
      </section>

      <div v-if="!activeTypes.length" class="app-notice app-notice--info" role="status">
        No background work waiting
      </div>

      <section v-else class="settings-data-panel processing-types" aria-labelledby="processing-types-title">
        <div class="processing-section-heading">
          <div>
            <h4 id="processing-types-title">Work by type</h4>
            <p>Queued and failed work grouped by its background task.</p>
          </div>
        </div>

        <div class="processing-types__table-wrap">
          <table class="processing-types__table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Waiting</th>
                <th scope="col">Processing</th>
                <th scope="col">Failed</th>
                <th scope="col">Oldest</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="type in activeTypes" :key="type.type">
                <th scope="row" data-label="Type">{{ jobTypeLabel(type.type) }}</th>
                <td data-label="Waiting">{{ formatNumber(type.pending) }}</td>
                <td data-label="Processing">{{ formatNumber(type.running) }}</td>
                <td data-label="Failed">{{ formatNumber(type.dead) }}</td>
                <td data-label="Oldest">{{ formatAge(type.oldestPendingAgeSeconds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="error" class="app-notice app-notice--warning" role="alert">
        {{ error }} Showing the last available status.
      </div>
    </template>

    <div v-else-if="error" class="app-notice app-notice--warning" role="alert">
      {{ error }}
    </div>

    <div class="settings-refresh-actions processing-refresh-actions">
      <span v-if="lastUpdatedAt" class="processing-last-updated">
        Updated {{ formatTime(lastUpdatedAt) }}
      </span>
      <button
        type="button"
        class="settings-refresh-button app-button app-button--primary"
        :disabled="loading || refreshing"
        :aria-busy="refreshing ? 'true' : 'false'"
        aria-label="Refresh AI processing status"
        @click="reload"
      >
        <span v-if="refreshing" class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
        <BootstrapIcon v-else icon="arrow-clockwise" aria-hidden="true" />
        {{ refreshing ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.processing-health {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
  padding: 18px;
  border-left: 3px solid var(--settings-success-text);
}

.processing-health--busy {
  border-left-color: var(--settings-info-text);
}

.processing-health--degraded {
  border-left-color: var(--settings-orange-text);
}

.processing-health--stalled {
  border-left-color: var(--settings-danger-text);
}

.processing-health__main {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 12px;
}

.processing-health__icon {
  display: inline-flex;
  width: var(--control-height-compact);
  height: var(--control-height-compact);
  flex: 0 0 var(--control-height-compact);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
}

.processing-health__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.processing-health h4,
.processing-secondary h4,
.processing-section-heading h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
}

.processing-health p,
.processing-section-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}

.processing-health__worker {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.processing-health .app-status-badge--warning {
  background: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

.processing-health .app-status-badge--danger {
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

.processing-primary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.processing-secondary {
  margin-bottom: 16px;
  padding: 18px;
}

.processing-secondary dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0 0;
}

.processing-secondary dl div {
  min-width: 0;
}

.processing-secondary dt {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.processing-secondary dd {
  margin: 5px 0 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.processing-types {
  margin-bottom: 16px;
  padding: 18px;
}

.processing-types__table-wrap {
  margin-top: 14px;
  overflow-x: auto;
}

.processing-types__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.processing-types__table th,
.processing-types__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: right;
  white-space: nowrap;
}

.processing-types__table th:first-child,
.processing-types__table td:first-child {
  padding-left: 0;
  text-align: left;
}

.processing-types__table th:last-child,
.processing-types__table td:last-child {
  padding-right: 0;
}

.processing-types__table thead th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.processing-types__table tbody th {
  color: var(--text-primary);
  font-weight: 600;
}

.processing-types__table tbody td {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.processing-types__table tbody tr:last-child th,
.processing-types__table tbody tr:last-child td {
  border-bottom: 0;
}

.processing-refresh-actions {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.processing-last-updated {
  color: var(--text-muted);
  font-size: 12px;
}

@media (max-width: 879px) {
  .processing-secondary dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .processing-types__table-wrap {
    overflow: visible;
  }

  .processing-types__table,
  .processing-types__table tbody,
  .processing-types__table tr,
  .processing-types__table th,
  .processing-types__table td {
    display: block;
    width: 100%;
  }

  .processing-types__table thead {
    display: none;
  }

  .processing-types__table tbody tr {
    padding: 8px 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .processing-types__table tbody tr:last-child {
    border-bottom: 0;
  }

  .processing-types__table tbody th,
  .processing-types__table tbody td {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 0;
    border: 0;
    text-align: right;
  }

  .processing-types__table tbody th::before,
  .processing-types__table tbody td::before {
    color: var(--text-muted);
    content: attr(data-label);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
}

@media (max-width: 600px) {
  .processing-health {
    align-items: flex-start;
    flex-direction: column;
  }

  .processing-primary-metrics,
  .processing-secondary dl {
    grid-template-columns: 1fr;
  }

  .processing-refresh-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .processing-refresh-actions .app-button {
    justify-content: center;
    width: 100%;
  }
}
</style>

<script>
import { fetchProcessingJobStatus } from '../../api/settings.js';
import SettingsMetric from './SettingsMetric.vue';
import SettingsPageIntro from './SettingsPageIntro.vue';

const PROCESSING_STATUS_POLL_INTERVAL_MS = 30_000;
const EMPTY_SUMMARY = Object.freeze({
  pending: 0,
  running: 0,
  retrying: 0,
  dead: 0,
  completedToday: 0,
  oldestPendingAgeSeconds: null,
  averageProcessingLatencyMs: null
});
const JOB_TYPE_LABELS = Object.freeze({
  article_enrichment: 'Article analysis',
  semantic_label: 'Semantic labels'
});
const HEALTH_PRESENTATION = Object.freeze({
  healthy: {
    label: 'Healthy',
    badgeClass: 'app-status-badge--success',
    icon: 'check-circle-fill',
    description: 'Background AI processing is operating normally.'
  },
  busy: {
    label: 'Busy',
    badgeClass: 'app-status-badge--info',
    icon: 'arrow-repeat',
    description: 'Background AI processing is working through queued items.'
  },
  degraded: {
    label: 'Degraded',
    badgeClass: 'app-status-badge--warning',
    icon: 'exclamation-triangle-fill',
    description: 'Some background work is retrying or has failed.'
  },
  stalled: {
    label: 'Stalled',
    badgeClass: 'app-status-badge--danger',
    icon: 'exclamation-circle-fill',
    description: 'Background work is not making expected progress.'
  }
});

export default {
  name: 'SettingsProcessingJobs',
  components: {
    SettingsMetric,
    SettingsPageIntro
  },
  data() {
    return {
      error: null,
      lastUpdatedAt: null,
      loading: false,
      pollIntervalId: null,
      processingStatus: null,
      refreshing: false
    };
  },
  computed: {
    health() {
      return {
        status: 'degraded',
        workerRunning: false,
        ...this.processingStatus?.health
      };
    },
    healthPresentation() {
      return HEALTH_PRESENTATION[this.health.status] || HEALTH_PRESENTATION.degraded;
    },
    healthBadgeClass() {
      return this.healthPresentation.badgeClass;
    },
    healthDescription() {
      if (!this.health.workerRunning && this.health.status !== 'stalled') {
        return `${this.healthPresentation.description} The worker is not currently reporting as active.`;
      }
      return this.healthPresentation.description;
    },
    healthIcon() {
      return this.healthPresentation.icon;
    },
    healthLabel() {
      return this.healthPresentation.label;
    },
    summary() {
      return { ...EMPTY_SUMMARY, ...this.processingStatus?.summary };
    },
    activeTypes() {
      return (this.processingStatus?.types || []).filter(type =>
        Number(type.pending || 0) > 0 ||
        Number(type.running || 0) > 0 ||
        Number(type.retrying || 0) > 0 ||
        Number(type.dead || 0) > 0
      );
    }
  },
  created() {
    this.reload();
  },
  mounted() {
    this.pollIntervalId = window.setInterval(
      () => this.reload(),
      PROCESSING_STATUS_POLL_INTERVAL_MS
    );
  },
  beforeUnmount() {
    if (this.pollIntervalId !== null) window.clearInterval(this.pollIntervalId);
  },
  methods: {
    async reload() {
      if (this.loading || this.refreshing) return;

      const initialLoad = !this.processingStatus;
      this.loading = initialLoad;
      this.refreshing = !initialLoad;
      this.error = null;

      try {
        const response = await fetchProcessingJobStatus();
        this.processingStatus = response.data || {};
        this.lastUpdatedAt = new Date();
      } catch (error) {
        console.error('Error loading processing-job status:', error);
        this.error = 'Processing status unavailable.';
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },
    formatAge(value) {
      if (value === null || value === undefined) return '—';
      return this.formatDuration(Number(value) * 1000);
    },
    formatDuration(value) {
      const milliseconds = Number(value);
      if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
      if (milliseconds < 1000) return `${Math.round(milliseconds).toLocaleString()} ms`;

      const seconds = milliseconds / 1000;
      if (seconds < 60) return `${this.formatDurationValue(seconds)} sec`;

      const minutes = seconds / 60;
      if (minutes < 60) return `${this.formatDurationValue(minutes)} min`;

      return `${this.formatDurationValue(minutes / 60)} hr`;
    },
    formatDurationValue(value) {
      return value.toLocaleString(undefined, {
        maximumFractionDigits: value < 10 && !Number.isInteger(value) ? 1 : 0
      });
    },
    formatNumber(value) {
      return Number(value || 0).toLocaleString();
    },
    formatTime(value) {
      return value.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
    },
    jobTypeLabel(type) {
      return JOB_TYPE_LABELS[type] || 'Other background work';
    }
  }
};
</script>
