<template>
  <SettingsFeedDetails
    v-if="selectedFeedId !== null"
    :feed-id="selectedFeedId"
    @back="closeFeedDetails"
    @edit="openFeedEdit"
  />
  <div v-else class="feeds-overview">
    <section class="settings-insight-card feeds-header" aria-labelledby="feeds-overview-title">
      <span class="settings-insight-icon" aria-hidden="true">
        <BootstrapIcon icon="rss-fill" />
      </span>
      <div>
        <p class="settings-page-eyebrow">Settings — Manage Feeds</p>
        <h3 id="feeds-overview-title">Feeds Overview</h3>
        <p>Manage your RSS subscriptions and monitor key metrics.</p>
        <!-- Info text -->
        <span class="feeds-helper-text">
          Trust Score reflects feed quality and originality, while Duplication Rate tracks repeated content. Import or export OPML to move subscriptions between readers.
        </span>
      </div>
    </section>

    <div v-if="feedsLoading" class="feeds-state">Loading feeds…</div>
    <div v-else-if="feedsError" class="feeds-state feeds-state--error">{{ feedsError }}</div>
    <template v-else>
      <section class="feeds-stat-grid" aria-label="Feed metrics">
        <article v-for="stat in feedStats" :key="stat.label" class="feeds-stat-card">
          <span class="feeds-stat-icon" :class="`feeds-stat-icon--${stat.tone}`">
            <BootstrapIcon :icon="stat.icon" />
          </span>
          <div>
            <span class="feeds-stat-label">{{ stat.label }}</span>
            <strong class="feeds-stat-value">{{ stat.value }}</strong>
          </div>
        </article>
      </section>

      <div class="feeds-toolbar">
        <div class="feeds-toolbar-actions">
          <input type="file" ref="opmlFileInput" accept=".opml,.xml" class="feeds-file-input" @change="handleFileSelect" />
          <button type="button" class="feeds-toolbar-button" @click="$refs.opmlFileInput.click()">
            <BootstrapIcon class="feeds-toolbar-action-icon" icon="upload" aria-hidden="true" />
            Import OPML
          </button>
          <button type="button" class="feeds-toolbar-button" :disabled="feeds.length === 0" @click="downloadOpml">
            <BootstrapIcon class="feeds-toolbar-action-icon" icon="download" aria-hidden="true" />
            Export OPML
          </button>
          <button
            type="button"
            class="feeds-toolbar-button"
            :disabled="feedTrustLoading || feeds.length === 0"
            @click="handleRecalculateFeedTrust"
          >
            <BootstrapIcon class="feeds-toolbar-action-icon" icon="arrow-repeat" aria-hidden="true" />
            {{ feedTrustLoading ? 'Recalculating…' : 'Recalculate Scores' }}
          </button>
        </div>

        <div class="feeds-toolbar-filters">
          <select v-model="healthFilter" class="feeds-status-filter" aria-label="Filter feeds by health">
            <option value="all">All Health</option>
            <option value="HEALTHY">Healthy</option>
            <option value="RECOVERED">Recovered</option>
            <option value="DEGRADED">Degraded</option>
            <option value="FAILING">Failing</option>
            <option value="DISABLED">Disabled</option>
          </select>
          <div class="feeds-search">
            <BootstrapIcon icon="search" aria-hidden="true" />
            <input v-model="searchQuery" type="search" placeholder="Search feeds" aria-label="Search feeds by name or URL" />
          </div>
        </div>
      </div>

      <div v-if="opmlMessage" class="feeds-message feeds-message--success" role="status">
        {{ opmlMessage }}
      </div>
      <div v-if="opmlError" class="feeds-message feeds-message--error" role="alert">
        {{ opmlError }}
      </div>
      <div v-if="feedTrustMessage" class="feeds-message feeds-message--success" role="status">
        {{ feedTrustMessage }}
      </div>
      <div v-if="feedTrustError" class="feeds-message feeds-message--error" role="alert">
        {{ feedTrustError }}
      </div>

      <div v-if="feeds.length === 0" class="feeds-empty-state">No feeds found.</div>
      <template v-else>
        <div v-if="filteredFeeds.length === 0" class="feeds-empty-state">No feeds match your filters.</div>
        <div v-else class="feeds-table-card">
          <div class="feeds-table-wrapper">
            <table class="feeds-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Health</th>
                  <th>Articles</th>
                  <th>Per Day</th>
                  <th>Reliability</th>
                  <th>Trust</th>
                  <th>Last Crawl</th>
                  <th><span class="app-visually-hidden">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="feed in filteredFeeds"
                  :key="feed.id"
                  :class="feedRowClass(feed)"
                  @click="openFeedDetails(feed)"
                >
                  <td class="feeds-name-cell">
                    <button
                      type="button"
                      class="feeds-details-button"
                      :aria-label="`Inspect crawl health for ${feed.feedName}`"
                      @click.stop="openFeedDetails(feed)"
                    >
                      <strong>{{ feed.feedName }}</strong>
                      <span v-if="feed.url">{{ feed.url }}</span>
                    </button>
                  </td>
                  <td>
                    <span class="feeds-status-pill" :class="`feeds-status-pill--${feedHealthKey(feed).toLowerCase()}`">
                      {{ feedHealthLabel(feed) }}
                    </span>
                  </td>
                  <td>{{ feed.articleCount || 0 }}</td>
                  <td>{{ feed.articlesPerDay || 0 }}</td>
                  <td>
                    <span>{{ formatReliability(feed.reliabilityPct) }}</span>
                    <span v-if="reliabilityProgress(feed.reliabilityPct) !== null" class="feeds-reliability-bar" aria-hidden="true">
                      <span
                        :class="`feeds-reliability-bar--${reliabilityTone(feed.reliabilityPct)}`"
                        :style="{ width: `${reliabilityProgress(feed.reliabilityPct)}%` }"
                      ></span>
                    </span>
                  </td>
                  <td>
                    <span>{{ formatScore(feed.feedTrust) }}</span>
                    <span v-if="trustProgress(feed.feedTrust) !== null" class="feeds-trust-bar" aria-hidden="true">
                      <span :style="{ width: `${trustProgress(feed.feedTrust)}%` }"></span>
                    </span>
                  </td>
                  <td>{{ formatLastCrawl(feed.lastCrawlAt) }}</td>
                  <td>
                    <button class="feeds-edit-button" type="button" @click.stop="openFeedEdit(feed)">
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="feeds-footer">Showing {{ filteredFeeds.length }} of {{ feeds.length }} feeds</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.feeds-overview {
  max-width: 1100px;
  color: var(--text-secondary);
}

.feeds-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}

.feeds-header p:not(.settings-page-eyebrow) {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
}

.feeds-helper-text {
  display: block;
  max-width: 760px;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.feeds-state,
.feeds-empty-state {
  padding: 36px 0;
  color: var(--text-muted);
  text-align: center;
}

.feeds-state--error {
  color: var(--settings-danger-text);
}

.feeds-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin: 22px 0 24px;
}

.feeds-stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 86px;
  padding: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 14px;
}

.feeds-stat-icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 16px;
}

.feeds-stat-icon--orange { background: var(--settings-orange-bg); color: var(--settings-orange-text); }
.feeds-stat-icon--green { background: var(--settings-success-bg); color: var(--settings-success-text); }
.feeds-stat-icon--red { background: var(--settings-danger-bg); color: var(--settings-danger-text); }
.feeds-stat-icon--blue { background: var(--settings-info-bg); color: var(--settings-info-text); }
.feeds-stat-icon--purple { background: var(--settings-rule-bg); color: var(--settings-rule-text); }

.feeds-stat-label,
.feeds-stat-value {
  display: block;
}

.feeds-stat-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.feeds-stat-value {
  margin-top: 2px;
  color: var(--text-primary);
  font-size: 20px;
  line-height: 1.2;
}

.feeds-toolbar,
.feeds-toolbar-actions,
.feeds-toolbar-filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.feeds-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.feeds-file-input {
  display: none;
}

.feeds-toolbar-button,
.feeds-status-filter {
  height: 42px;
  padding: 0 16px;
  border: 1px solid var(--border-control);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.feeds-toolbar-button {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  gap: 8px;
}

.feeds-toolbar-action-icon {
  color: var(--settings-orange-text);
}

.feeds-toolbar-button:hover:not(:disabled) {
  background: var(--bg-page);
  border-color: var(--border-strong);
}

.feeds-toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.feeds-search {
  display: flex;
  width: 280px;
  height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--border-control);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-muted);
}

.feeds-search:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--shadow-warning-focus-color);
}

.feeds-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.feeds-table-card {
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 12px;
}

.feeds-table-wrapper {
  max-height: 60vh;
  overflow-x: auto;
  overflow-y: auto;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  scrollbar-width: thin;
}

.feeds-table-wrapper::-webkit-scrollbar {
  height: 10px;
}

.feeds-table-wrapper::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.feeds-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 999px;
}

.feeds-table {
  width: 100%;
  min-width: 1040px;
  border-collapse: collapse;
  font-size: 14px;
}

.feeds-table th {
  height: 46px;
  padding: 0 14px;
  background: var(--bg-page);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.feeds-table td {
  height: 58px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  vertical-align: middle;
  white-space: nowrap;
}

.feeds-table tbody tr:hover {
  background: var(--bg-page);
}

.feeds-table tbody tr {
  cursor: pointer;
}

.feeds-details-button {
  width: 100%;
  padding: 0;
  border: 0;
  background: var(--color-transparent);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.feeds-details-button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.feeds-name-cell {
  min-width: 220px;
  max-width: 300px;
}

.feeds-name-cell strong,
.feeds-name-cell span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feeds-name-cell strong {
  color: var(--text-primary);
}

.feeds-name-cell span {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 12px;
}

.feeds-status-pill {
  display: inline-flex;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-transform: capitalize;
}

.feeds-status-pill--healthy { background: var(--settings-success-bg); color: var(--settings-success-text); }
.feeds-status-pill--recovered { background: var(--settings-orange-bg); border-color: var(--settings-orange-border); color: var(--text-primary); }
.feeds-status-pill--degraded { background: var(--settings-orange-bg); color: var(--settings-orange-text); }
.feeds-status-pill--failing { background: var(--settings-danger-bg); color: var(--settings-danger-text); }
.feeds-status-pill--disabled { background: var(--settings-neutral-bg); color: var(--settings-neutral-text); }

.feeds-reliability-bar,
.feeds-trust-bar {
  display: block;
  width: 54px;
  height: 3px;
  margin-top: 4px;
  overflow: hidden;
  background: var(--bg-meter-track);
  border-radius: 999px;
}

.feeds-reliability-bar span,
.feeds-trust-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.feeds-trust-bar span { background: var(--settings-orange-text); }
.feeds-reliability-bar--high { background: var(--settings-success-text); }
.feeds-reliability-bar--degraded { background: var(--color-warning); }
.feeds-reliability-bar--poor { background: var(--settings-danger-text); }

.feeds-table-row--disabled {
  color: var(--text-muted);
}

.feeds-table-row--healthy td:first-child { box-shadow: inset 3px 0 var(--settings-success-text); }
.feeds-table-row--recovered td:first-child { box-shadow: inset 3px 0 var(--article-warning-text); }
.feeds-table-row--degraded td:first-child { box-shadow: inset 3px 0 var(--color-warning); }
.feeds-table-row--failing td:first-child { box-shadow: inset 3px 0 var(--color-danger); }
.feeds-table-row--disabled td:first-child { box-shadow: inset 3px 0 var(--border-strong); }

.feeds-edit-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: var(--color-transparent);
  color: var(--settings-orange-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.feeds-edit-button:hover {
  background: var(--settings-orange-bg);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-edit-button:hover) {
  background: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

.feeds-message {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
}

.feeds-message--success { background: var(--settings-success-bg); color: var(--settings-success-text); }
.feeds-message--error { background: var(--settings-danger-bg); color: var(--settings-danger-text); }

.feeds-footer {
  margin: 12px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

:global(:root[data-theme='dark'] .feeds-overview) {
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-header h3),
:global(:root[data-theme='dark'] .feeds-overview .feeds-stat-value),
:global(:root[data-theme='dark'] .feeds-overview .feeds-name-cell strong),
:global(:root[data-theme='dark'] .feeds-overview .feeds-toolbar-button),
:global(:root[data-theme='dark'] .feeds-overview .feeds-status-filter) {
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-header p:not(.settings-page-eyebrow)),
:global(:root[data-theme='dark'] .feeds-overview .feeds-helper-text),
:global(:root[data-theme='dark'] .feeds-overview .feeds-name-cell span),
:global(:root[data-theme='dark'] .feeds-overview .feeds-stat-label),
:global(:root[data-theme='dark'] .feeds-overview .feeds-footer),
:global(:root[data-theme='dark'] .feeds-overview .feeds-empty-state) {
  color: var(--text-muted);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-stat-card),
:global(:root[data-theme='dark'] .feeds-overview .feeds-table-card),
:global(:root[data-theme='dark'] .feeds-overview .feeds-table),
:global(:root[data-theme='dark'] .feeds-overview .feeds-table tbody),
:global(:root[data-theme='dark'] .feeds-overview .feeds-table tbody tr),
:global(:root[data-theme='dark'] .feeds-overview .feeds-toolbar-button),
:global(:root[data-theme='dark'] .feeds-overview .feeds-status-filter),
:global(:root[data-theme='dark'] .feeds-overview .feeds-search) {
  background: var(--bg-modal);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-table th) {
  background: var(--bg-control);
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-table td) {
  background: var(--bg-modal);
  border-color: var(--border-subtle);
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-table tbody tr:hover),
:global(:root[data-theme='dark'] .feeds-overview .feeds-table tbody tr:hover td) {
  background: var(--bg-control);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-search input) {
  background: var(--color-transparent);
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .feeds-overview .feeds-search input::placeholder) {
  color: var(--text-muted);
}

@media (max-width: 879px) {
  .feeds-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .feeds-toolbar,
  .feeds-toolbar-actions,
  .feeds-toolbar-filters { width: 100%; align-items: stretch; flex-direction: column; }
  .feeds-toolbar-button,
  .feeds-status-filter,
  .feeds-search { width: 100%; }
}
</style>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../store/overview.js';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import { fetchFeeds, recalculateFeedTrust } from '../../api/feeds';
import { exportOpml, importOpml } from '../../api/opml';
import { formatRelativeDate } from '../../utils/date.js';
import SettingsFeedDetails from './SettingsFeedDetails.vue';

const FEED_HEALTH_LABELS = Object.freeze({
    HEALTHY: 'Healthy',
    RECOVERED: 'Recovered',
    DEGRADED: 'Degraded',
    FAILING: 'Failing',
    DISABLED: 'Disabled'
});

export default {
  components: { SettingsFeedDetails },
  emits: ['close', 'detail-view', 'saved'],
    data() {
        return {
            feeds: [],
            feedsLoading: false,
            feedsError: null,
            opmlMessage: null,
            opmlError: null,
            feedTrustLoading: false,
            feedTrustMessage: null,
            feedTrustError: null,
            searchQuery: '',
            healthFilter: 'all',
            selectedFeedId: null
        };
    },
    created() {
        this.fetchFeeds();
    },
    watch: {
        'overviewStore.deletedFeedIds': {
            // Reconciles confirmed deletions performed by the shared edit/delete dialogs.
            handler(feedIds) {
                this.reconcileDeletedFeeds(feedIds);
            },
            deep: true,
            immediate: true
        }
    },
    methods: {
        async fetchFeeds() {
            try {
                this.feedsLoading = true;
                this.feedsError = null;
                const resp = await fetchFeeds();
                if (resp && resp.data && Array.isArray(resp.data.feeds)) {
                    const deletedIds = new Set(
                        this.overviewStore.deletedFeedIds.map(id => String(id))
                    );
                    this.feeds = resp.data.feeds.filter(feed => !deletedIds.has(String(feed.id)));
                } else {
                    this.feeds = [];
                }
            } catch (err) {
                console.error('Error loading the Settings feed overview:', err);
                this.feedsError = 'Could not load feeds. Please try again.';
            } finally {
                this.feedsLoading = false;
            }
        },
        feedRowClass(feed) {
            const health = this.feedHealthKey(feed);
            return health ? `feeds-table-row--${health.toLowerCase()}` : '';
        },
        feedStatus(feed) {
            return (feed?.status || 'disabled').toLowerCase();
        },
        // Returns the backend-owned health state without deriving it from local metrics.
        feedHealthKey(feed) {
            const health = String(feed?.health || '').toUpperCase();
            return Object.hasOwn(FEED_HEALTH_LABELS, health) ? health : '';
        },
        // Converts backend health states into overview labels.
        feedHealthLabel(feed) {
            return FEED_HEALTH_LABELS[this.feedHealthKey(feed)] || 'Unknown';
        },
        // Formats the backend reliability percentage without treating missing data as zero.
        formatReliability(value) {
            if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
            return `${Math.round(Number(value))}%`;
        },
        // Normalizes reliability percentages for the compact meter.
        reliabilityProgress(value) {
            if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
            return Math.max(0, Math.min(100, Math.round(Number(value))));
        },
        // Maps reliability thresholds to semantic meter colors.
        reliabilityTone(value) {
            const reliability = this.reliabilityProgress(value);
            if (reliability === null) return '';
            if (reliability >= 90) return 'high';
            if (reliability >= 50) return 'degraded';
            return 'poor';
        },
        // Formats the latest crawl using the shared relative-date presentation.
        formatLastCrawl(value) {
            const relativeDate = formatRelativeDate(value);
            if (!relativeDate) return 'Never';

            const units = {
                second: 's',
                minute: 'm',
                hour: 'h',
                day: 'd',
                month: 'mo',
                year: 'y'
            };
            return relativeDate.replace(
                /^(\d+) (second|minute|hour|day|month|year)s? ago$/i,
                (_, amount, unit) => `${amount}${units[unit.toLowerCase()]} ago`
            );
        },
        trustProgress(value) {
            if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
            return Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
        },
        openFeedEdit(feed) {
            if (!feed) return;
            this.selectionStore.selectFeed(feed.id, feed.categoryId ?? '%');
            this.uiStore.setShowModal('UpdateFeed');
        },
        // Opens one feed's observability details without replacing the Settings section.
        openFeedDetails(feed) {
            if (!feed?.id) return;
            this.selectedFeedId = feed.id;
            this.$emit('detail-view', true);
        },
        // Restores the retained feed overview state.
        closeFeedDetails() {
            this.selectedFeedId = null;
            this.$emit('detail-view', false);
        },
        // Removes explicitly deleted feeds and closes details that no longer have a backend resource.
        reconcileDeletedFeeds(feedIds) {
            if (!Array.isArray(feedIds) || feedIds.length === 0) return;

            const deletedIds = new Set(feedIds.map(id => String(id)));
            this.feeds = this.feeds.filter(feed => !deletedIds.has(String(feed.id)));

            if (this.selectedFeedId !== null && deletedIds.has(String(this.selectedFeedId))) {
                this.closeFeedDetails();
            }
        },
        async downloadOpml() {
            this.opmlMessage = null;
            this.opmlError = null;

            try {
                const response = await exportOpml();
                const contentDisposition = response.headers?.['content-disposition'] || '';
                const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
                const filename = fileNameMatch?.[1] || `rssmonster-export-${Date.now()}.opml`;

                const blob = new Blob([response.data], { type: 'text/xml' });
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(downloadUrl);
            } catch (err) {
                console.error('Error exporting feeds as OPML:', err);
                this.opmlError = 'Could not download the OPML export. Please try again.';
            }
        },
        async handleFileSelect(event) {
            this.opmlMessage = null;
            this.opmlError = null;

            const file = event?.target?.files?.[0];
            if (!file) return;

            try {
                const response = await importOpml(file);
                const categoriesCreated = Number(response?.data?.categoriesCreated || 0);
                const feedsCreated = Number(response?.data?.feedsCreated || 0);
                this.opmlMessage = `Import completed: ${categoriesCreated} categories and ${feedsCreated} feeds added.`;

                await this.fetchFeeds();
                this.$emit('saved');
            } catch (err) {
                console.error('Error importing feeds from OPML:', err);
                this.opmlError = 'Could not import this OPML file. Check the file and try again.';
            } finally {
                if (event?.target) {
                    event.target.value = '';
                }
            }
        },
        async handleRecalculateFeedTrust() {
            this.feedTrustMessage = null;
            this.feedTrustError = null;

            try {
                this.feedTrustLoading = true;
                const response = await recalculateFeedTrust();
                const updatedCount = Number(response?.data?.updatedCount || 0);
                const failedCount = Number(response?.data?.failedCount || 0);
                this.feedTrustMessage = failedCount > 0
                    ? `Feed scores recalculated for ${updatedCount} feeds. ${failedCount} failed.`
                    : `Feed scores recalculated for ${updatedCount} feeds.`;

                await this.fetchFeeds();
                this.$emit('saved');
            } catch (err) {
                console.error('Error recalculating feed trust scores:', err);
                this.feedTrustError = 'Could not recalculate feed scores. Please try again.';
            } finally {
                this.feedTrustLoading = false;
            }
        }
    },
    computed: {
      ...mapStores(useOverviewStore, useSelectionStore, useUiStore),
        filteredFeeds() {
            const query = this.searchQuery.trim().toLowerCase();

            return this.feeds.filter((feed) => {
                const healthMatches = this.healthFilter === 'all' || this.feedHealthKey(feed) === this.healthFilter;
                const searchMatches = !query || [feed.feedName, feed.url]
                    .some((value) => String(value || '').toLowerCase().includes(query));

                return healthMatches && searchMatches;
            });
        },
        feedStats() {
            const totalArticles = this.feeds.reduce((total, feed) => total + (Number(feed.articleCount) || 0), 0);

            return [
                { label: 'Total Feeds', value: this.feeds.length, icon: 'rss', tone: 'orange' },
                { label: 'Healthy Feeds', value: this.feeds.filter((feed) => this.feedHealthKey(feed) === 'HEALTHY').length, icon: 'check-lg', tone: 'green' },
                { label: 'Need Attention', value: this.feeds.filter((feed) => ['RECOVERED', 'DEGRADED', 'FAILING'].includes(this.feedHealthKey(feed))).length, icon: 'exclamation-triangle', tone: 'red' },
                { label: 'Total Articles', value: totalArticles.toLocaleString(), icon: 'file-earmark-text', tone: 'blue' },
            ];
        },
        formatScore() {
            return (value) => {
                if (value === null || value === undefined) return '-';
                const num = Number(value);
                if (Number.isNaN(num)) return '-';
                const pct = num * 100;
                return `${pct.toFixed(0)}%`;
            };
        },
        formatCoverage() {
            return (value) => {
                if (value === null || value === undefined) return '-';
                const num = Number(value);
                if (Number.isNaN(num)) return '-';
                return `${num.toFixed(1)}%`;
            };
        }
    }
};
</script>
