<template>
    <div class="settings-section">
                        <!-- Info text -->
                        <div class="settings-insight-card settings-insight-card--stacked smart-folders-intro">
                            <p class="mb-2 smart-folders-intro-heading">
                                <span class="settings-insight-icon" aria-hidden="true">
                                    <BootstrapIcon icon="folder" />
                                </span>
                                <strong>What are Smart Folders?</strong>
                            </p>
                            <p class="mb-2">
                                Smart Folders are dynamic, saved searches that automatically organize your articles based on custom filter queries.
                                Unlike static folders, they update in real-time as new articles arrive that match your criteria.
                            </p>
                            <p class="mb-2">
                                <strong>How to build queries:</strong>
                            </p>
                            <p class="mb-2">
                                Use filter expressions to define what articles appear in each folder. You can combine multiple filters with spaces:
                            </p>
                            <ul class="mb-2 small">
                                <li><strong>Status filters:</strong> <code>unread:true</code>, <code>read:false</code>, <code>star:true</code>, <code>clicked:true</code>, <code>seen:false</code>, <code>firstSeen:24h</code></li>
                                <li><strong>Content filters:</strong> <code>tag:ai</code>, <code>title:javascript</code>, <code>python</code></li>
                                <li><strong>Quality filters:</strong> <code>quality:>0.6</code>, <code>quality:<=0.8</code>, <code>freshness:>=0.5</code>, <code>freshness:<0.3</code></li>
                                <li><strong>Date filters:</strong> <code>@today</code>, <code>@yesterday</code>, <code>@lastweek</code>, <code>@2025-12-14</code></li>
                                <li><strong>Special filters:</strong> <code>cluster:all</code>, <code>cluster:eventCluster</code>, <code>clustercount:>=3</code>, <code>hot:false</code>, <code>limit:100</code></li>
                                <li><strong>Sorting:</strong> <code>sort:RECOMMENDED</code>, <code>sort:QUALITY</code>, <code>sort:ATTENTION</code>, <code>sort:DESC</code>, <code>sort:ASC</code></li>
                            </ul>
                            <p class="mb-2">
                                <strong>Example queries:</strong>
                            </p>
                            <ul class="mb-2 small">
                                <li><code>tag:ai unread:true quality:>0.6</code><p> – Unread AI articles with high quality</p></li>
                                <li><code>star:true @"last Monday"</code><p> – Starred articles from last Monday</p></li>
                                <li><code>title:javascript @today sort:RECOMMENDED</code><p> – Today's JavaScript articles by recommended score</p></li>
                                <li><code>cluster:eventCluster clustercount:2 sort:ATTENTION</code><p> – Event clusters with 2+ articles by attention</p></li>
                            </ul>
                            <p class="mb-0">
                                <strong>Limits:</strong> Set a maximum article count (50-500) to keep folders focused and performant.
                            </p>
                        </div>

                        <!-- Smart Folder Recommendations trigger & results -->
                        <div class="settings-group d-flex justify-content-between align-items-center gap-3 smart-folders-insights">
                            <div>
                                <label class="mb-1">Smart Folder Insights</label>
                                <div class="text-muted small">Let RSSMonster analyze your reading history and suggest useful smart folders.</div>
                            </div>
                            <button
                                type="button"
                                class="btn btn-secondary"
                                @click="fetchSmartFolderInsights"
                                :disabled="smartFolderInsightsLoading"
                            >
                                <span v-if="smartFolderInsightsLoading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                <span>{{ smartFolderInsightsLoading ? 'Loading…' : 'Get insights' }}</span>
                            </button>
                        </div>

                        <div v-if="smartFolderInsightsLoading" class="settings-group d-flex align-items-center gap-2">
                            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                            <span>Loading smart folder insights…</span>
                        </div>

                        <div v-if="smartFolderInsightsError" class="settings-group text-danger">
                            {{ smartFolderInsightsError }}
                        </div>

                        <div v-if="smartFolderRecommendations.length" class="settings-group">
                            <label>
                                Smart Folder Suggestions
                                <span class="info-icon" title="Suggested based on your reading behavior">
                                    <BootstrapIcon icon="info-circle-fill" />
                                </span>
                            </label>

                            <div
                                v-for="(rec, index) in smartFolderRecommendations"
                                :key="'rec-' + index"
                                class="action-row"
                            >
                                <div class="d-flex justify-content-between align-items-start gap-3">
                                    <div class="flex-grow-1">
                                        <strong>{{ rec.name }}</strong>
                                        <div class="text-muted small mt-1">{{ rec.reason }}</div>
                                        <code class="d-block mt-2">{{ rec.query }}</code>
                                    </div>

                                    <button
                                        type="button"
                                        class="btn btn-add"
                                        @click="applySmartFolderRecommendation(rec)"
                                    >
                                        <BootstrapIcon icon="plus-circle-fill" />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div
                            v-else-if="smartFolderInsightsLoaded && !smartFolderInsightsLoading && !smartFolderInsightsError"
                            class="settings-group text-muted small"
                        >
                            No smart folder insights available yet.
                        </div>

                        <!-- Smart Folders -->
                        <div class="settings-group smart-folders-list">
                            <div class="smart-folders-list-heading"><div><label class="mb-1">Your Smart Folders</label><div class="text-muted small">Smart Folders update automatically as new articles arrive.</div></div><button type="button" class="btn btn-add" @click="addSmartFolder"><BootstrapIcon icon="plus-circle-fill" /> Add Smart Folder</button></div>
                            <label class="visually-hidden">
                                Smart Folders
                                <span class="info-icon" :title="'Define smart folders to automatically organize articles based on criteria'">
                                    <BootstrapIcon icon="info-circle-fill" />
                                </span>
                            </label>

                            <div v-for="(smartFolder, index) in smartFolders" :key="index" class="action-row smart-folder-row">
                                <div class="action-fields smart-folder-row-grid"><BootstrapIcon icon="grip-vertical" class="smart-folder-grip" aria-hidden="true" /><span class="smart-folder-icon"><BootstrapIcon icon="folder" aria-hidden="true" /></span>
                                    <div class="form-group">
                                        <label :for="'smart-folder-name-' + index" class="small-label">Name</label>
                                        <input
                                            :id="'smart-folder-name-' + index"
                                            v-model="smartFolder.name"
                                            type="text"
                                            class="form-control"
                                            placeholder="Smart folder name"
                                        />
                                    </div>

                                    <div class="form-group form-group-full">
                                        <label :for="'smart-folder-regex-' + index" class="small-label">Query</label>
                                        <input
                                            :id="'smart-folder-regex-' + index"
                                            v-model="smartFolder.query"
                                            type="text"
                                            class="form-control"
                                            :class="{ 'input-invalid': isSmartFolderQueryInvalid(smartFolder) }"
                                            :title="smartFolderQueryError(smartFolder)"
                                            placeholder="e.g., tag:ai unread:true quality:>0.6"
                                        />
                                    </div>

                                    <div class="form-group smart-folder-limit-field">
                                        <label :for="'smart-folder-limitCount-' + index" class="small-label">Maximum Articles</label>
                                        <select
                                            :id="'smart-folder-limitCount-' + index"
                                            v-model="smartFolder.limitCount"
                                            class="form-select"
                                        >
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                            <option value="250">250</option>
                                            <option value="500">500</option>
                                        </select>
                                    </div>

                                    <button
                                        type="button"
                                        class="btn btn-remove smart-folder-delete-button"
                                        @click="removeSmartFolder(index)"
                                        :title="'Remove smart folder'"
                                    >
                                        <BootstrapIcon icon="trash-fill" />
                                    </button>
                                </div>
                            </div>

                        </div>
      <div class="settings-section__actions">
      <button class="btn btn-primary smart-folders-save" @click="save" :disabled="hasInvalidSmartFolders">Save Changes</button>
      </div>
    </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.settings-section {
  max-width: 1100px;
}

.smart-folders-intro {
  color: var(--text-info);
}
.smart-folders-intro p:first-child {
  font-size: 20px;
}
.smart-folders-intro-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.smart-folders-intro ul {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 24px;
  padding: 0;
  list-style: none;
}
.smart-folders-intro li {
  padding: 0;
  background: var(--color-transparent);
  border: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.smart-folders-intro li strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text-primary);
}
.smart-folders-intro code {
  display: inline-block;
  margin: 2px;
  padding: 3px 6px;
  background: var(--settings-query-code-bg);
  border-radius: 5px;
  color: var(--settings-query-code-text);
}
.smart-folders-insights {
  padding: 18px 0;
  background: var(--color-transparent);
  border: 0;
  border-radius: 0;
}
.smart-folders-insights .btn-secondary {
  background: var(--color-primary);
  font-weight: 700;
}
.smart-folders-list {
  padding: 0;
  background: var(--color-transparent);
  border: 0;
  border-radius: 0;
}
.smart-folders-list > label {
  display: block;
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
}
.smart-folders-list > .settings-group {
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}
.settings-section__actions .btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
:global(:root[data-theme="dark"]) .smart-folders-list > .settings-group {
  background: var(--bg-modal);
  border-color: var(--border-color);
}
@media (max-width: 766px) {
  .smart-folders-intro ul {
    grid-template-columns: 1fr;
  }
  .smart-folders-insights {
    align-items: flex-start !important;
    flex-direction: column;
  }
  .smart-folders-insights .btn-secondary {
    width: 100%;
  }
}
.smart-folder-row {
  padding: 14px 16px !important;
  background: var(--bg-primary) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: 12px !important;
}
.smart-folder-row-grid {
  display: grid !important;
  grid-template-columns: 24px 56px minmax(140px, 1fr) minmax(
      260px,
      2fr
    ) 150px 56px !important;
  align-items: center !important;
  gap: 16px !important;
}
.smart-folder-row-grid .form-group {
  margin: 0 !important;
}
.smart-folder-row-grid .form-group-full {
  grid-column: auto !important;
}
.smart-folder-row-grid .small-label {
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 700;
}
.smart-folder-grip {
  align-self: center;
  justify-self: center;
}
.smart-folder-icon {
  justify-self: center;
  align-self: center;
  margin: 0 !important;
}
.smart-folder-row-grid .form-control,
.smart-folder-row-grid .form-select {
  height: 38px;
}
.smart-folder-row-grid .form-group-full .form-control {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--settings-query-code-bg);
  color: var(--settings-query-code-text);
}
.smart-folder-delete-button {
  width: 38px !important;
  height: 38px !important;
  padding: 0 !important;
  justify-self: end;
  align-self: center;
}
.smart-folder-row + .smart-folder-row {
  margin-top: 12px;
}
@media (max-width: 900px) {
  .smart-folder-row-grid {
    grid-template-columns: 24px 56px 1fr auto !important;
    gap: 12px !important;
  }
  .smart-folder-row-grid .form-group {
    grid-column: 1/-1;
  }
  .smart-folder-delete-button {
    grid-column: 4;
    grid-row: 1;
  }
}
@media (max-width: 520px) {
  .smart-folder-row-grid {
    grid-template-columns: 24px 40px 1fr auto !important;
  }
  .smart-folder-icon {
    width: 32px;
    height: 32px;
  }
  .smart-folder-row {
    padding: 14px !important;
  }
}
.smart-folders-insights {
  margin-top: 22px !important;
  align-items: center !important;
}
.smart-folders-insights .btn-secondary {
  padding: 10px 14px;
}
.smart-folders-list {
  margin-top: 20px;
}
.smart-folders-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.smart-folders-list-heading > label {
  font-size: 16px;
}

:global(:root[data-theme='dark']) .smart-folders-list-heading .btn-add {
  background-color: var(--settings-orange-bg);
  color: var(--settings-orange-text);
  border: 1px solid var(--settings-orange-border);
}

:global(:root[data-theme='dark']) .smart-folders-list-heading .btn-add:hover {
  background-color: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

.smart-folder-row {
  padding: 14px !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: 10px !important;
  background: var(--bg-primary) !important;
}
.smart-folder-row + .smart-folder-row {
  margin-top: 10px;
}
.smart-folder-grip {
  align-self: center;
}
.smart-folder-icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  background: var(--settings-rule-bg);
  border-radius: 8px;
  color: var(--settings-rule-text);
}
.smart-folders-save {
  display: inline-flex;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--color-primary) !important;
  border: 0;
  border-radius: 8px;
  color: var(--text-inverted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.smart-folders-save:hover:not(:disabled) {
  background: var(--color-primary-hover) !important;
}
.smart-folders-save:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
@media (max-width: 766px) {
  .smart-folders-list-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .smart-folders-list-heading .btn-add {
    width: 100%;
  }
  .smart-folder-row .action-fields {
    grid-template-columns: 1fr !important;
  }
}
.smart-folder-row-grid {
  grid-template-columns: 24px 44px minmax(160px, 220px) minmax(
      320px,
      1fr
    ) 120px 48px !important;
  gap: 14px !important;
}
.smart-folder-icon {
  justify-self: start !important;
}
.smart-folder-row-grid .form-group-full {
  min-width: 0;
}
.smart-folder-row-grid .form-group-full .form-control {
  width: 100% !important;
}
.smart-folder-limit-field {
  max-width: 120px;
}
.smart-folder-limit-field .form-select {
  width: 120px !important;
}
@media (max-width: 900px) {
  .smart-folder-row-grid {
    grid-template-columns: 24px 44px 1fr auto !important;
  }
  .smart-folder-row-grid .form-group,
  .smart-folder-row-grid .form-group-full {
    grid-column: 1/-1;
  }
  .smart-folder-limit-field {
    max-width: 120px;
  }
  .smart-folder-delete-button {
    grid-column: 4;
    grid-row: 1;
  }
}
</style>

<script>
import { saveSmartFolders, fetchSmartFolderInsights } from '../../api/smartfolders';
import { setAuthToken } from '../../api/client';
import { validateSmartFolderQuery } from '../../services/queryValidation';

export default {
    emits: ['close', 'saved'],
    data() {
        return {
            smartFolders: [],
            smartFolderRecommendations: [],
            smartFolderInsightsLoading: false,
            smartFolderInsightsLoaded: false,
            smartFolderInsightsError: null
        };
    },
    created() {
        setAuthToken(this.$store.auth.token);
        this.fetchSmartFolders();
    },
    computed: {
        hasInvalidSmartFolders() {
            return this.smartFolders.some(sf => {
                if (!sf.name || sf.name.trim() === '') return false;
                const { valid } = validateSmartFolderQuery(sf.query || '');
                return !valid;
            });
        }
    },
    methods: {
        async fetchSmartFolders() {
            this.smartFolders = this.$store.data.smartFolders.map(sf => ({
                name: sf.name,
                query: sf.query,
                limitCount: sf.limitCount || 50
            }));
        },
        async fetchSmartFolderInsights() {
            try {
                this.smartFolderInsightsLoading = true;
                this.smartFolderInsightsError = null;
                const resp = await fetchSmartFolderInsights();

                console.log('Smart Folder Insights response:', resp.data);

                this.smartFolderRecommendations =
                    resp.data?.recommendations?.smartFolders || [];
            } catch (err) {
                console.error('Failed to fetch smart folder insights:', err);
                this.smartFolderInsightsError = 'Failed to load smart folder insights. Please try again.';
            }
            this.smartFolderInsightsLoading = false;
            this.smartFolderInsightsLoaded = true;
        },
        applySmartFolderRecommendation(rec) {
            if (!rec || !rec.name || !rec.query) return;

            // Avoid duplicates by query
            const exists = this.smartFolders.some(
                sf => sf.query.trim() === rec.query.trim()
            );

            if (exists) {
                alert('This Smart Folder already exists.');
                return;
            }

            this.smartFolders.push({
                name: rec.name,
                query: rec.query,
                limitCount: 50
            });
        },
        addSmartFolder() {
            this.smartFolders.push({
                name: '',
                query: '',
                limitCount: 50
            });
        },
        removeSmartFolder(index) {
            this.smartFolders.splice(index, 1);
        },
        isSmartFolderQueryInvalid(smartFolder) {
            const { valid } = validateSmartFolderQuery(smartFolder?.query || '');
            return !valid;
        },
        smartFolderQueryError(smartFolder) {
            const { error } = validateSmartFolderQuery(smartFolder?.query || '');
            return error;
        },
        async save() {
            try {
                // Persist smart folders to the server
                const filteredSmartFolders = this.smartFolders.filter(sf => sf && sf.name && sf.name.trim() !== '');
                const resp = await saveSmartFolders(filteredSmartFolders);
                console.log('Smart folders saved:', resp.data);
                
                // Refresh smart folders from the server
                await this.$store.data.fetchSmartFolders();
                
                this.$emit('saved');
                this.$emit('close');
            } catch (err) {
                console.error('Error saving smart folders:', err);
                alert('Failed to save smart folders. Please try again.');
            }
        }
    }
};
</script>
