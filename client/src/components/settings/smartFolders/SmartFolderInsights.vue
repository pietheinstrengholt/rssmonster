<template>
    <div class="smart-folders-toolbar">
        <div>
            <h4>Smart Folder Insights</h4>
            <p>Let RSSMonster analyze your reading history and suggest useful smart folders.</p>
        </div>

        <button
            type="button"
            class="app-button app-button--primary"
            @click="fetchInsights"
            :disabled="loading"
            :aria-busy="loading ? 'true' : 'false'"
        >
            <span v-if="loading" class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
            <BootstrapIcon v-else icon="stars" />
            <span>{{ loading ? 'Loading...' : 'Get insights' }}</span>
        </button>
    </div>

    <div v-if="loading" class="settings-group smart-folder-insight__loading">
        <span class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
        <span>Loading smart folder insights...</span>
    </div>

    <div v-if="error" class="settings-group smart-folder-insight__error">
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
            <div class="smart-folder-insight__recommendation">
                <div class="smart-folder-insight__content">
                    <strong>{{ recommendation.name }}</strong>
                    <div class="smart-folder-insight__metadata smart-folder-insight__reason">{{ recommendation.reason }}</div>
                    <code class="smart-folder-insight__query">{{ recommendation.query }}</code>
                </div>

                <button
                    type="button"
                    class="app-button settings-add-button"
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
        class="settings-group smart-folder-insight__metadata"
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

.smart-folders-toolbar .app-button {
  white-space: nowrap;
}

.smart-folder-insight__metadata {
  color: var(--text-muted);
  font-size: 0.875em;
}

.smart-folder-insight__loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.smart-folder-insight__error {
  color: var(--text-danger);
}

.smart-folder-insight__recommendation {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.smart-folder-insight__content {
  flex: 1 1 auto;
  min-width: 0;
}

.smart-folder-insight__reason {
  margin-top: 0.25rem;
}

.smart-folder-insight__query {
  display: block;
  margin-top: 0.5rem;
}

@media (max-width: 760px) {
  .smart-folders-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .smart-folders-toolbar .app-button {
    width: 100%;
  }
}
</style>
