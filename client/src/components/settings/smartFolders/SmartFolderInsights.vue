<template>
    <div class="smart-folders-toolbar">
        <div>
            <h4>Smart Folder Insights</h4>
            <p>Let RSSMonster analyze your reading history and suggest useful smart folders.</p>
        </div>

        <button
            type="button"
            class="btn btn-primary"
            @click="fetchInsights"
            :disabled="loading"
        >
            <span v-if="loading" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <BootstrapIcon v-else icon="stars" />
            <span>{{ loading ? 'Loading...' : 'Get insights' }}</span>
        </button>
    </div>

    <div v-if="loading" class="settings-group d-flex align-items-center gap-2">
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <span>Loading smart folder insights...</span>
    </div>

    <div v-if="error" class="settings-group text-danger">
        {{ error }}
    </div>

    <div v-if="recommendations.length" class="settings-group">
        <label>
            Smart Folder Suggestions
            <span class="info-icon" title="Suggested based on your reading behavior">
                <BootstrapIcon icon="info-circle-fill" />
            </span>
        </label>

        <div
            v-for="(recommendation, index) in recommendations"
            :key="'rec-' + index"
            class="action-row"
        >
            <div class="d-flex justify-content-between align-items-start gap-3">
                <div class="flex-grow-1">
                    <strong>{{ recommendation.name }}</strong>
                    <div class="text-muted small mt-1">{{ recommendation.reason }}</div>
                    <code class="d-block mt-2">{{ recommendation.query }}</code>
                </div>

                <button
                    type="button"
                    class="btn btn-add"
                    @click="$emit('add', recommendation)"
                >
                    <BootstrapIcon icon="plus-circle-fill" />
                    Add
                </button>
            </div>
        </div>
    </div>

    <div
        v-else-if="loaded && !loading && !error"
        class="settings-group text-muted small"
    >
        No smart folder insights available yet.
    </div>
</template>

<script>
import { fetchSmartFolderInsights } from '../../../api/smartfolders';

export default {
    emits: ['add'],
    // This function creates isolated insight request and result state.
    data() {
        return {
            recommendations: [],
            loading: false,
            loaded: false,
            error: null
        };
    },
    methods: {
        // This function loads and exposes Smart Folder recommendations from the existing API.
        async fetchInsights() {
            try {
                this.loading = true;
                this.error = null;
                const response = await fetchSmartFolderInsights();

                console.log('Smart Folder Insights response:', response.data);
                this.recommendations = response.data?.recommendations?.smartFolders || [];
            } catch (err) {
                console.error('Failed to fetch smart folder insights:', err);
                this.error = 'Failed to load smart folder insights. Please try again.';
            }

            this.loading = false;
            this.loaded = true;
        }
    }
};
</script>

<style scoped>
.smart-folders-toolbar {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.smart-folders-toolbar h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.smart-folders-toolbar p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.smart-folders-toolbar .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .smart-folders-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .smart-folders-toolbar .btn {
    width: 100%;
  }
}
</style>
