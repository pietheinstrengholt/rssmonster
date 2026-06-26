<template>
  <div class="feeds-overview">
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
            <BootstrapIcon icon="upload" aria-hidden="true" />
            Import OPML
          </button>
          <button type="button" class="feeds-toolbar-button" :disabled="feeds.length === 0" @click="downloadOpml">
            <BootstrapIcon icon="download" aria-hidden="true" />
            Export OPML
          </button>
        </div>

        <div class="feeds-toolbar-filters">
          <select v-model="statusFilter" class="feeds-status-filter" aria-label="Filter feeds by status">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="error">Error</option>
            <option value="disabled">Disabled</option>
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

      <div v-if="feeds.length === 0" class="feeds-empty-state">No feeds found.</div>
      <template v-else>
        <div v-if="filteredFeeds.length === 0" class="feeds-empty-state">No feeds match your filters.</div>
        <div v-else class="feeds-table-card">
          <div class="feeds-table-wrapper">
            <table class="feeds-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Articles</th>
                  <th>Per Day</th>
                  <th>Trust</th>
                  <th>Duplication</th>
                  <th><span class="visually-hidden">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="feed in filteredFeeds" :key="feed.id" :class="feedRowClass(feed)">
                  <td class="feeds-name-cell">
                    <strong>{{ feed.feedName }}</strong>
                    <span v-if="feed.url">{{ feed.url }}</span>
                  </td>
                  <td>{{ feed.feedType || '-' }}</td>
                  <td>
                    <span class="feeds-status-pill" :class="`feeds-status-pill--${feedStatus(feed)}`">
                      {{ feedStatus(feed) }}
                    </span>
                  </td>
                  <td>{{ feed.articleCount || 0 }}</td>
                  <td>{{ feed.articlesPerDay || 0 }}</td>
                  <td>
                    <span>{{ formatScore(feed.feedTrust) }}</span>
                    <span v-if="trustProgress(feed.feedTrust) !== null" class="feeds-trust-bar" aria-hidden="true">
                      <span :style="{ width: `${trustProgress(feed.feedTrust)}%` }"></span>
                    </span>
                  </td>
                  <td>{{ formatScore(feed.feedDuplicationRate) }}</td>
                  <td>
                    <button class="feeds-edit-button" type="button" @click="openFeedEdit(feed)">
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

<style src="../../assets/css/settings.css"></style>

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

.feeds-header p {
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
  border: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
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

.feeds-toolbar-button:hover:not(:disabled) {
  background: var(--bg-page);
  border-color: var(--border-color);
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
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-muted);
}

.feeds-search:focus-within {
  border-color: var(--settings-orange-border);
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
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.feeds-table-wrapper {
  overflow-x: auto;
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
  border-top: 1px solid var(--border-color);
  vertical-align: middle;
  white-space: nowrap;
}

.feeds-table tbody tr:hover {
  background: var(--bg-page);
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
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-transform: capitalize;
}

.feeds-status-pill--active { background: var(--settings-success-bg); color: var(--settings-success-text); }
.feeds-status-pill--error { background: var(--settings-danger-bg); color: var(--settings-danger-text); }
.feeds-status-pill--disabled { background: var(--settings-neutral-bg); color: var(--settings-neutral-text); }

.feeds-trust-bar {
  display: block;
  width: 54px;
  height: 3px;
  margin-top: 4px;
  overflow: hidden;
  background: var(--border-color);
  border-radius: 999px;
}

.feeds-trust-bar span {
  display: block;
  height: 100%;
  background: var(--settings-orange-text);
  border-radius: inherit;
}

.feeds-health--error { color: var(--settings-danger-text); font-weight: 600; }
.feeds-health--disabled { color: var(--text-muted); }
.feeds-health--active { color: var(--settings-success-text); }

.feeds-table-row--error {
  background: var(--settings-danger-bg);
}

.feeds-table-row--disabled {
  background: var(--bg-page);
  color: var(--text-muted);
}

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

:global(:root[data-theme='dark']) .feeds-edit-button:hover {
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

:global(:root[data-theme='dark']) .feeds-overview { color: var(--text-secondary); }
:global(:root[data-theme='dark']) .feeds-header h3,
:global(:root[data-theme='dark']) .feeds-stat-value,
:global(:root[data-theme='dark']) .feeds-name-cell strong { color: var(--text-inverted); }
:global(:root[data-theme='dark']) .feeds-header p,
:global(:root[data-theme='dark']) .feeds-helper-text,
:global(:root[data-theme='dark']) .feeds-stat-label,
:global(:root[data-theme='dark']) .feeds-footer { color: var(--text-muted); }
:global(:root[data-theme='dark']) .feeds-stat-card,
:global(:root[data-theme='dark']) .feeds-toolbar-button,
:global(:root[data-theme='dark']) .feeds-status-filter,
:global(:root[data-theme='dark']) .feeds-search,
:global(:root[data-theme='dark']) .feeds-table-card { background: var(--bg-modal); border-color: var(--border-color); color: var(--text-secondary); }
:global(:root[data-theme='dark']) .feeds-search input { background: var(--color-transparent); color: var(--text-inverted); }
:global(:root[data-theme='dark']) .feeds-table th { background: var(--bg-control); color: var(--text-secondary); }
:global(:root[data-theme='dark']) .feeds-table td { border-color: var(--border-color); }
:global(:root[data-theme='dark']) .feeds-table tbody tr:hover { background: var(--bg-control); }

:global(:root[data-theme='dark']) .feeds-overview,
:global(:root[data-theme='dark']) .feeds-table td,
:global(:root[data-theme='dark']) .feeds-search input,
:global(:root[data-theme='dark']) .feeds-name-cell strong {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark']) .feeds-stat-card,
:global(:root[data-theme='dark']) .feeds-table-card,
:global(:root[data-theme='dark']) .feeds-table,
:global(:root[data-theme='dark']) .feeds-table tbody,
:global(:root[data-theme='dark']) .feeds-table tbody tr,
:global(:root[data-theme='dark']) .feeds-toolbar-button,
:global(:root[data-theme='dark']) .feeds-status-filter,
:global(:root[data-theme='dark']) .feeds-search {
  background-color: var(--bg-modal) !important;
  border-color: var(--border-color) !important;
}

:global(:root[data-theme='dark']) .feeds-table th {
  background-color: var(--bg-control) !important;
  color: var(--text-secondary) !important;
}

:global(:root[data-theme='dark']) .feeds-name-cell span,
:global(:root[data-theme='dark']) .feeds-stat-label,
:global(:root[data-theme='dark']) .feeds-footer,
:global(:root[data-theme='dark']) .feeds-empty-state {
  color: var(--text-muted) !important;
}

:global(:root[data-theme='dark']) .feeds-table-row--error,
:global(:root[data-theme='dark']) .feeds-table-row--error:hover {
  background: var(--bg-danger-subtle) !important;
}

@media (max-width: 766px) {
  .feeds-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .feeds-toolbar,
  .feeds-toolbar-actions,
  .feeds-toolbar-filters { width: 100%; align-items: stretch; flex-direction: column; }
  .feeds-toolbar-button,
  .feeds-status-filter,
  .feeds-search { width: 100%; }
}
</style>

<style>
:root[data-theme="dark"] .feeds-overview,
:root[data-theme="dark"] .feeds-overview .feeds-table td,
:root[data-theme="dark"] .feeds-overview .feeds-name-cell strong { color: var(--text-inverted) !important; }

:root[data-theme="dark"] .feeds-overview .feeds-stat-card,
:root[data-theme="dark"] .feeds-overview .feeds-table-card,
:root[data-theme="dark"] .feeds-overview .feeds-table,
:root[data-theme="dark"] .feeds-overview .feeds-table tbody,
:root[data-theme="dark"] .feeds-overview .feeds-table tbody tr,
:root[data-theme="dark"] .feeds-overview .feeds-toolbar-button,
:root[data-theme="dark"] .feeds-overview .feeds-status-filter,
:root[data-theme="dark"] .feeds-overview .feeds-search { background: var(--bg-modal) !important; border-color: var(--border-color) !important; }

:root[data-theme="dark"] .feeds-overview .feeds-table th { background: var(--bg-control) !important; color: var(--text-secondary) !important; }
:root[data-theme="dark"] .feeds-overview .feeds-table td { border-color: var(--border-color) !important; }
:root[data-theme="dark"] .feeds-overview .feeds-header h3,
:root[data-theme="dark"] .feeds-overview .feeds-stat-value,
:root[data-theme="dark"] .feeds-overview .feeds-toolbar-button,
:root[data-theme="dark"] .feeds-overview .feeds-status-filter { color: var(--text-inverted) !important; }
:root[data-theme="dark"] .feeds-overview .feeds-name-cell span,
:root[data-theme="dark"] .feeds-overview .feeds-stat-label,
:root[data-theme="dark"] .feeds-overview .feeds-footer,
:root[data-theme="dark"] .feeds-overview .feeds-header p,
:root[data-theme="dark"] .feeds-overview .feeds-helper-text { color: var(--text-muted) !important; }
:root[data-theme="dark"] .feeds-overview .feeds-search input {
  background: var(--color-transparent) !important;
  color: var(--text-inverted) !important;
}
:root[data-theme="dark"] .feeds-overview .feeds-search input::placeholder { color: var(--text-muted) !important; }
</style>

<script>
import { fetchFeeds } from '../../api/feeds';
import { exportOpml, importOpml } from '../../api/opml';

export default {
  emits: ['close', 'saved'],
    data() {
        return {
            advertisementScore: 0,
            sentimentScore: 0,
            qualityScore: 0,
            scoreOptions: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0],
            actions: [],
            smartFolders: [],
            showFeedsModal: false,
            showActionsModal: false,
            showScoreThresholdsModal: false,
            feeds: [],
            feedsLoading: false,
            feedsError: null,
            opmlMessage: null,
            opmlError: null,
            searchQuery: '',
            statusFilter: 'all',
            smartFolderRecommendations: [],
            smartFolderInsightsLoading: false,
            smartFolderInsightsLoaded: false,
            smartFolderInsightsError: null
        };
    },
    created() {
        this.fetchFeeds();
    },
    methods: {
        async fetchFeeds() {
            try {
                this.feedsLoading = true;
                this.feedsError = null;
                const resp = await fetchFeeds();
                if (resp && resp.data && Array.isArray(resp.data.feeds)) {
                    this.feeds = resp.data.feeds;
                } else {
                    this.feeds = [];
                }
            } catch (err) {
                console.error('Failed to fetch feeds:', err);
                this.feedsError = 'Failed to fetch feeds';
            } finally {
                this.feedsLoading = false;
            }
        },
        feedRowClass(feed) {
            const status = this.feedStatus(feed);
            if (status === 'error') return 'feeds-table-row--error';
            if (status === 'disabled') return 'feeds-table-row--disabled';
            return '';
        },
        feedStatus(feed) {
            return (feed?.status || 'disabled').toLowerCase();
        },
        feedHealth(feed) {
            const status = this.feedStatus(feed);
            if (status === 'error') return 'Error';
            if (status === 'disabled') return 'Disabled';
            return this.trustProgress(feed?.feedTrust) >= 85 ? 'Excellent' : 'Good';
        },
        trustProgress(value) {
            if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
            return Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
        },
        openFeedEdit(feed) {
            if (!feed) return;
            this.$store.data.setSelectedCategoryId(feed.categoryId ?? '%');
            this.$store.data.setSelectedFeedId(feed.id);
            this.$store.data.setShowModal('UpdateFeed');
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
                console.error('Failed to export OPML:', err);
                this.opmlError = 'Failed to download OPML export.';
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
                console.error('Failed to import OPML:', err);
                this.opmlError = err?.response?.data?.error || 'Failed to import OPML file.';
            } finally {
                if (event?.target) {
                    event.target.value = '';
                }
            }
        }
    },
    computed: {
        filteredFeeds() {
            const query = this.searchQuery.trim().toLowerCase();

            return this.feeds.filter((feed) => {
                const statusMatches = this.statusFilter === 'all' || this.feedStatus(feed) === this.statusFilter;
                const searchMatches = !query || [feed.feedName, feed.url]
                    .some((value) => String(value || '').toLowerCase().includes(query));

                return statusMatches && searchMatches;
            });
        },
        feedStats() {
            const totalArticles = this.feeds.reduce((total, feed) => total + (Number(feed.articleCount) || 0), 0);

            return [
                { label: 'Total Feeds', value: this.feeds.length, icon: 'rss', tone: 'orange' },
                { label: 'Active Feeds', value: this.feeds.filter((feed) => this.feedStatus(feed) === 'active').length, icon: 'check-lg', tone: 'green' },
                { label: 'Feeds with Errors', value: this.feeds.filter((feed) => this.feedStatus(feed) === 'error').length, icon: 'exclamation-triangle', tone: 'red' },
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
