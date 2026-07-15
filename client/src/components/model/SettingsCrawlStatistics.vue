<template>
  <div class="crawl-statistics-settings">
    <section class="settings-insight-card" aria-labelledby="crawl-statistics-title">
      <span class="settings-insight-icon" aria-hidden="true">
        <BootstrapIcon icon="clipboard-data-fill" />
      </span>
      <div>
        <p class="settings-page-eyebrow">Settings — Crawl Statistics</p>
        <h3 id="crawl-statistics-title">Daily crawl activity</h3>
        <p>
          Review how many articles were added or updated and how each day&rsquo;s user crawls
          finished.
        </p>
      </div>
    </section>

    <div class="crawl-statistics-toolbar">
      <label for="crawl-statistics-days">Date range</label>
      <select
        id="crawl-statistics-days"
        v-model.number="days"
        class="form-select form-select-sm"
        :disabled="loading"
        @change="reload"
      >
        <option :value="7">Last 7 days</option>
        <option :value="30">Last 30 days</option>
        <option :value="90">Last 90 days</option>
        <option :value="365">Last 365 days</option>
      </select>
    </div>

    <div v-if="loading" class="d-flex align-items-center gap-2 mb-3">
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span>Loading crawl statistics...</span>
    </div>

    <div v-else-if="error" class="alert alert-danger mb-3" role="alert">
      {{ error }}
    </div>

    <div v-else-if="!crawlStatistics.length" class="alert alert-info mb-3">
      No crawl statistics are available for this period.
    </div>

    <section v-else class="settings-data-panel" aria-labelledby="daily-crawl-statistics-title">
      <div class="settings-section-heading">
        <div>
          <h4 id="daily-crawl-statistics-title">Daily totals</h4>
          <p>Only completed and failed user crawls are included.</p>
        </div>
      </div>

      <div class="crawl-statistics-table-wrap">
        <table class="crawl-statistics-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">New articles</th>
              <th scope="col">Updated articles</th>
              <th scope="col">Completed</th>
              <th scope="col">Failed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in crawlStatistics" :key="row.date">
              <th scope="row" data-label="Date">{{ formatDate(row.date) }}</th>
              <td data-label="New articles">{{ formatNumber(row.newArticles) }}</td>
              <td data-label="Updated articles">{{ formatNumber(row.updatedArticles) }}</td>
              <td data-label="Completed">{{ formatNumber(row.completedCrawls) }}</td>
              <td data-label="Failed">{{ formatNumber(row.failedCrawls) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="settings-refresh-actions">
      <button type="button" class="settings-refresh-button" :disabled="loading" @click="reload">
        <BootstrapIcon icon="arrow-clockwise" aria-hidden="true" />
        Refresh
      </button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.crawl-statistics-settings {
  max-width: 1100px;
  color: var(--text-primary);
}

.crawl-statistics-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 18px;
}

.crawl-statistics-toolbar label {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}

.crawl-statistics-toolbar .form-select {
  width: 160px;
  color: var(--text-primary);
  background-color: var(--bg-primary);
  border-color: var(--border-subtle);
}

.settings-data-panel {
  margin-bottom: 18px;
  padding: 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
}

.settings-section-heading h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.settings-section-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.crawl-statistics-table-wrap {
  margin-top: 16px;
  overflow-x: auto;
}

.crawl-statistics-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.crawl-statistics-table th,
.crawl-statistics-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: right;
  white-space: nowrap;
}

.crawl-statistics-table th:first-child,
.crawl-statistics-table td:first-child {
  padding-left: 0;
  text-align: left;
}

.crawl-statistics-table th:last-child,
.crawl-statistics-table td:last-child {
  padding-right: 0;
}

.crawl-statistics-table thead th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.crawl-statistics-table tbody th {
  color: var(--text-primary);
  font-weight: 600;
}

.crawl-statistics-table tbody td {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.crawl-statistics-table tbody tr:last-child th,
.crawl-statistics-table tbody tr:last-child td {
  border-bottom: 0;
}

.settings-refresh-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.settings-refresh-button {
  display: inline-flex;
  height: 40px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  background: var(--color-primary);
  border: 0;
  border-radius: 8px;
  color: var(--text-inverted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.settings-refresh-button:hover {
  background: var(--color-primary-hover);
}

.settings-refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.90;
}

:global(:root[data-theme='dark']) .crawl-statistics-toolbar .form-select,
:global(:root[data-theme='dark']) .settings-data-panel {
  background-color: var(--bg-modal);
  border-color: var(--border-color);
}

@media (max-width: 766px) {
  .crawl-statistics-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .crawl-statistics-toolbar .form-select {
    width: 100%;
  }

  .settings-data-panel {
    padding: 16px;
  }

  .crawl-statistics-table-wrap {
    overflow: visible;
  }

  .crawl-statistics-table,
  .crawl-statistics-table tbody,
  .crawl-statistics-table tr,
  .crawl-statistics-table th,
  .crawl-statistics-table td {
    display: block;
    width: 100%;
  }

  .crawl-statistics-table thead {
    display: none;
  }

  .crawl-statistics-table tbody tr {
    padding: 8px 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .crawl-statistics-table tbody tr:last-child {
    border-bottom: 0;
  }

  .crawl-statistics-table tbody th,
  .crawl-statistics-table tbody td {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 0;
    border: 0;
    text-align: right;
  }

  .crawl-statistics-table tbody th::before,
  .crawl-statistics-table tbody td::before {
    color: var(--text-muted);
    content: attr(data-label);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
}
</style>

<script>
import { fetchCrawlStatistics } from '../../api/settings';

export default {
  name: 'SettingsCrawlStatistics',
  data() {
    return {
      crawlStatistics: [],
      days: 30,
      error: null,
      loading: false
    };
  },
  created() {
    this.reload();
  },
  methods: {
    // This function loads the selected bounded period of daily crawl statistics.
    async reload() {
      this.loading = true;
      this.error = null;

      try {
        const response = await fetchCrawlStatistics({ days: this.days });
        this.crawlStatistics = response.data.crawlStatistics || [];
      } catch (error) {
        console.error('Error loading crawl statistics:', error);
        this.error = 'Unable to load crawl statistics. Please try again.';
      } finally {
        this.loading = false;
      }
    },
    // This function formats an API calendar date without shifting time zones.
    formatDate(value) {
      if (!value) return 'Unknown date';

      return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    },
    // This function formats a crawl statistic using the current locale.
    formatNumber(value) {
      return Number(value || 0).toLocaleString();
    }
  }
};
</script>
