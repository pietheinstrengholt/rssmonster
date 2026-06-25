<template>
  <div class="settings-islands">
    <section class="settings-insight-card" aria-labelledby="islands-title">
      <span class="settings-insight-icon" aria-hidden="true">
        <BootstrapIcon icon="globe2" />
      </span>
      <div>
        <p class="settings-page-eyebrow">Settings — Island Insights</p>
        <h3 id="islands-title">Your evolving interests</h3>
        <p>
          Interest islands capture the topics your reading, stars, and clicks keep reinforcing. Review what is growing,
          what it is connected to, and how much of your library is covered.
        </p>
      </div>
    </section>

    <div v-if="loading" class="d-flex align-items-center gap-2 mb-3">
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span>Loading interest islands...</span>
    </div>

    <div v-else-if="error" class="alert alert-danger mb-3">
      {{ error }}
    </div>

    <div v-else>
      <div class="settings-metric-grid">
        <article class="settings-metric-card">
          <span class="settings-metric-label">Interest islands</span>
          <strong>{{ totals.islandCount }}</strong>
        </article>
        <article class="settings-metric-card">
          <span class="settings-metric-label">Island articles</span>
          <strong>{{ totals.islandArticles }}</strong>
        </article>
        <article class="settings-metric-card">
          <span class="settings-metric-label">Outside islands</span>
          <strong>{{ totals.nonIslandArticles }}</strong>
        </article>
        <article class="settings-metric-card">
          <span class="settings-metric-label">Coverage</span>
          <strong>{{ formatPercent(totals.islandCoveragePercent) }}</strong>
        </article>
      </div>

      <section class="settings-data-panel settings-coverage-panel" aria-labelledby="island-coverage-title">
        <div class="settings-section-heading">
          <div>
            <h4 id="island-coverage-title">Island coverage</h4>
            <p>How much of your article library is currently connected to interest islands.</p>
          </div>
          <strong>{{ formatPercent(totals.islandCoveragePercent) }}</strong>
        </div>
        <div class="settings-coverage-track">
          <div
            class="settings-coverage-fill"
            role="progressbar"
            :style="{ width: `${totals.islandCoveragePercent}%` }"
            :aria-valuenow="totals.islandCoveragePercent"
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
        <p class="settings-coverage-note">
          {{ formatPercent(totals.nonIslandCoveragePercent) }} of articles are still outside islands.
        </p>
      </section>

      <div v-if="!islands.length" class="alert alert-info mb-3">
        You do not have any interest islands yet. Star articles, click through articles, or keep reading in a topic to grow one.
      </div>

      <section v-else class="settings-data-panel" aria-labelledby="interest-islands-title">
        <div class="settings-section-heading">
          <div>
            <h4 id="interest-islands-title">Interest islands</h4>
            <p>Review the strongest clusters RSSMonster has learned from your reading behavior.</p>
          </div>
        </div>

        <div class="interest-islands-list">
          <article v-for="island in islands" :key="island.id" class="interest-island-row">
            <div class="interest-island-summary">
              <span class="interest-island-icon" aria-hidden="true">
                <BootstrapIcon icon="compass-fill" />
              </span>
              <div>
                <h5>{{ island.label || `Island #${island.id}` }}</h5>
                <p>
                  {{ island.relatedArticleCount }} related articles &middot; {{ island.topicCount }} topics linked
                </p>
              </div>
            </div>

            <div class="interest-island-affinity">
              <span>Affinity</span>
              <strong>{{ formatNormalizedAffinity(island.effectiveWeight) }}</strong>
            </div>

            <div class="interest-island-badges">
              <span class="badge text-bg-primary">{{ island.starCount }} {{ island.starCount === 1 ? 'star' : 'stars' }}</span>
              <span class="badge text-bg-info">{{ island.clickCount }} {{ island.clickCount === 1 ? 'click' : 'clicks' }}</span>
              <span class="badge text-bg-secondary">{{ island.interactionCount }} interactions</span>
              <span class="badge" :class="island.archivedInd ? 'text-bg-dark' : 'text-bg-success'">
                {{ island.archivedInd ? 'Archived' : 'Active' }}
              </span>
            </div>

            <div v-if="island.relatedArticles?.length" class="interest-article-list">
              <div class="interest-article-heading">Recent related articles</div>
              <a
                v-for="article in island.relatedArticles"
                :key="article.id"
                class="interest-article-row"
                :href="article.url"
                target="_blank"
              >
                <div>
                  <strong>{{ article.title }}</strong>
                  <p>{{ article.feedName || 'Unknown feed' }} &middot; {{ formatDate(article.published) }}</p>
                </div>
                <div class="interest-article-meta">
                  <span
                    class="badge"
                    :class="article.isPopulationSource ? 'text-bg-primary' : 'text-bg-warning'"
                  >
                    {{ article.isPopulationSource ? 'Population source' : 'New to island' }}
                  </span>
                  <small>{{ article.starInd === 1 ? 'Starred' : 'Not starred' }}</small>
                  <small>{{ article.clickedAmount > 0 ? `${article.clickedAmount} clicks` : 'No clicks' }}</small>
                </div>
              </a>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div class="settings-refresh-actions">
      <button type="button" class="settings-refresh-button" @click="reload" :disabled="loading">
        <BootstrapIcon icon="arrow-clockwise" aria-hidden="true" />
        Refresh
      </button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.settings-islands {
  max-width: 1100px;
  color: var(--text-primary);
}

.settings-data-panel,
.settings-metric-card,
.interest-island-row {
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
}

.interest-island-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.settings-data-panel h4,
.interest-island-row h5 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
}

.settings-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.settings-metric-card {
  padding: 16px;
}

.settings-metric-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-metric-card strong {
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 700;
}

.settings-data-panel {
  margin-bottom: 18px;
  padding: 20px;
}

.settings-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.settings-section-heading h4 {
  font-size: 16px;
}

.settings-section-heading p,
.settings-coverage-note,
.interest-island-summary p,
.interest-article-row p,
.interest-island-affinity span,
.interest-article-heading,
.interest-article-meta small {
  color: var(--text-muted);
}

.settings-section-heading p,
.settings-coverage-note,
.interest-island-summary p,
.interest-article-row p {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
}

.settings-section-heading > strong {
  color: var(--text-primary);
  font-size: 20px;
}

.settings-coverage-track {
  height: 10px;
  margin-top: 16px;
  overflow: hidden;
  background: var(--bg-surface-muted);
  border-radius: 999px;
}

.settings-coverage-fill {
  height: 100%;
  background: var(--color-success);
  border-radius: inherit;
}

.interest-islands-list {
  display: grid;
  gap: 12px;
}

.interest-island-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 110px;
  gap: 14px;
  padding: 16px;
}

.interest-island-summary {
  display: flex;
  gap: 12px;
  min-width: 0;
}

.interest-island-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 17px;
}

.interest-island-row h5 {
  font-size: 15px;
}

.interest-island-affinity {
  text-align: right;
}

.interest-island-affinity span {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.interest-island-affinity strong {
  color: var(--text-primary);
  font-size: 18px;
}

.interest-island-badges,
.interest-article-list {
  grid-column: 1 / -1;
}

.interest-island-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.interest-article-list {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.interest-article-heading {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.interest-article-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  padding: 12px;
  background: var(--bg-surface-muted);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
}

.interest-article-row:hover {
  border-color: var(--border-focus);
}

.interest-article-row strong {
  color: var(--text-primary);
  font-size: 13px;
}

.interest-article-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  text-align: right;
}

.alert-danger {
  background-color: var(--bg-danger-subtle);
  border-color: var(--border-danger-subtle);
  color: var(--text-danger);
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
  opacity: 0.65;
}

:global(:root[data-theme='dark']) .settings-data-panel,
:global(:root[data-theme='dark']) .settings-metric-card,
:global(:root[data-theme='dark']) .interest-island-row {
  background: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .interest-island-icon {
  background: var(--settings-icon-primary-bg-dark);
  color: var(--settings-icon-primary-text-dark);
}

:global(:root[data-theme='dark']) .settings-coverage-track,
:global(:root[data-theme='dark']) .interest-article-row {
  background: var(--bg-control);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .interest-article-list {
  border-color: var(--border-color);
}

@media (max-width: 900px) {
  .settings-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .interest-island-row,
  .interest-article-row {
    grid-template-columns: 1fr;
  }

  .interest-island-affinity,
  .interest-article-meta {
    align-items: flex-start;
    text-align: left;
  }
}

@media (max-width: 766px) {
  .settings-metric-grid {
    grid-template-columns: 1fr;
  }

  .settings-section-heading {
    flex-direction: column;
  }
}
</style>

<script>
import { fetchIslandsOverview } from '../../api/settings';

export default {
  name: 'SettingsIslands',
  emits: ['close'],
  data() {
    return {
      loading: false,
      error: null,
      islands: [],
      userId: null,
      totals: {
        islandCount: 0,
        islandArticles: 0,
        nonIslandArticles: 0,
        totalArticles: 0,
        islandCoveragePercent: 0,
        nonIslandCoveragePercent: 0
      }
    };
  },
  created() {
    this.reload();
  },
  methods: {
    formatPercent(value) {
      return `${Number(value || 0).toFixed(1)}%`;
    },
    formatNormalizedAffinity(value) {
      return Number(value || 0).toFixed(2);
    },
    formatDate(value) {
      if (!value) return 'Unknown date';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Unknown date';
      return date.toLocaleDateString();
    },
    async reload() {
      this.loading = true;
      this.error = null;

      try {
        const response = await fetchIslandsOverview();
        this.islands = response.data?.islands || [];
        this.userId = response.data?.userId || null;
        this.totals = response.data?.totals || this.totals;
      } catch (err) {
        console.error('Failed loading islands overview:', err);
        this.error = 'Failed to load islands overview.';
      }

      this.loading = false;
    }
  }
};
</script>
