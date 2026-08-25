<template>
  <div class="observability-settings settings-page">
    <SettingsPageIntro
      eyebrow="Settings — Observability"
      icon="activity"
      title="Processing failures"
      title-id="processing-failures-title"
    >
      Inspect abnormal crawl, article, embedding, event, topic, and island processing outcomes.
      Similar failures are grouped so recurring problems remain easy to spot.
    </SettingsPageIntro>

    <template v-if="view === 'groups'">
      <div class="observability-toolbar settings-toolbar">
        <label>
          <span>Date range</span>
          <select
            v-model.number="filters.days"
            class="app-form-select app-form-control--compact"
            :disabled="loading"
            @change="reloadGroups"
          >
            <option :value="7">Last 7 days</option>
            <option :value="30">Last 30 days</option>
            <option :value="90">Last 90 days</option>
            <option :value="365">Last 365 days</option>
          </select>
        </label>
        <label>
          <span>Stage</span>
          <select
            v-model="filters.stage"
            class="app-form-select app-form-control--compact"
            :disabled="loading"
            @change="reloadGroups"
          >
            <option value="">All stages</option>
            <option v-for="stage in availableStages" :key="stage" :value="stage">
              {{ formatLabel(stage) }}
            </option>
          </select>
        </label>
        <label>
          <span>Failure type</span>
          <select
            v-model="filters.failureType"
            class="app-form-select app-form-control--compact"
            :disabled="loading"
            @change="reloadGroups"
          >
            <option value="">All failure types</option>
            <option v-for="failureType in availableFailureTypes" :key="failureType" :value="failureType">
              {{ formatLabel(failureType) }}
            </option>
          </select>
        </label>
      </div>

      <div v-if="hasLoaded" class="observability-metric-grid">
        <SettingsMetric label="Occurrences" :value="formatNumber(summary.totalOccurrences)" />
        <SettingsMetric label="Similar groups" :value="formatNumber(summary.groupCount)" />
        <SettingsMetric label="Fatal" :value="formatNumber(summary.fatalOccurrences)" />
        <SettingsMetric label="Timeouts" :value="formatNumber(summary.timeoutOccurrences)" />
      </div>

      <div v-if="loading && !hasLoaded" class="settings-state">
        <span class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
        <span>Loading processing failures...</span>
      </div>
      <div v-else-if="error && !hasLoaded" class="app-notice app-notice--danger" role="alert">
        {{ error }}
      </div>
      <div v-else-if="hasLoaded && groups.length === 0" class="app-notice app-notice--info" role="status">
        No processing failures were recorded for these filters.
      </div>

      <section v-else-if="groups.length" class="settings-data-panel" aria-labelledby="failure-groups-title">
        <div class="observability-section-heading">
          <div>
            <h4 id="failure-groups-title">Failure groups</h4>
            <p>Select a group to inspect each recorded occurrence.</p>
          </div>
          <span>{{ formatNumber(pagination.total) }} groups</span>
        </div>

        <ul class="observability-list">
          <li v-for="group in groups" :key="group.fingerprint">
            <button class="observability-row observability-group-row" type="button" @click="openGroup(group)">
              <span class="observability-row-main">
                <span class="observability-badges">
                  <span class="observability-badge" :class="severityClass(group.severity)">
                    {{ formatLabel(group.severity) }}
                  </span>
                  <span class="observability-badge observability-badge--neutral">
                    {{ formatLabel(group.failureType) }}
                  </span>
                </span>
                <strong>{{ group.message }}</strong>
                <small>
                  {{ formatLabel(group.stage) }}<template v-if="group.code"> · {{ group.code }}</template>
                </small>
              </span>
              <span class="observability-row-meta">
                <strong>{{ formatNumber(group.occurrenceCount) }}</strong>
                <small>occurrences</small>
                <time :datetime="group.lastOccurredAt">{{ formatDateTime(group.lastOccurredAt) }}</time>
              </span>
              <BootstrapIcon icon="chevron-right" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <div v-if="error && hasLoaded" class="app-notice app-notice--danger" role="alert">
        {{ error }}
      </div>
      <div v-if="clearSuccess" class="app-notice observability-clear-success" role="status">
        {{ clearSuccess }}
      </div>

      <section
        v-if="showClearConfirmation"
        class="settings-data-panel observability-clear-confirmation"
        aria-labelledby="clear-processing-failures-title"
      >
        <span class="observability-clear-icon" aria-hidden="true">
          <BootstrapIcon icon="exclamation-triangle-fill" />
        </span>
        <div class="observability-clear-content">
          <h4 id="clear-processing-failures-title">Clear all processing failures?</h4>
          <p>
            This permanently removes every captured processing failure for your account, including
            messages, stack traces, and diagnostic context. This action cannot be undone.
          </p>
          <div v-if="clearError" class="app-notice app-notice--danger" role="alert">
            {{ clearError }}
          </div>
          <div class="observability-clear-actions">
            <button type="button" class="app-button app-button--secondary" :disabled="clearing" @click="cancelClear">
              Cancel
            </button>
            <button type="button" class="app-button app-button--danger" :disabled="clearing" :aria-busy="clearing ? 'true' : 'false'" @click="confirmClear">
              <span v-if="clearing" class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
              {{ clearing ? 'Clearing...' : 'Clear all records' }}
            </button>
          </div>
        </div>
      </section>

      <div class="settings-refresh-actions">
        <button
          type="button"
          class="app-button app-button--outline-danger observability-clear-button"
          :disabled="loading || clearing"
          @click="requestClear"
        >
          <BootstrapIcon icon="trash-fill" aria-hidden="true" />
          Clear records
        </button>
        <button
          v-if="groups.length < pagination.total"
          type="button"
          class="app-button app-button--outline-secondary"
          :disabled="loading"
          @click="loadMoreGroups"
        >
          Load more
        </button>
        <button type="button" class="settings-refresh-button app-button app-button--primary" :disabled="loading" @click="reloadGroups">
          <BootstrapIcon icon="arrow-clockwise" aria-hidden="true" />
          Refresh
        </button>
      </div>
    </template>

    <template v-else-if="view === 'occurrences'">
      <button type="button" class="observability-back app-button app-button--outline-secondary" @click="showGroups">
        <BootstrapIcon icon="arrow-left" aria-hidden="true" />
        All failure groups
      </button>

      <section class="settings-data-panel" aria-labelledby="failure-occurrences-title">
        <div class="observability-section-heading">
          <div>
            <p class="settings-page-eyebrow">{{ formatLabel(selectedGroup.stage) }} · {{ formatLabel(selectedGroup.failureType) }}</p>
            <h4 id="failure-occurrences-title">{{ selectedGroup.message }}</h4>
            <p>Select an occurrence to view its complete captured diagnostics.</p>
          </div>
          <span>{{ formatNumber(occurrencePagination.total) }} occurrences</span>
        </div>

        <div v-if="occurrencesLoading && !occurrences.length" class="settings-state">
          <span class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
          <span>Loading occurrences...</span>
        </div>
        <div v-else-if="occurrencesError && !occurrences.length" class="app-notice app-notice--danger" role="alert">
          {{ occurrencesError }}
        </div>
        <div v-else-if="!occurrences.length" class="app-notice app-notice--info" role="status">
          No occurrences were found for this group in the selected period.
        </div>
        <ul v-else class="observability-list observability-occurrence-list">
          <li v-for="failure in occurrences" :key="failure.id">
            <button class="observability-row observability-occurrence-row" type="button" @click="openFailure(failure.id)">
              <span class="observability-row-main">
                <span class="observability-badges">
                  <span class="observability-badge" :class="severityClass(failure.severity)">
                    {{ formatLabel(failure.severity) }}
                  </span>
                  <span v-if="failure.retryable" class="observability-badge observability-badge--warning">Retryable</span>
                </span>
                <strong>{{ failure.message }}</strong>
                <small>{{ subjectDescription(failure) }}</small>
              </span>
              <span class="observability-row-meta">
                <time :datetime="failure.occurredAt">{{ formatDateTime(failure.occurredAt) }}</time>
                <small v-if="failure.crawlRunId">Crawl run #{{ failure.crawlRunId }}</small>
                <small>Failure #{{ failure.id }}</small>
              </span>
              <BootstrapIcon icon="chevron-right" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <div v-if="occurrencesError && occurrences.length" class="app-notice app-notice--danger" role="alert">
        {{ occurrencesError }}
      </div>
      <div v-if="occurrencesError || occurrences.length < occurrencePagination.total" class="settings-refresh-actions">
        <button v-if="occurrencesError" type="button" class="app-button app-button--outline-secondary" :disabled="occurrencesLoading" @click="loadOccurrences(false)">
          Try again
        </button>
        <button v-if="occurrences.length < occurrencePagination.total" type="button" class="app-button app-button--outline-secondary" :disabled="occurrencesLoading" @click="loadMoreOccurrences">
          Load more occurrences
        </button>
      </div>
    </template>

    <template v-else>
      <button type="button" class="observability-back app-button app-button--outline-secondary" @click="showOccurrences">
        <BootstrapIcon icon="arrow-left" aria-hidden="true" />
        Group occurrences
      </button>

      <div v-if="detailLoading" class="settings-state">
        <span class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
        <span>Loading failure details...</span>
      </div>
      <div v-else-if="detailError" class="app-notice app-notice--danger" role="alert">
        {{ detailError }}
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="openFailure(selectedFailureId)">
          Try again
        </button>
      </div>
      <template v-else-if="selectedFailure">
        <section class="settings-data-panel observability-detail" aria-labelledby="failure-detail-title">
          <div class="observability-section-heading">
            <div>
              <p class="settings-page-eyebrow">Failure #{{ selectedFailure.id }}</p>
              <h4 id="failure-detail-title">{{ selectedFailure.message }}</h4>
              <p>{{ formatDateTime(selectedFailure.occurredAt) }}</p>
            </div>
            <span class="observability-badge" :class="severityClass(selectedFailure.severity)">
              {{ formatLabel(selectedFailure.severity) }}
            </span>
          </div>

          <dl class="observability-detail-grid">
            <div><dt>Stage</dt><dd>{{ formatLabel(selectedFailure.stage) }}</dd></div>
            <div><dt>Failure type</dt><dd>{{ formatLabel(selectedFailure.failureType) }}</dd></div>
            <div><dt>Error</dt><dd>{{ selectedFailure.errorName || '—' }}</dd></div>
            <div><dt>Code</dt><dd>{{ selectedFailure.code || '—' }}</dd></div>
            <div><dt>Crawl run</dt><dd>{{ idValue(selectedFailure.crawlRunId) }}</dd></div>
            <div><dt>Execution</dt><dd class="observability-monospace">{{ selectedFailure.executionId }}</dd></div>
            <div><dt>Feed</dt><dd>{{ idValue(selectedFailure.feedId) }}</dd></div>
            <div><dt>Article</dt><dd>{{ idValue(selectedFailure.articleId) }}</dd></div>
            <div><dt>Subject</dt><dd>{{ subjectDescription(selectedFailure) }}</dd></div>
            <div><dt>Attempt</dt><dd>{{ selectedFailure.attemptNumber ?? '—' }}</dd></div>
            <div><dt>Retryable</dt><dd>{{ selectedFailure.retryable ? 'Yes' : 'No' }}</dd></div>
            <div><dt>Fingerprint</dt><dd class="observability-monospace">{{ selectedFailure.fingerprint }}</dd></div>
          </dl>
        </section>

        <section v-if="selectedFailure.stackTrace" class="settings-data-panel observability-diagnostic" aria-labelledby="failure-stack-title">
          <h4 id="failure-stack-title">Stack trace</h4>
          <pre>{{ selectedFailure.stackTrace }}</pre>
        </section>
        <section v-if="selectedFailure.context" class="settings-data-panel observability-diagnostic" aria-labelledby="failure-context-title">
          <h4 id="failure-context-title">Captured context</h4>
          <pre>{{ formattedContext }}</pre>
        </section>
      </template>
    </template>
  </div>
</template>

<script>
import {
  clearProcessingFailures,
  fetchProcessingFailureDetail,
  fetchProcessingFailureGroups,
  fetchProcessingFailureOccurrences
} from '../../api/settings';
import SettingsMetric from './SettingsMetric.vue';
import SettingsPageIntro from './SettingsPageIntro.vue';

const PAGE_SIZE = 50;

export default {
  name: 'SettingsObservability',
  components: { SettingsMetric, SettingsPageIntro },
  data() {
    return {
      availableFailureTypes: [],
      availableStages: [],
      clearError: null,
      clearing: false,
      clearSuccess: null,
      detailError: null,
      detailLoading: false,
      error: null,
      filters: { days: 30, failureType: '', stage: '' },
      groups: [],
      hasLoaded: false,
      loading: false,
      occurrencePagination: { total: 0 },
      occurrences: [],
      occurrencesError: null,
      occurrencesLoading: false,
      pagination: { total: 0 },
      selectedFailure: null,
      selectedFailureId: null,
      selectedGroup: null,
      showClearConfirmation: false,
      summary: {},
      view: 'groups'
    };
  },
  computed: {
    formattedContext() {
      if (typeof this.selectedFailure?.context === 'string') return this.selectedFailure.context;
      return JSON.stringify(this.selectedFailure?.context, null, 2);
    }
  },
  created() {
    this.reloadGroups();
  },
  methods: {
    formatDateTime(value) {
      if (!value) return 'Unknown time';
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    },
    formatLabel(value) {
      if (!value) return 'Unknown';
      return String(value).replaceAll('_', ' ').toLowerCase()
        .replace(/\b\w/g, character => character.toUpperCase());
    },
    formatNumber(value) {
      return new Intl.NumberFormat().format(Number(value) || 0);
    },
    idValue(value) {
      return value ? `#${value}` : '—';
    },
    severityClass(severity) {
      if (severity === 'FATAL' || severity === 'ERROR') return 'observability-badge--danger';
      if (severity === 'WARNING') return 'observability-badge--warning';
      return 'observability-badge--neutral';
    },
    subjectDescription(failure) {
      if (!failure?.subjectType && !failure?.subjectId) return 'No processing subject captured';
      if (!failure.subjectId) return this.formatLabel(failure.subjectType);
      return `${this.formatLabel(failure.subjectType)} #${failure.subjectId}`;
    },
    async loadGroups(append = false) {
      this.loading = true;
      this.error = null;
      const offset = append ? this.groups.length : 0;

      try {
        const response = await fetchProcessingFailureGroups({
          days: this.filters.days,
          failureType: this.filters.failureType || undefined,
          limit: PAGE_SIZE,
          offset,
          stage: this.filters.stage || undefined
        });
        const data = response.data || {};
        this.groups = append ? [...this.groups, ...(data.groups || [])] : (data.groups || []);
        this.summary = data.summary || {};
        this.pagination = data.pagination || { total: this.groups.length };
        this.availableStages = data.availableStages || [];
        this.availableFailureTypes = data.availableFailureTypes || [];
        this.hasLoaded = true;
      } catch (error) {
        console.error('Error loading processing failures:', error);
        this.error = 'Unable to load processing failures. Please try again.';
      } finally {
        this.loading = false;
      }
    },
    reloadGroups() {
      this.clearSuccess = null;
      this.view = 'groups';
      this.selectedGroup = null;
      this.selectedFailure = null;
      this.selectedFailureId = null;
      return this.loadGroups(false);
    },
    loadMoreGroups() {
      return this.loadGroups(true);
    },
    requestClear() {
      this.clearError = null;
      this.clearSuccess = null;
      this.showClearConfirmation = true;
    },
    cancelClear() {
      if (this.clearing) return;
      this.clearError = null;
      this.showClearConfirmation = false;
    },
    async confirmClear() {
      if (this.clearing) return;

      this.clearing = true;
      this.clearError = null;
      try {
        const response = await clearProcessingFailures();
        const deletedCount = Number(response.data?.deletedCount) || 0;
        this.showClearConfirmation = false;
        await this.reloadGroups();
        this.clearSuccess = deletedCount === 1
          ? 'Cleared 1 processing failure.'
          : `Cleared ${this.formatNumber(deletedCount)} processing failures.`;
      } catch (error) {
        console.error('Error clearing processing failures:', error);
        this.clearError = 'Unable to clear processing failures. Please try again.';
      } finally {
        this.clearing = false;
      }
    },
    async openGroup(group) {
      this.selectedGroup = group;
      this.selectedFailure = null;
      this.selectedFailureId = null;
      this.occurrences = [];
      this.occurrencePagination = { total: group.occurrenceCount || 0 };
      this.view = 'occurrences';
      await this.loadOccurrences(false);
    },
    async loadOccurrences(append = false) {
      this.occurrencesLoading = true;
      this.occurrencesError = null;
      const offset = append ? this.occurrences.length : 0;

      try {
        const response = await fetchProcessingFailureOccurrences(this.selectedGroup.fingerprint, {
          days: this.filters.days,
          limit: PAGE_SIZE,
          offset
        });
        const failures = response.data?.failures || [];
        this.occurrences = append ? [...this.occurrences, ...failures] : failures;
        this.occurrencePagination = response.data?.pagination || { total: this.occurrences.length };
      } catch (error) {
        console.error('Error loading processing failure occurrences:', error);
        this.occurrencesError = 'Unable to load the failure occurrences. Please try again.';
      } finally {
        this.occurrencesLoading = false;
      }
    },
    loadMoreOccurrences() {
      return this.loadOccurrences(true);
    },
    async openFailure(failureId) {
      this.view = 'detail';
      this.selectedFailureId = failureId;
      this.detailLoading = true;
      this.detailError = null;
      this.selectedFailure = null;

      try {
        const response = await fetchProcessingFailureDetail(failureId);
        this.selectedFailure = response.data?.failure || null;
      } catch (error) {
        console.error('Error loading processing failure detail:', error);
        this.detailError = 'Unable to load this processing failure. Please try again.';
      } finally {
        this.detailLoading = false;
      }
    },
    showGroups() {
      this.view = 'groups';
      this.selectedGroup = null;
      this.occurrences = [];
      this.selectedFailure = null;
      this.selectedFailureId = null;
    },
    showOccurrences() {
      this.view = 'occurrences';
      this.selectedFailure = null;
      this.selectedFailureId = null;
    }
  }
};
</script>

<style scoped>
.observability-toolbar {
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 18px;
}

.observability-toolbar label {
  display: grid;
  gap: 6px;
  min-width: 150px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.observability-toolbar .app-form-select {
  color: var(--text-primary);
  background-color: var(--surface-card);
  border-color: var(--border-subtle);
}

.observability-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.settings-data-panel {
  margin-bottom: 18px;
  padding: 20px;
}

.observability-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.observability-section-heading h4,
.observability-diagnostic h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.observability-section-heading p:not(.settings-page-eyebrow) {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.observability-section-heading > span {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.observability-list {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--border-subtle);
  list-style: none;
}

.observability-list li {
  border-bottom: 1px solid var(--border-subtle);
}

.observability-list li:last-child {
  border-bottom: 0;
}

.observability-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 14px 4px;
  color: inherit;
  background: inherit;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.observability-row:hover {
  background: var(--surface-hover);
}

.observability-row:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.observability-row-main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.observability-row-main strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.observability-row-main small,
.observability-row-meta small,
.observability-row-meta time {
  color: var(--text-muted);
  font-size: 12px;
}

.observability-row-meta {
  display: grid;
  gap: 3px;
  min-width: 124px;
  text-align: right;
}

.observability-row-meta strong {
  color: var(--text-primary);
  font-size: 16px;
}

.observability-row > svg {
  color: var(--text-tertiary);
}

.observability-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.observability-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 3px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.observability-badge--danger {
  color: var(--settings-danger-text);
  background: var(--settings-danger-bg);
  border-color: var(--settings-danger-border);
}

.observability-badge--warning {
  color: var(--color-warning);
  background: var(--surface-warning);
  border-color: var(--border-warning);
}

.observability-badge--neutral {
  color: var(--text-secondary);
  background: var(--surface-chrome);
  border-color: var(--border-subtle);
}

.observability-back {
  margin-bottom: 18px;
}

.settings-refresh-actions {
  align-items: center;
  gap: 10px;
}

.observability-clear-button {
  margin-right: auto;
}

.observability-clear-confirmation {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  border-color: var(--settings-danger-border);
}

.observability-clear-success {
  color: var(--settings-success-text);
  background: var(--settings-success-bg);
  border-color: var(--border-success);
}

.observability-clear-icon {
  display: inline-flex;
  width: var(--control-height-default);
  height: var(--control-height-default);
  flex: 0 0 var(--control-height-default);
  align-items: center;
  justify-content: center;
  color: var(--settings-danger-text);
  background: var(--settings-danger-bg);
  border-radius: var(--radius-control);
}

.observability-clear-content {
  min-width: 0;
}

.observability-clear-content h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.observability-clear-content > p {
  margin: 6px 0 14px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.observability-clear-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.observability-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
  margin: 0;
  border-top: 1px solid var(--border-subtle);
}

.observability-detail-grid div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.observability-detail-grid dt {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.observability-detail-grid dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 13px;
}

.observability-monospace,
.observability-diagnostic pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.observability-diagnostic h4 {
  margin-bottom: 14px;
}

.observability-diagnostic pre {
  max-height: 360px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  color: var(--text-primary);
  background: var(--surface-chrome);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

:global(:root[data-theme='dark'] .observability-toolbar .app-form-select) {
  background-color: var(--bg-modal);
  border-color: var(--border-control);
}

@media (max-width: 879px) {
  .observability-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .observability-toolbar label,
  .observability-toolbar .app-form-select {
    width: 100%;
  }

  .observability-metric-grid,
  .observability-detail-grid {
    grid-template-columns: 1fr;
  }

  .settings-data-panel {
    padding: 16px;
  }

  .observability-row {
    grid-template-columns: minmax(0, 1fr) 16px;
    gap: 12px;
  }

  .observability-row-meta {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    text-align: left;
  }

  .observability-row > svg {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .observability-row-main strong {
    white-space: normal;
  }

  .settings-refresh-actions {
    flex-wrap: wrap;
  }

  .observability-clear-button {
    width: 100%;
    margin-right: 0;
  }
}

@media (max-width: 520px) {
  .observability-section-heading {
    flex-direction: column;
  }

  .observability-detail-grid div {
    grid-template-columns: 88px minmax(0, 1fr);
  }

  .observability-clear-confirmation {
    flex-direction: column;
  }

  .observability-clear-actions {
    flex-direction: column-reverse;
  }

  .observability-clear-actions .app-button {
    width: 100%;
  }
}
</style>
