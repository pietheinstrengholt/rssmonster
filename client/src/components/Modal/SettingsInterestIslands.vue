<template>
  <div class="settings-group">
    <h4>Your evolving interests</h4>
    <p class="text-muted mb-3">
      Interest islands capture the topics your reading, stars, and clicks keep reinforcing. Use this dashboard to review
      what is growing, what it is connected to, and how much of your library is covered.
    </p>

    <div v-if="loading" class="d-flex align-items-center gap-2 mb-3">
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span>Loading interest islands…</span>
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
          <div class="progress-bar bg-success" role="progressbar" :style="{ width: `${totals.islandCoveragePercent}%` }" :aria-valuenow="totals.islandCoveragePercent" aria-valuemin="0" aria-valuemax="100"></div>
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
                <h5 class="mb-1">{{ island.label || island.topicKey || `Island #${island.id}` }}</h5>
                <div class="text-muted small">
                  Topic key: {{ island.topicKey || 'unassigned' }} · {{ island.relatedArticleCount }} related articles
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
      <button type="button" class="btn btn-primary" @click="$emit('close')">Back to settings</button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
import { fetchInterestIslands } from '../../api/settings';

export default {
  name: 'SettingsInterestIslands',
  emits: ['close', 'saved'],
  data() {
    return {
      loading: false,
      error: null,
      islands: [],
      totals: {
        totalArticles: 0,
        islandArticles: 0,
        nonIslandArticles: 0,
        islandCoveragePercent: 0,
        nonIslandCoveragePercent: 0,
        islandCount: 0
      }
    };
  },
  created() {
    this.loadInterestIslands();
  },
  methods: {
    async loadInterestIslands() {
      try {
        this.loading = true;
        this.error = null;

        const { data } = await fetchInterestIslands();
        this.islands = Array.isArray(data?.islands) ? data.islands : [];
        this.totals = data?.totals || this.totals;
      } catch (err) {
        console.error('Failed to load interest islands:', err);
        this.error = 'Failed to load interest islands.';
      } finally {
        this.loading = false;
      }
    },
    formatNormalizedAffinity(value) {
      const weight = Number(value);
      const safeWeight = Number.isFinite(weight) ? Math.max(weight, 0) : 0;
      const normalized = 1 - Math.exp(-safeWeight / 3);
      return normalized.toFixed(2);
    },
    formatPercent(value) {
      const num = Number(value);
      return `${Number.isFinite(num) ? num.toFixed(0) : 0}%`;
    },
    formatDate(value) {
      if (!value) return 'Unknown date';
      return new Date(value).toLocaleDateString();
    }
  }
};
</script>