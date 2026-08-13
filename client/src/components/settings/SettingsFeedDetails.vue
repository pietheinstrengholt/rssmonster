<template>
  <section class="feed-details" aria-labelledby="feed-details-title">
    <button type="button" class="feed-details__back app-button app-button--outline-secondary app-button--compact settings-control settings-control--compact" @click="$emit('back')">
      <BootstrapIcon icon="arrow-left" context="control" aria-hidden="true" />
      Back to feeds
    </button>

    <div v-if="loading" class="feed-details__state" role="status">Loading feed details…</div>
    <div v-else-if="error" class="feed-details__state feed-details__state--error" role="alert">
      <strong>{{ error }}</strong>
      <button type="button" class="feed-details__retry app-button app-button--outline-secondary app-button--compact settings-control settings-control--compact" @click="loadObservability()">Try again</button>
    </div>
    <template v-else-if="observability">
      <header class="feed-details__header">
        <div>
          <h3 id="feed-details-title">{{ feed.feedName }}</h3>
          <p>
            <BootstrapIcon icon="rss" aria-hidden="true" />
            <span>{{ feed.url }}</span>
            <span v-if="feed.feedType" class="feed-details__type">{{ feed.feedType }}</span>
          </p>
        </div>
        <div class="feed-details__actions">
          <button
            v-if="canRetryFeed"
            type="button"
            class="feed-details__retry-action app-button app-button--outline-secondary app-button--compact settings-control settings-control--compact"
            :disabled="retrying"
            @click="retryCurrentFeed"
          >{{ retrying ? 'Retrying…' : 'Retry feed' }}</button>
          <button type="button" class="feed-details__edit app-button app-button--outline-secondary app-button--compact settings-control settings-control--compact" @click="$emit('edit', feed)">
            <BootstrapIcon icon="pencil" aria-hidden="true" />
            Edit feed
          </button>
        </div>
      </header>

      <div
        v-if="retryNotice"
        class="feed-details__retry-notice app-notice"
        :class="retryNotice.tone === 'success'
          ? 'feed-details__retry-notice--success'
          : `app-notice--${retryNotice.tone}`"
        :role="retryNotice.tone === 'danger' ? 'alert' : 'status'"
        aria-live="polite"
      >
        <strong>{{ retryNotice.message }}</strong>
        <span v-if="retryNotice.detail">{{ retryNotice.detail }}</span>
      </div>

      <section class="feed-details__metrics" aria-label="Feed health summary">
        <article class="feed-details__metric" :class="`feed-details__metric--${healthKey.toLowerCase()}`">
          <span>Health</span>
          <strong>{{ healthLabel }}</strong>
        </article>
        <article class="feed-details__metric">
          <span>Success rate (30d)</span>
          <strong>{{ formatPercentage(summary.successRatePct) }}</strong>
        </article>
        <article class="feed-details__metric">
          <span>Average response</span>
          <strong>{{ formatDuration(summary.averageDurationMs) }}</strong>
        </article>
        <article class="feed-details__metric">
          <span>Consecutive failures</span>
          <strong>{{ feed.consecutiveFailures ?? 0 }}</strong>
        </article>
      </section>

      <div v-if="healthKey === 'FAILING'" class="feed-details__health-context" role="status">
        <strong>Failing</strong>
        <span>{{ feed.consecutiveFailures || 0 }} consecutive failures</span>
        <span>Last error: {{ feed.lastCrawlErrorCategory || 'Unknown' }}</span>
        <span>Last successful crawl: {{ formatRelative(feed.lastSuccessfulCrawlAt) }}</span>
      </div>
      <div v-else-if="healthKey === 'RECOVERED'" class="feed-details__health-context feed-details__health-context--recovered">
        The feed is currently operational, but its latest crawl required recovery.
      </div>

      <div class="feed-details__layout">
        <div class="feed-details__primary">
          <section class="feed-details__panel" aria-labelledby="recent-crawls-title">
            <h4 id="recent-crawls-title">Recent Crawl History</h4>
            <div v-if="recentCrawls.length === 0" class="feed-details__empty">
              No crawl history is available yet.
            </div>
            <div v-else class="feed-details__table-wrap">
              <table class="feed-details__table">
                <thead>
                  <tr><th>Time</th><th>Result</th><th>Duration</th><th>Items</th><th>Details</th></tr>
                </thead>
                <tbody>
                  <tr v-for="crawl in recentCrawls" :key="crawl.id" :class="{ 'is-selected': selectedCrawlId === crawl.id }">
                    <td>
                      <button
                        type="button"
                        class="feed-details__crawl-select"
                        :aria-pressed="selectedCrawlId === crawl.id"
                        :aria-label="`Inspect ${crawl.status.toLowerCase()} crawl from ${formatDateTime(crawl.completedAt)}`"
                        @click="selectCrawl(crawl.id)"
                      >{{ formatDateTime(crawl.completedAt) }}</button>
                    </td>
                    <td><span class="feed-details__status" :class="`feed-details__status--${crawl.status.toLowerCase()}`">{{ crawl.status }}</span></td>
                    <td>{{ formatDuration(crawl.durationMs) }}</td>
                    <td>{{ crawl.itemsFetched ?? '—' }}</td>
                    <td>{{ crawlDetailLabel(crawl) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-if="selectedCrawlId" class="feed-details__panel feed-details__selected" aria-labelledby="selected-crawl-title">
            <h4 id="selected-crawl-title">Selected crawl details</h4>
            <div v-if="crawlDetailLoading" class="feed-details__empty" role="status">Loading crawl details…</div>
            <div v-else-if="crawlDetailError" class="feed-details__inline-error" role="alert">
              {{ crawlDetailError }}
            </div>
            <div v-else-if="selectedCrawl" class="feed-details__selected-grid">
              <dl class="feed-details__definition-list">
                <div><dt>Configured URL</dt><dd>{{ selectedCrawl.requestedUrl || '—' }}</dd></div>
                <div><dt>Resolved URL</dt><dd>{{ selectedCrawl.resolvedUrl || '—' }}</dd></div>
                <div><dt>Attempts</dt><dd>{{ selectedCrawl.attemptCount ?? '—' }}</dd></div>
                <div><dt>Error category</dt><dd>{{ selectedCrawl.errorCategory || '—' }}</dd></div>
                <div v-if="selectedCrawl.errorMessage"><dt>Error</dt><dd>{{ formatErrorMessage(selectedCrawl.errorMessage) }}</dd></div>
              </dl>

              <div>
                <h5>Attempt summary</h5>
                <div v-if="attemptSummary.length === 0" class="feed-details__empty feed-details__empty--compact">No attempt diagnostics.</div>
                <table v-else class="feed-details__attempts">
                  <thead><tr><th>#</th><th>Attempt</th><th>Result</th><th>HTTP</th></tr></thead>
                  <tbody>
                    <tr v-for="(attempt, index) in attemptSummary" :key="`${attempt.type}-${index}`">
                      <td>{{ index + 1 }}</td><td>{{ attempt.type || 'ATTEMPT' }}</td><td>{{ attempt.outcome || 'UNKNOWN' }}</td><td>{{ attempt.httpStatus ?? '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <dl class="feed-details__article-counts">
                <div><dt>New</dt><dd>{{ selectedCrawl.articlesNew ?? 0 }}</dd></div>
                <div><dt>Updated</dt><dd>{{ selectedCrawl.articlesUpdated ?? 0 }}</dd></div>
                <div><dt>Unchanged</dt><dd>{{ selectedCrawl.articlesUnchanged ?? 0 }}</dd></div>
                <div><dt>Duplicate</dt><dd>{{ selectedCrawl.articlesDuplicate ?? 0 }}</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <aside class="feed-details__secondary">
          <section class="feed-details__panel">
            <h4>Crawl Health (30 days)</h4>
            <div v-if="crawlHealth.length === 0" class="feed-details__empty">No crawl observations in the last 30 days.</div>
            <div v-else class="feed-details__chart" role="img" :aria-label="crawlHealthDescription">
              <div v-for="day in crawlHealth" :key="day.date" class="feed-details__chart-day" :title="chartDayLabel(day)">
                <span v-if="day.success" class="is-success" :style="chartSegmentStyle(day.success, day)"></span>
                <span v-if="day.recovered" class="is-recovered" :style="chartSegmentStyle(day.recovered, day)"></span>
                <span v-if="day.failed" class="is-failed" :style="chartSegmentStyle(day.failed, day)"></span>
              </div>
            </div>
            <div v-if="crawlHealth.length" class="feed-details__legend" aria-hidden="true">
              <span class="is-success">Success</span><span class="is-recovered">Recovered</span><span class="is-failed">Failed</span>
            </div>
          </section>

          <section class="feed-details__panel">
            <h4>Failure breakdown (30 days)</h4>
            <div v-if="failureTotal === 0" class="feed-details__empty">No crawl failures in the last 30 days.</div>
            <ul v-else class="feed-details__failures">
              <li v-for="entry in failureEntries" :key="entry.category">
                <span>{{ entry.category }}</span>
                <span class="feed-details__failure-track" aria-hidden="true"><span :style="{ width: `${failureWidth(entry.count)}%` }"></span></span>
                <strong>{{ entry.count }}</strong>
              </li>
            </ul>
          </section>

          <section class="feed-details__panel">
            <h4>Feed statistics</h4>
            <dl class="feed-details__stats">
              <div><dt>Articles</dt><dd>{{ statistics.articleCount ?? 0 }}</dd></div>
              <div><dt>Per day</dt><dd>{{ statistics.articlesPerDay ?? 0 }}</dd></div>
              <div><dt>Trust score</dt><dd>{{ formatRatio(statistics.trustScore) }}</dd></div>
              <div><dt>Duplicate rate</dt><dd>{{ formatPercentage(statistics.duplicateRatePct) }}</dd></div>
              <div><dt>Last successful crawl</dt><dd>{{ formatRelative(feed.lastSuccessfulCrawlAt) }}</dd></div>
              <div><dt>Last article</dt><dd>{{ formatRelative(statistics.lastArticleAt) }}</dd></div>
            </dl>
          </section>

          <section class="feed-details__panel">
            <h4>Configuration</h4>
            <dl class="feed-details__definition-list">
              <div><dt>Type</dt><dd>{{ feed.feedType || '—' }}</dd></div>
              <div><dt>Feed URL</dt><dd>{{ feed.url }}</dd></div>
              <div><dt>Last crawl</dt><dd>{{ formatRelative(feed.lastCrawlAt) }}</dd></div>
              <div><dt>Last successful crawl</dt><dd>{{ formatRelative(feed.lastSuccessfulCrawlAt) }}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </template>
  </section>
</template>

<script>
import {
  fetchFeedCrawlResult,
  fetchFeedObservability,
  retryFeed
} from '../../api/feeds.js';
import { formatRelativeDate } from '../../utils/date.js';

const HEALTH_LABELS = Object.freeze({
  HEALTHY: 'Healthy',
  RECOVERED: 'Recovered',
  DEGRADED: 'Degraded',
  FAILING: 'Failing',
  DISABLED: 'Disabled',
  UNKNOWN: 'Unknown'
});

export default {
  name: 'SettingsFeedDetails',
  emits: ['back', 'edit'],
  props: {
    feedId: {
      type: [Number, String],
      required: true
    }
  },
  // Creates independent page and selected-crawl request state.
  data() {
    return {
      observability: null,
      loading: false,
      error: null,
      selectedCrawlId: null,
      selectedCrawl: null,
      crawlDetailLoading: false,
      crawlDetailError: null,
      retrying: false,
      retryNotice: null
    };
  },
  // Loads the screen snapshot without refetching the feeds collection.
  created() {
    this.loadObservability();
  },
  computed: {
    // Returns feed identity and cached health fields.
    feed() { return this.observability?.feed || {}; },
    // Returns rolling crawl summary values.
    summary() { return this.observability?.summary || {}; },
    // Returns feed-level content statistics.
    statistics() { return this.observability?.statistics || {}; },
    // Returns the bounded crawl history rows.
    recentCrawls() { return this.observability?.recentCrawls || []; },
    // Returns daily aggregate chart observations.
    crawlHealth() { return this.observability?.crawlHealth || []; },
    // Preserves only supported backend-owned health labels.
    healthKey() { return HEALTH_LABELS[this.feed.health] ? this.feed.health : 'UNKNOWN'; },
    // Converts the backend health key into visible text.
    healthLabel() { return HEALTH_LABELS[this.healthKey]; },
    // Allows manual retries for every feed not explicitly disabled by the backend.
    canRetryFeed() { return this.feed.status !== 'disabled' && this.healthKey !== 'DISABLED'; },
    // Returns bounded diagnostics from only the selected crawl request.
    attemptSummary() { return Array.isArray(this.selectedCrawl?.attemptSummary) ? this.selectedCrawl.attemptSummary : []; },
    // Sorts failure categories by operational relevance and stable name.
    failureEntries() {
      return Object.entries(this.observability?.failures || {})
        .map(([category, count]) => ({ category, count: Number(count) || 0 }))
        .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
    },
    // Counts all recorded failure and recovery-trigger categories.
    failureTotal() { return this.failureEntries.reduce((sum, entry) => sum + entry.count, 0); },
    // Finds the scale used for compact failure indicators.
    maximumFailureCount() { return Math.max(0, ...this.failureEntries.map(entry => entry.count)); },
    // Provides a non-visual summary for the crawl health chart.
    crawlHealthDescription() {
      const totals = this.crawlHealth.reduce((result, day) => ({
        success: result.success + (Number(day.success) || 0),
        recovered: result.recovered + (Number(day.recovered) || 0),
        failed: result.failed + (Number(day.failed) || 0)
      }), { success: 0, recovered: 0, failed: 0 });
      return `Thirty-day crawl health: ${totals.success} successful, ${totals.recovered} recovered, ${totals.failed} failed.`;
    }
  },
  methods: {
    // Loads the bounded feed observability snapshot.
    async loadObservability(preserveContent = false) {
      if (!preserveContent) {
        this.loading = true;
        this.error = null;
      }
      try {
        const response = await fetchFeedObservability(this.feedId);
        this.observability = response?.data || null;
      } catch (error) {
        console.error('Error loading feed observability:', error);
        if (!preserveContent) {
          this.error = error?.response?.status === 404
            ? 'Feed not found.'
            : 'Could not load feed details. Please try again.';
        }
      } finally {
        if (!preserveContent) this.loading = false;
      }
    },
    // Retries one active feed and refreshes all backend-owned observability state.
    async retryCurrentFeed() {
      if (this.retrying || !this.canRetryFeed) return;

      this.retrying = true;
      this.retryNotice = null;
      try {
        const response = await retryFeed(this.feedId);
        this.retryNotice = this.buildRetryNotice(response?.data);
        await this.loadObservability(true);
      } catch (error) {
        console.error('Error retrying feed:', error);
        const conflictMessage = error?.response?.status === 409
          ? error.response.data?.message
          : null;
        this.retryNotice = {
          tone: 'danger',
          message: 'Unable to retry feed',
          detail: conflictMessage || 'Please try again.'
        };
        await this.loadObservability(true);
      } finally {
        this.retrying = false;
      }
    },
    // Converts a completed retry domain result into a concise inline notice.
    buildRetryNotice(result = {}) {
      const status = result.status;
      const crawlResult = result.crawlResult || {};
      if (status === 'FAILED') {
        return {
          tone: 'danger',
          message: 'Feed is still failing',
          detail: crawlResult.errorCategory || ''
        };
      }

      const details = [];
      if (Number.isFinite(Number(crawlResult.itemsFetched))) {
        details.push(`${Number(crawlResult.itemsFetched)} items fetched`);
      }
      if (Number(crawlResult.articlesNew) > 0) {
        details.push(`${Number(crawlResult.articlesNew)} new`);
      }
      if (Number(crawlResult.articlesUpdated) > 0) {
        details.push(`${Number(crawlResult.articlesUpdated)} updated`);
      }
      return {
        tone: status === 'RECOVERED' ? 'warning' : 'success',
        message: status === 'RECOVERED'
          ? 'Feed recovered successfully'
          : 'Feed retry successful',
        detail: details.join(' · ')
      };
    },
    // Loads expanded diagnostics for only the selected crawl result.
    async selectCrawl(crawlResultId) {
      this.selectedCrawlId = crawlResultId;
      this.selectedCrawl = null;
      this.crawlDetailError = null;
      this.crawlDetailLoading = true;
      try {
        const response = await fetchFeedCrawlResult(this.feedId, crawlResultId);
        if (this.selectedCrawlId === crawlResultId) {
          this.selectedCrawl = response?.data?.crawl || null;
        }
      } catch (error) {
        console.error('Error loading feed crawl details:', error);
        if (this.selectedCrawlId === crawlResultId) {
          this.crawlDetailError = 'Could not load this crawl result.';
        }
      } finally {
        if (this.selectedCrawlId === crawlResultId) this.crawlDetailLoading = false;
      }
    },
    // Formats percentages while preserving absent observations.
    formatPercentage(value) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
      return `${Number(value).toFixed(1).replace(/\.0$/, '')}%`;
    },
    // Formats stored zero-to-one scores as percentages.
    formatRatio(value) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
      return `${Math.round(Number(value) * 100)}%`;
    },
    // Formats millisecond durations compactly.
    formatDuration(value) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
      const durationMs = Math.max(0, Number(value));
      return durationMs < 1000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1000).toFixed(1)} s`;
    },
    // Formats timestamps as compact table dates.
    formatDateTime(value) {
      if (!value || Number.isNaN(new Date(value).getTime())) return '—';
      return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    // Formats relative dates with a neutral never-observed fallback.
    formatRelative(value) { return formatRelativeDate(value) || 'Never'; },
    // Bounds human-readable diagnostics so table-scale details remain usable.
    formatErrorMessage(value) {
      const message = String(value || '');
      return message.length > 240 ? `${message.slice(0, 237)}…` : message;
    },
    // Returns a concise crawl history diagnostic.
    crawlDetailLabel(crawl) {
      if (crawl.errorCategory) return crawl.errorCategory;
      if (crawl.status === 'RECOVERED') return 'Recovered via alternate URL';
      return '—';
    },
    // Scales one failure count relative to the largest category.
    failureWidth(count) { return this.maximumFailureCount > 0 ? Math.max(3, (count / this.maximumFailureCount) * 100) : 0; },
    // Describes one chart day for pointer and assistive context.
    chartDayLabel(day) { return `${day.date}: ${day.success || 0} success, ${day.recovered || 0} recovered, ${day.failed || 0} failed`; },
    // Sizes a daily stacked segment by that day's completed crawl results.
    chartSegmentStyle(value, day) {
      const total = (Number(day.success) || 0) + (Number(day.recovered) || 0) + (Number(day.failed) || 0);
      return { height: `${total > 0 ? (Number(value) / total) * 100 : 0}%` };
    }
  }
};
</script>

<style scoped>
.feed-details { max-width: 1200px; color: var(--text-secondary); }
.feed-details__back, .feed-details__edit, .feed-details__retry, .feed-details__retry-action { padding-inline: 12px; background: var(--surface-card); }
.feed-details__back:focus-visible, .feed-details__edit:focus-visible, .feed-details__retry:focus-visible, .feed-details__retry-action:focus-visible, .feed-details__crawl-select:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
.feed-details__retry-action:disabled { cursor: default; opacity: .6; }
.feed-details__header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 12px 0 18px; }
.feed-details__actions { display: flex; align-items: center; gap: 8px; }
.feed-details__retry-notice { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: -6px 0 16px; padding: 8px 12px; font-size: 12px; }
.feed-details__retry-notice--success { border-color: var(--settings-success-border); background: var(--settings-success-bg); color: var(--settings-success-text); }
.feed-details__header h3 { margin: 0; color: var(--text-primary); font-size: 24px; }
.feed-details__header p { display: flex; align-items: center; gap: 7px; margin: 5px 0 0; color: var(--text-muted); font-size: 13px; }
.feed-details__header p svg { color: var(--settings-orange-text); }
.feed-details__type { padding: 2px 7px; border-radius: var(--radius-pill); background: var(--settings-success-bg); color: var(--settings-success-text); font-size: 11px; font-weight: 700; text-transform: lowercase; }
.feed-details__metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.feed-details__metric, .feed-details__panel { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-panel); }
.feed-details__metric { min-height: 78px; padding: 15px 17px; border-top: 3px solid var(--border-default); }
.feed-details__metric span { display: block; color: var(--text-muted); font-size: 12px; font-weight: 600; }
.feed-details__metric strong { display: block; margin-top: 5px; color: var(--text-primary); font-size: 20px; }
.feed-details__metric--healthy { border-top-color: var(--settings-success-text); }
.feed-details__metric--healthy strong { color: var(--settings-success-text); }
.feed-details__metric--recovered { border-top-color: var(--article-warning-text); }
.feed-details__metric--recovered strong { color: var(--article-warning-text); }
.feed-details__metric--degraded { border-top-color: var(--settings-orange-text); }
.feed-details__metric--degraded strong { color: var(--settings-orange-text); }
.feed-details__metric--failing { border-top-color: var(--settings-danger-text); }
.feed-details__metric--failing strong { color: var(--settings-danger-text); }
.feed-details__metric--disabled { border-top-color: var(--settings-neutral-text); }
.feed-details__metric--disabled strong { color: var(--settings-neutral-text); }
.feed-details__metric--unknown { border-top-color: var(--border-strong); }
.feed-details__metric--unknown strong { color: var(--text-secondary); }
.feed-details__health-context { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 16px; padding: 10px 12px; border-left: 3px solid var(--settings-danger-text); background: var(--settings-danger-bg); color: var(--text-secondary); font-size: 13px; }
.feed-details__health-context--recovered { border-left-color: var(--article-warning-text); background: var(--settings-orange-bg); }
.feed-details__layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; align-items: start; }
.feed-details__primary, .feed-details__secondary { display: grid; gap: 14px; }
.feed-details__panel { overflow: hidden; padding: 14px; }
.feed-details__panel h4 { margin: 0 0 12px; color: var(--text-primary); font-size: 14px; }
.feed-details__panel h5 { margin: 0 0 8px; color: var(--text-primary); font-size: 12px; }
.feed-details__table-wrap { overflow-x: auto; }
.feed-details__table, .feed-details__attempts { width: 100%; border-collapse: collapse; font-size: 12px; }
.feed-details__table th, .feed-details__table td, .feed-details__attempts th, .feed-details__attempts td { padding: 9px 10px; border-top: 1px solid var(--border-subtle); text-align: left; white-space: nowrap; }
.feed-details__table th, .feed-details__attempts th { background: var(--surface-page); color: var(--text-muted); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
.feed-details__table tr.is-selected td { background: var(--settings-orange-bg); }
.feed-details__crawl-select { padding: 0; border: 0; background: var(--color-transparent); color: var(--text-secondary); font: inherit; cursor: pointer; text-align: left; }
.feed-details__status { display: inline-flex; padding: 3px 6px; border-radius: var(--radius-pill); font-size: 10px; font-weight: 700; }
.feed-details__status--success { background: var(--settings-success-bg); color: var(--settings-success-text); }
.feed-details__status--recovered { background: var(--settings-orange-bg); color: var(--text-primary); }
.feed-details__status--failed { background: var(--settings-danger-bg); color: var(--settings-danger-text); }
.feed-details__selected-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 1.3fr) minmax(120px, .65fr); gap: 14px; }
.feed-details__definition-list, .feed-details__article-counts, .feed-details__stats { margin: 0; }
.feed-details__definition-list div, .feed-details__article-counts div, .feed-details__stats div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border-subtle); }
.feed-details__definition-list div:first-child, .feed-details__article-counts div:first-child, .feed-details__stats div:first-child { border-top: 0; }
.feed-details__definition-list dt, .feed-details__article-counts dt, .feed-details__stats dt { color: var(--text-muted); font-size: 11px; }
.feed-details__definition-list dd, .feed-details__article-counts dd, .feed-details__stats dd { margin: 0; color: var(--text-primary); font-size: 12px; overflow-wrap: anywhere; text-align: right; }
.feed-details__chart { display: flex; height: 100px; align-items: flex-end; gap: 3px; padding-top: 8px; border-bottom: 1px solid var(--border-subtle); }
.feed-details__chart-day { display: flex; width: 100%; min-width: 4px; height: 100%; flex-direction: column-reverse; justify-content: flex-start; }
.feed-details__chart-day span { display: block; min-height: 2px; }
.feed-details__chart .is-success, .feed-details__legend .is-success::before { background: var(--settings-success-text); }
.feed-details__chart .is-recovered, .feed-details__legend .is-recovered::before { background: var(--article-warning-text); }
.feed-details__chart .is-failed, .feed-details__legend .is-failed::before { background: var(--settings-danger-text); }
.feed-details__legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 9px; color: var(--text-muted); font-size: 10px; }
.feed-details__legend span { display: inline-flex; align-items: center; gap: 5px; }
.feed-details__legend span::before { width: 7px; height: 7px; content: ''; border-radius: var(--radius-pill); }
.feed-details__failures { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.feed-details__failures li { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(70px, 1.4fr) 24px; align-items: center; gap: 8px; font-size: 10px; }
.feed-details__failure-track { height: 4px; overflow: hidden; background: var(--bg-meter-track); border-radius: var(--radius-pill); }
.feed-details__failure-track span { display: block; height: 100%; background: var(--settings-danger-text); border-radius: inherit; }
.feed-details__failures strong { color: var(--text-primary); text-align: right; }
.feed-details__state, .feed-details__empty, .feed-details__inline-error { padding: 28px 12px; color: var(--text-muted); text-align: center; }
.feed-details__state--error, .feed-details__inline-error { color: var(--settings-danger-text); }
.feed-details__state--error strong { display: block; margin-bottom: 12px; }
.feed-details__empty--compact { padding: 12px; }
@media (max-width: 980px) { .feed-details__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .feed-details__layout { grid-template-columns: 1fr; } }
@media (max-width: 680px) { .feed-details__header { align-items: flex-start; flex-direction: column; } .feed-details__metrics { grid-template-columns: 1fr; } .feed-details__selected-grid { grid-template-columns: 1fr; } }
:global(:root[data-theme='dark']) .feed-details__metric,
:global(:root[data-theme='dark']) .feed-details__panel,
:global(:root[data-theme='dark']) .feed-details__retry { background: var(--bg-modal); }
:global(:root[data-theme='dark']) .feed-details__back,
:global(:root[data-theme='dark']) .feed-details__edit,
:global(:root[data-theme='dark']) .feed-details__retry-action { background: var(--surface-control); color: var(--text-primary); }
:global(:root[data-theme='dark']) .feed-details__metric span { color: var(--text-primary); }
</style>
