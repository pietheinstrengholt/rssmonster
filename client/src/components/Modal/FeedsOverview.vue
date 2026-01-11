<template>
  <div>
    <h5>Feeds Overview</h5>
    <!-- Feeds overview modal (placeholder; feed logic to be implemented) -->
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Feeds Overview</h5>
                </div>
                <div class="modal-body">
                    <!-- Info text -->
                    <div class="alert alert-info mb-3">
                        <p class="mb-2">
                            <strong>Feed Management:</strong>
                        </p>
                        <p class="mb-2">
                            Monitor your RSS subscriptions with key metrics: <strong>Trust Score</strong> reflects long-term feed quality and originality, 
                            <strong>Duplication Rate</strong> shows how often content is repeated, and <strong>Article Count</strong> tracks total articles fetched.
                        </p>
                        <p class="mb-0">
                            <strong>OPML:</strong> Export your feeds to back up subscriptions or migrate to other readers. Import OPML files to quickly add multiple feeds at once.
                        </p>
                    </div>

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
                    <button type="button" class="btn btn-primary" @click="$emit('close')">Back to settings</button>
                </div>
            </div>
        </div>
    </div>
    <button class="btn btn-secondary" @click="$emit('close')">Close</button>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
import axios from 'axios';

export default {
    emits: ['close', 'saved'],
    data() {
        return {
            advertisementScore: 100,
            sentimentScore: 100,
            qualityScore: 100,
            scoreOptions: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0],
            actions: [],
            smartFolders: [],
            showFeedsModal: false,
            showActionsModal: false,
            showScoreThresholdsModal: false,
            feeds: [],
            feedsLoading: false,
            feedsError: null,
            smartFolderRecommendations: [],
            smartFolderInsightsLoading: false,
            smartFolderInsightsLoaded: false,
            smartFolderInsightsError: null
        };
    },
    created() {
        this.fetchFeeds();
    },
    methods: {
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
        //TODO: fix edit dialog
        openFeedEdit(feed) {
            if (!feed) return;
            this.$store.data.setSelectedCategoryId(feed.categoryId ?? '%');
            this.$store.data.setSelectedFeedId(feed.id);
            this.$store.data.setShowModal('UpdateFeed');
        }
    },
    computed: {
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