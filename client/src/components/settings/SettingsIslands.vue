<template>
  <div class="settings-islands settings-page">
    <SettingsPageIntro
      eyebrow="Settings — Island Insights"
      icon="compass-fill"
      title="Your evolving interests"
      title-id="islands-title"
    >
      Interest islands capture the topics your reading, favorites, and clicks keep reinforcing. Review what is growing,
      what it is connected to, and how much of your library is covered.
    </SettingsPageIntro>

    <div v-if="loading" class="settings-islands-loading settings-state">
      <span class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
      <span>Loading interest islands...</span>
    </div>

    <div v-else-if="error" class="app-notice app-notice--danger" role="alert">
      {{ error }}
    </div>

    <div v-else>
      <div class="settings-metric-grid">
        <SettingsMetric label="Interest islands" :value="totals.islandCount" />
        <SettingsMetric label="Island articles" :value="totals.islandArticles" />
        <SettingsMetric label="Outside islands" :value="totals.nonIslandArticles" />
        <SettingsMetric label="Coverage" :value="formatPercent(totals.islandCoveragePercent)" />
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

      <div v-if="!islands.length" class="settings-islands-empty app-notice app-notice--info" role="status">
        You do not have any interest islands yet. Favorite articles, click through articles, or keep reading in a topic to grow one.
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
                  {{ formatCountLabel(island.sourceArticleCount, 'source article') }} &middot;
                  {{ formatCountLabel(island.topicCount, 'topic') }} linked &middot;
                  {{ formatCountLabel(island.relatedArticleCount, 'topic-related article') }}
                </p>
              </div>
            </div>

            <div class="interest-island-affinity">
              <span>Interest weight</span>
              <strong>{{ formatNormalizedAffinity(island.effectiveWeight) }}</strong>
            </div>

            <div class="interest-island-badges">
              <span class="app-status-badge app-status-badge--neutral">
                {{ formatCountLabel(island.evidenceSignalCount, 'behavioral signal') }}
              </span>
              <span class="app-status-badge" :class="island.archivedInd ? 'app-status-badge--dark' : 'app-status-badge--success'">
                {{ island.archivedInd ? 'Archived' : 'Active' }}
              </span>
            </div>

            <div v-if="island.sourceArticles?.length" class="interest-article-list">
              <div class="interest-article-heading">
                Why this island exists
                <span v-if="island.sourceArticleCount > island.sourceArticles.length">
                  &middot; Showing {{ island.sourceArticles.length }} of {{ island.sourceArticleCount }}
                </span>
              </div>
              <component
                :is="article.url ? 'a' : 'div'"
                v-for="article in island.sourceArticles"
                :key="`source-${article.id}`"
                class="interest-article-row"
                :href="article.url || undefined"
                :target="article.url ? '_blank' : undefined"
                :rel="article.url ? 'noopener noreferrer' : undefined"
              >
                <div>
                  <strong>{{ article.title }}</strong>
                  <p>{{ article.feedName || 'Unknown feed' }} &middot; {{ formatDate(article.publishedAt) }}</p>
                </div>
                <div class="interest-article-meta">
                  <span
                    v-for="signal in article.evidence"
                    :key="`${article.id}-${signal.type}`"
                    class="app-status-badge"
                    :class="evidenceBadgeClass(signal.type)"
                  >
                    {{ signal.label }}
                  </span>
                  <small v-if="!article.evidence?.length">Behavioral source</small>
                  <small v-for="topic in article.connectionTopics" :key="`${article.id}-topic-${topic.id}`">
                    Also connected through {{ topic.name }}
                  </small>
                </div>
              </component>
            </div>

            <div v-if="topicRelatedArticles(island).length" class="interest-article-list">
              <div class="interest-article-heading">Connected through topics</div>
              <component
                :is="article.url ? 'a' : 'div'"
                v-for="article in topicRelatedArticles(island)"
                :key="article.id"
                class="interest-article-row"
                :href="article.url || undefined"
                :target="article.url ? '_blank' : undefined"
                :rel="article.url ? 'noopener noreferrer' : undefined"
              >
                <div>
                  <strong>{{ article.title }}</strong>
                  <p>{{ article.feedName || 'Unknown feed' }} &middot; {{ formatDate(article.publishedAt) }}</p>
                </div>
                <div class="interest-article-meta">
                  <span v-if="article.isPopulationSource" class="app-status-badge app-status-badge--primary">Source article</span>
                  <small v-for="topic in article.connectionTopics" :key="`${article.id}-topic-${topic.id}`">
                    Via {{ topic.name }}
                  </small>
                </div>
              </component>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div class="settings-refresh-actions">
      <button type="button" class="settings-refresh-button app-button app-button--primary" @click="reload" :disabled="loading">
        <BootstrapIcon icon="arrow-clockwise" aria-hidden="true" />
        Refresh
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-islands-loading {
  margin-bottom: 1rem;
  font-family: var(--font-family);
  font-weight: 500;
}

.interest-island-row {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
}

.interest-island-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
}

.settings-data-panel h4,
.interest-island-row h5 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
}

.settings-islands-empty {
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
}

.settings-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
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
  background: var(--settings-neutral-bg);
  border-radius: var(--radius-pill);
}

.settings-coverage-fill {
  height: 100%;
  background: var(--settings-success-text);
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
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
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
  background: var(--settings-neutral-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
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

:global(:root[data-theme='dark']) .interest-island-row {
  background: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark']) .interest-island-icon {
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
}

:global(:root[data-theme='dark']) .settings-coverage-track,
:global(:root[data-theme='dark']) .interest-article-row {
  background: var(--surface-control);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark']) .interest-article-list {
  border-color: var(--border-default);
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

@media (max-width: 879px) {
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
import SettingsMetric from './SettingsMetric.vue';
import SettingsPageIntro from './SettingsPageIntro.vue';

export default {
  name: 'SettingsIslands',
  components: {
    SettingsMetric,
    SettingsPageIntro
  },
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
    // This function formats a count with a singular or plural label.
    formatCountLabel(value, singular) {
      const count = Number(value || 0);
      return `${count} ${singular}${count === 1 ? '' : 's'}`;
    },
    // This function maps behavioral evidence to the shared status-badge palette.
    evidenceBadgeClass(type) {
      if (type === 'favorite' || type === 'positive') return 'app-status-badge--primary';
      if (type === 'click' || type === 'deepRead') return 'app-status-badge--info';
      if (type === 'negative') return 'app-status-badge--dark';
      return 'app-status-badge--neutral';
    },
    // This function avoids repeating source articles in the topic-connected list.
    topicRelatedArticles(island) {
      return (island.relatedArticles || []).filter(article => !article.isPopulationSource);
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
