<template>
    <div>
        <h5>Smart Folders</h5>
        <div class="modal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Smart Folders</h5>
                    </div>
                    <div class="modal-body">
                        <!-- Info text -->
                        <div class="alert alert-info mb-3">
                            <p class="mb-2">
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
                                <li><strong>Special filters:</strong> <code>cluster:true</code>, <code>hot:false</code>, <code>limit:100</code></li>
                                <li><strong>Sorting:</strong> <code>sort:IMPORTANCE</code>, <code>sort:QUALITY</code>, <code>sort:ATTENTION</code>, <code>sort:DESC</code>, <code>sort:ASC</code></li>
                            </ul>
                            <p class="mb-2">
                                <strong>Example queries:</strong>
                            </p>
                            <ul class="mb-2 small">
                                <li><code>tag:ai unread:true quality:>0.6</code> – Unread AI articles with high quality</li>
                                <li><code>star:true @"last Monday"</code> – Starred articles from last Monday</li>
                                <li><code>title:javascript @today sort:IMPORTANCE</code> – Today's JavaScript articles by importance</li>
                            </ul>
                            <p class="mb-0">
                                <strong>Limits:</strong> Set a maximum article count (50-500) to keep folders focused and performant.
                            </p>
                        </div>

                        <!-- Smart Folder Recommendations trigger & results -->
                        <div class="settings-group d-flex justify-content-between align-items-center gap-3">
                            <div>
                                <label class="mb-1">Smart Folder Insights</label>
                                <div class="text-muted small">Generate personalized smart folder suggestions on demand.</div>
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
                        <div class="settings-group">
                            <label>
                                Smart Folders
                                <span class="info-icon" :title="'Define smart folders to automatically organize articles based on criteria'">
                                    <BootstrapIcon icon="info-circle-fill" />
                                </span>
                            </label>

                            <div v-for="(smartFolder, index) in smartFolders" :key="index" class="action-row">
                                <div class="action-fields">
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

                                    <div class="form-group">
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

                                    <button
                                        type="button"
                                        class="btn btn-remove"
                                        @click="removeSmartFolder(index)"
                                        :title="'Remove smart folder'"
                                    >
                                        <BootstrapIcon icon="trash-fill" />
                                    </button>
                                </div>
                            </div>

                            <button type="button" class="btn btn-add" @click="addSmartFolder">
                                <BootstrapIcon icon="plus-circle-fill" />
                                Add Smart Folder
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" @click="save" :disabled="hasInvalidSmartFolders">
                            Save
                        </button>
                        <button type="button" class="btn btn-primary" @click="$emit('close')">Back to settings</button>
                    </div>
                </div>
            </div>
        </div>
        <button class="btn btn-secondary" @click="$emit('close')">Close</button>
    </div>
</template>

<style src="../../assets/css/settings.css"></style>
<style scoped>
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-dialog {
    max-width: 90%;
    width: 100%;
}
</style>

<script>
import axios from 'axios';
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
        axios.defaults.headers.common.Authorization = `Bearer ${this.$store.auth.token}`;
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
                const resp = await axios.get(
                    import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/smartfolders/insights"
                );

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
                const resp = await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/smartfolders", {
                    smartFolders: filteredSmartFolders
                });
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
