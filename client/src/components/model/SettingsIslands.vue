<template>
  <div class="settings-group">
    <h4>Your evolving interests</h4>
    <p class="text-muted mb-3">
      Interest islands capture the topics your reading, stars, and clicks keep reinforcing. Use this dashboard to review
      what is growing, what it is connected to, and how much of your library is covered.
    </p>

    <div v-if="loading" class="d-flex align-items-center gap-2 mb-3">
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span>Loading interest islands...</span>
    </div>

    <div v-else-if="error" class="alert alert-danger mb-3">
      {{ error }}
    </div>

    <div v-else>
      <div class="row g-3 mb-3">
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Interest islands</div>
              <div class="fs-4 fw-semibold">{{ totals.islandCount }}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Island articles</div>
              <div class="fs-4 fw-semibold">{{ totals.islandArticles }}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Outside islands</div>
              <div class="fs-4 fw-semibold">{{ totals.nonIslandArticles }}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Coverage</div>
              <div class="fs-4 fw-semibold">{{ formatPercent(totals.islandCoveragePercent) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <div class="d-flex justify-content-between small text-muted mb-1">
          <span>Island coverage</span>
          <span>{{ formatPercent(totals.islandCoveragePercent) }} / {{ formatPercent(totals.nonIslandCoveragePercent) }}</span>
        </div>
        <div class="progress" style="height: 12px;">
          <div
            class="progress-bar bg-success"
            role="progressbar"
            :style="{ width: `${totals.islandCoveragePercent}%` }"
            :aria-valuenow="totals.islandCoveragePercent"
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>

      <div v-if="!islands.length" class="alert alert-info mb-3">
        You do not have any interest islands yet. Star articles, click through articles, or keep reading in a topic to grow one.
      </div>

      <div v-else class="interest-islands-list">
        <div v-for="island in islands" :key="island.id" class="interest-island-card card mb-3">
          <div class="card-body">
            <div class="d-flex justify-content-between gap-3 align-items-start flex-wrap">
              <div>
                <h5 class="mb-1">{{ island.label || `Island #${island.id}` }}</h5>
                <div class="text-muted small">
                  {{ island.relatedArticleCount }} related articles · {{ island.topicCount }} topics linked
                </div>
              </div>
              <div class="text-end">
                <div class="small text-muted text-uppercase">Affinity</div>
                <div class="fs-5 fw-semibold">{{ formatNormalizedAffinity(island.effectiveWeight) }}</div>
              </div>
            </div>

            <div class="d-flex flex-wrap gap-2 mt-3">
              <span class="badge text-bg-primary">{{ island.starCount }} {{ island.starCount === 1 ? 'star' : 'stars' }}</span>
              <span class="badge text-bg-info">{{ island.clickCount }} {{ island.clickCount === 1 ? 'click' : 'clicks' }}</span>
              <span class="badge text-bg-secondary">{{ island.interactionCount }} interactions</span>
              <span class="badge" :class="island.archivedInd ? 'text-bg-dark' : 'text-bg-success'">{{ island.archivedInd ? 'Archived' : 'Active' }}</span>
            </div>

            <div v-if="island.relatedArticles?.length" class="mt-3">
              <div class="small text-uppercase text-muted mb-2">Recent related articles</div>
              <div class="list-group">
                <a
                  v-for="article in island.relatedArticles"
                  :key="article.id"
                  class="list-group-item list-group-item-action"
                  :href="article.url"
                  target="_blank"
                >
                  <div class="d-flex justify-content-between gap-3">
                    <div class="flex-grow-1">
                      <div class="fw-semibold">{{ article.title }}</div>
                      <div class="text-muted small">
                        {{ article.feedName || 'Unknown feed' }} · {{ formatDate(article.published) }}
                      </div>
                      <div class="mt-1">
                        <span
                          class="badge"
                          :class="article.isPopulationSource ? 'text-bg-primary' : 'text-bg-warning'"
                        >
                          {{ article.isPopulationSource ? 'Population source' : 'New to island' }}
                        </span>
                      </div>
                    </div>
                    <div class="text-end small text-muted">
                      <div>{{ article.starInd === 1 ? 'Starred' : 'Not starred' }}</div>
                      <div>{{ article.clickedAmount > 0 ? `${article.clickedAmount} clicks` : 'No clicks' }}</div>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex justify-content-end">
      <button type="button" class="btn btn-secondary" @click="reload" :disabled="loading">Refresh</button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.alert-danger {
  background-color: var(--bg-danger-subtle);
  border-color: var(--border-danger-subtle);
  color: var(--text-danger);
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
