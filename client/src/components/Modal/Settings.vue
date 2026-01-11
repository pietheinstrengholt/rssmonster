<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Settings</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" @click="closeModal"></button>
            </div>
            <div class="modal-body">
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

                <div
                    v-if="smartFolderRecommendations.length"
                    class="settings-group"
                >
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

                <!-- Score Thresholds -->
                <div class="settings-group d-flex align-items-center gap-3">
                    <label for="adScore" class="flex-shrink-0 mb-0">
                        Advertisement Score Threshold
                        <span class="info-icon" :title="'Filter out promotional content. 0 = editorial only, 100 = show all including heavy ads/spam'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    <select id="adScore" v-model="advertisementScore" class="form-select flex-grow-1">
                        <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>
                
                <div class="settings-group d-flex align-items-center gap-3">
                    <label for="sentimentScore" class="flex-shrink-0 mb-0">
                        Sentiment Score Threshold
                        <span class="info-icon" :title="'Filter by article tone. 0 = very positive, 50 = neutral, 100 = very negative'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    <select id="sentimentScore" v-model="sentimentScore" class="form-select flex-grow-1">
                        <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>
                
                <div class="settings-group d-flex align-items-center gap-3">
                    <label for="qualityScore" class="flex-shrink-0 mb-0">
                        Quality Score Threshold
                        <span class="info-icon" :title="'Filter by content quality. Lower scores = better depth, accuracy & writing. 0-30 = excellent, 70-100 = poor'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    <select id="qualityScore" v-model="qualityScore" class="form-select flex-grow-1">
                        <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>

                <div class="d-flex gap-3">
                </div>

                <!-- Actions -->
                <div class="settings-group">
                    <label>
                        Actions
                        <span class="info-icon" :title="'Define automated actions based on article content patterns'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    
                    <div v-for="(action, index) in actions" :key="index" class="action-row">
                        <div class="action-fields">
                            <div class="form-group">
                                <label :for="'action-name-' + index" class="small-label">Name</label>
                                <input 
                                    :id="'action-name-' + index"
                                    v-model="action.name" 
                                    type="text" 
                                    class="form-control" 
                                    placeholder="Action name"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label :for="'action-type-' + index" class="small-label">Type</label>
                                <select 
                                    :id="'action-type-' + index"
                                    v-model="action.actionType" 
                                    class="form-select"
                                >
                                    <option value="">Select action type</option>
                                    <option value="delete">Delete article</option>
                                    <option value="star">Set starred</option>
                                    <option value="read">Mark as read</option>
                                    <option value="clicked">Mark as clicked</option>
                                    <option value="advertisement">Mark as advertisement</option>
                                    <option value="badquality">Mark as low quality</option>
                                </select>
                            </div>
                            
                            <div class="form-group form-group-full">
                                <label :for="'action-regex-' + index" class="small-label">Regular Expression</label>
                                <input 
                                    :id="'action-regex-' + index"
                                    v-model="action.regularExpression" 
                                    type="text" 
                                    class="form-control" 
                                    placeholder="e.g., /keyword|phrase/i"
                                />
                            </div>
                            
                            <button 
                                type="button" 
                                class="btn btn-remove" 
                                @click="removeAction(index)"
                                :title="'Remove action'"
                            >
                                <BootstrapIcon icon="trash-fill" />
                            </button>
                        </div>
                    </div>
                    
                    <button type="button" class="btn btn-add" @click="addAction">
                        <BootstrapIcon icon="plus-circle-fill" />
                        Add Action
                    </button>
                </div>

            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="saveSettings" :disabled="hasInvalidSmartFolders">Save</button>
                <button type="button" class="btn btn-secondary" @click="openFeedsModal">Feeds overview</button>
                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="closeModal">Close</button>
            </div>
            </div>
        </div>
    </div>

    <!-- Feeds overview modal (placeholder; feed logic to be implemented) -->
    <div class="modal" tabindex="-1" role="dialog" v-if="showFeedsModal">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Feeds Overview</h5>
                </div>
                <div class="modal-body">
                    <div v-if="feedsLoading">Loading feeds…</div>
                    <div v-else-if="feedsError" class="text-danger">{{ feedsError }}</div>
                    <div v-else>
                        <div class="d-flex gap-3 mb-4">
                            <div class="settings-group flex-grow-1">
                                <label>Export Feeds</label>
                                <button type="button" class="btn btn-download w-100" @click="downloadOpml">
                                    <BootstrapIcon icon="download" />
                                    Download OPML
                                </button>
                            </div>

                            <div class="settings-group flex-grow-1">
                                <label>Import Feeds</label>
                                <input type="file" ref="opmlFileInput" accept=".opml,.xml" style="display: none" @change="handleFileSelect" />
                                <button type="button" class="btn btn-upload w-100" @click="$refs.opmlFileInput.click()">
                                    <BootstrapIcon icon="upload" />
                                    Upload OPML
                                </button>
                            </div>
                        </div>

                        <div v-if="feeds.length === 0">No feeds found.</div>
                        <div v-else class="feeds-table-wrapper">
                            <table class="feeds-table table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                        <th>Articles</th>
                                        <th>Trust</th>
                                        <th>Duplication</th>
                                        <th>Edit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="feed in feeds" :key="feed.id" :class="feedRowClass(feed)">
                                        <td>{{ feed.feedName }}</td>
                                        <td>{{ feed.feedType || '-' }}</td>
                                        <td>{{ feed.status }}</td>
                                        <td>{{ feed.articleCount || 0}}</td>
                                        <td>{{ formatScore(feed.feedTrust) }}</td>
                                        <td>{{ formatScore(feed.feedDuplicationRate) }}</td>
                                        <td>
                                            <button class="btn btn-link p-0" @click="openFeedEdit(feed)">Edit</button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" @click="closeFeedsModal">Back to settings</button>
                </div>
            </div>
        </div>
    </div>
</template>

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
    z-index: 1050;
}

.modal-dialog {
    max-width: 90%;
    width: 100%;
    max-height: calc(100vh - 40px);
    display: flex;
}

.modal-content {
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-height: 100%;
    display: flex;
    flex-direction: column;
}

.modal-header {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
}

.modal-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}

.modal-body {
    padding: 15px;
    overflow-y: auto;
}

.settings-group {
    margin-bottom: 20px;
}

.settings-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    font-size: 14px;
}

.info-icon {
    display: inline-block;
    margin-left: 6px;
    font-size: 14px;
    cursor: help;
    opacity: 0.7;
}

.info-icon:hover {
    opacity: 1;
}

.form-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #dcdee0;
    border-radius: 4px;
    font-size: 14px;
    background-color: #fff;
    cursor: pointer;
}

.form-select:focus {
    outline: none;
    border-color: #2c5aa0;
    box-shadow: 0 0 0 2px rgba(44, 90, 160, 0.1);
}

.modal-footer {
    padding: 15px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
}

.btn-primary {
    background-color: #2c5aa0;
    color: #fff;
}

.btn-primary:hover {
    background-color: #244a85;
}

.btn-secondary {
    background-color: #6c757d;
    color: #fff;
}

.btn-secondary:hover {
    background-color: #5a6268;
}

.btn-download {
    background-color: #28a745;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
}

.btn-download:hover {
    background-color: #218838;
}

.btn-upload {
    background-color: #007bff;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
}

.btn-upload:hover {
    background-color: #0056b3;
}

.action-row {
    margin-bottom: 15px;
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background-color: #f8f9fa;
}

.action-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: start;
}

.form-group {
    display: flex;
    flex-direction: column;
}

.form-group-full {
    grid-column: 1 / -1;
}

.small-label {
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 4px;
    color: #555;
}

.form-control {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #dcdee0;
    border-radius: 4px;
    font-size: 14px;
    background-color: #fff;
}

.form-control:focus {
    outline: none;
    border-color: #2c5aa0;
    box-shadow: 0 0 0 2px rgba(44, 90, 160, 0.1);
}

.input-invalid {
    background-color: #fdecea;
    color: #b71c1c;
    border-color: #f5c6cb;
}

.input-invalid::placeholder {
    color: #d32f2f;
}

.btn-remove {
    background-color: #dc3545;
    color: #fff;
    padding: 6px 10px;
    height: fit-content;
    align-self: end;
    width: 54px;
}

.btn-remove:hover {
    background-color: #c82333;
}

.btn-add {
    background-color: #28a745;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
}

.btn-add:hover {
    background-color: #218838;
}

.feeds-table-wrapper {
    max-height: 60vh;
    overflow-y: auto;
}

.feeds-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.feeds-table th,
.feeds-table td {
    padding: 8px;
    border: 1px solid #e0e0e0;
    vertical-align: top;
}

.feeds-table th {
    background-color: #f5f5f5;
    font-weight: 600;
}

.feeds-table td {
    background-color: #fff;
}

.row-error {
    background-color: #fdecea !important;
    color: #b71c1c !important;
}

.row-error td {
    background-color: #fdecea !important;
    color: #b71c1c !important;
}

.row-disabled {
    background-color: #e0e0e0 !important;
    color: #616161 !important;
}

.row-disabled td {
    background-color: #e0e0e0 !important;
    color: #616161 !important;
}

@media (max-height: 600px) {
    div.modal-dialog {
        margin-top: 140px;
    }
}

@media (prefers-color-scheme: dark) {
    .modal-content {
        background: #2a2a2a;
        color: #fff;
    }

    .modal-header,
    .modal-footer {
        border-color: #444;
    }

    .form-select {
        background-color: #3a3a3a;
        color: #fff;
        border-color: #555;
    }

    .form-select:focus {
        border-color: #4a7fc7;
        box-shadow: 0 0 0 2px rgba(74, 127, 199, 0.2);
    }

    .action-row {
        background-color: #3a3a3a;
        border-color: #555;
    }

    .small-label {
        color: #ccc;
    }

    .form-control {
        background-color: #3a3a3a;
        color: #fff;
        border-color: #555;
    }

    .form-control:focus {
        border-color: #4a7fc7;
        box-shadow: 0 0 0 2px rgba(74, 127, 199, 0.2);
    }

    .input-invalid {
        background-color: #4a1f1f;
        color: #ffbaba;
        border-color: #d77;
    }

    .input-invalid::placeholder {
        color: #ffbaba;
    }

    .feeds-table th {
        background-color: #333;
    }

    .feeds-table td {
        background-color: #2a2a2a;
    }

    .row-error {
        background-color: #4a1f1f !important;
        color: #ffbaba !important;
    }

    .row-error td {
        background-color: #4a1f1f !important;
        color: #ffbaba !important;
    }

    .row-disabled {
        background-color: #3a3a3a !important;
        color: #999 !important;
    }

    .row-disabled td {
        background-color: #3a3a3a !important;
        color: #999 !important;
    }
}
</style>

<script>
import axios from 'axios';
import { validateSmartFolderQuery } from '../../services/queryValidation.js';

export default {
    name: 'Settings',
    emits: ['close', 'forceReload'],
    created() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
        // Initialize dropdowns from store currentSelection values
        const sel = this.$store.data.currentSelection || {};
        if (typeof sel.minAdvertisementScore !== 'undefined') {
            this.advertisementScore = sel.minAdvertisementScore;
        }
        if (typeof sel.minSentimentScore !== 'undefined') {
            this.sentimentScore = sel.minSentimentScore;
        }
        if (typeof sel.minQualityScore !== 'undefined') {
            this.qualityScore = sel.minQualityScore;
        }
        // Fetch existing actions and smart folders for this user
        this.fetchActions();
        this.fetchSmartFolders();
    },
    data() {
        return {
            advertisementScore: 100,
            sentimentScore: 100,
            qualityScore: 100,
            scoreOptions: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0],
            actions: [],
            smartFolders: [],
            showFeedsModal: false,
            feeds: [],
            feedsLoading: false,
            feedsError: null,
            smartFolderRecommendations: [],
            smartFolderInsightsLoading: false,
            smartFolderInsightsLoaded: false,
            smartFolderInsightsError: null
        };
    },
    methods: {
        async fetchActions() {
            try {
                const resp = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/actions");
                if (resp && resp.data && Array.isArray(resp.data.actions)) {
                    this.actions = resp.data.actions.map(a => ({
                        name: a.name || '',
                        actionType: a.actionType || '',
                        regularExpression: a.regularExpression || ''
                    }));
                }
            } catch (err) {
                console.error('Failed to fetch actions:', err);
            }
        },
        async fetchSmartFolders() {
            try {
                const resp = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/smartfolders");
                if (resp && resp.data && Array.isArray(resp.data.smartFolders)) {
                    this.smartFolders = resp.data.smartFolders.map(sf => ({
                        name: sf.name || '',
                        query: sf.query || '',
                        limitCount: sf.limitCount || 50
                    }));
                }
            } catch (err) {
                console.error('Failed to fetch smart folders:', err);
            }
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
        addAction() {
            this.actions.push({
                name: '',
                actionType: '',
                regularExpression: ''
            });
        },
        removeAction(index) {
            this.actions.splice(index, 1);
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
        openFeedsModal() {
            this.fetchFeeds();
            this.showFeedsModal = true;
        },
        closeFeedsModal() {
            this.showFeedsModal = false;
        },
        async fetchFeeds() {
            try {
                this.feedsLoading = true;
                this.feedsError = null;
                const resp = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds");
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
            const status = (feed?.status || '').toLowerCase();
            if (status === 'error') return 'row-error';
            if (status === 'disabled') return 'row-disabled';
            return '';
        },
        openFeedEdit(feed) {
            if (!feed) return;
            this.$store.data.setSelectedCategoryId(feed.categoryId ?? '%');
            this.$store.data.setSelectedFeedId(feed.id);
            this.$store.data.setShowModal('UpdateFeed');
        },
        saveSettings() {
            // Persist actions to the server
            const filteredActions = this.actions.filter(a => a && a.actionType && a.actionType.trim() !== '');
            axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/actions", {
                actions: filteredActions
            })
            .then(resp => {
                console.log('Actions saved:', resp.data);
            })
            .catch(err => {
                console.error('Error saving actions:', err);
                alert('Failed to save actions. Please try again.');
            });

            // Persist smart folders to the server
            const filteredSmartFolders = this.smartFolders.filter(sf => sf && sf.name && sf.name.trim() !== '');
            axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/smartfolders", {
                smartFolders: filteredSmartFolders
            })
            .then(resp => {
                console.log('Smart folders saved:', resp.data);
            })
            .catch(err => {
                console.error('Error saving smart folders:', err);
                alert('Failed to save smart folders. Please try again.');
            });

            axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/setting", {
                minAdvertisementScore: this.advertisementScore,
                minSentimentScore: this.sentimentScore,
                minQualityScore: this.qualityScore
            })
            .then(response => {
                console.log('Settings saved successfully:', response.data);
                // Update store currentSelection before closing
                if (this.$store && this.$store.data) {
                    if (typeof this.$store.data.setMinAdvertisementScore === 'function') {
                        this.$store.data.setMinAdvertisementScore(this.advertisementScore);
                    } else {
                        this.$store.data.currentSelection.minAdvertisementScore = this.advertisementScore;
                    }
                    if (typeof this.$store.data.setMinSentimentScore === 'function') {
                        this.$store.data.setMinSentimentScore(this.sentimentScore);
                    } else {
                        this.$store.data.currentSelection.minSentimentScore = this.sentimentScore;
                    }
                    if (typeof this.$store.data.setMinQualityScore === 'function') {
                        this.$store.data.setMinQualityScore(this.qualityScore);
                    } else {
                        this.$store.data.currentSelection.minQualityScore = this.qualityScore;
                    }
                }
                this.$emit('forceReload');
                this.closeModal();
            })
            .catch(error => {
                console.error('Error saving settings:', error);
                alert('Failed to save settings. Please try again.');
            });
        },
        closeModal() {
            this.$emit('close');
        },
        async downloadOpml() {
            try {
                const response = await axios.get(
                    import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/opml/export",
                    { responseType: 'blob' }
                );
                
                // Create blob link to download
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'feeds.opml');
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error downloading OPML:', error);
                alert('Failed to download OPML file. Please try again.');
            }
        },
        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.uploadOpml(file);
            }
        },
        async uploadOpml(file) {
            try {
                const formData = new FormData();
                formData.append('opmlFile', file);

                const response = await axios.post(
                    import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/opml/import",
                    formData,
                    {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    }
                );

                console.log('OPML import result:', response.data);
                alert(`Import completed!\nCategories created: ${response.data.categoriesCreated}\nFeeds created: ${response.data.feedsCreated}`);
                
                // Reset file input
                this.$refs.opmlFileInput.value = '';
                
                // Trigger reload to show new feeds/categories
                this.$emit('forceReload');
            } catch (error) {
                console.error('Error uploading OPML:', error);
                alert('Failed to upload OPML file. Please try again.');
                // Reset file input
                this.$refs.opmlFileInput.value = '';
            }
        }
    },
    computed: {
        hasInvalidSmartFolders() {
            return this.smartFolders.some(sf => {
                if (!sf.name || sf.name.trim() === '') return false;
                const { valid } = validateSmartFolderQuery(sf.query || '');
                return !valid;
            });
        },
        formatScore() {
            return (value) => {
                if (value === null || value === undefined) return '-';
                const num = Number(value);
                if (Number.isNaN(num)) return '-';
                const pct = num * 100;
                return `${pct.toFixed(0)}%`;
            };
        }
    }
};
</script>
