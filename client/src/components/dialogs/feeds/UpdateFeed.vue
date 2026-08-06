<template>
  <BaseDialog
    size="lg"
    icon="rss-fill"
    show-close
    close-label="Close feed dialog"
    :close-disabled="isBusy"
    @close="closeDialog"
  >
    <template #title>Update feed</template>
    <template #description>Update feed details, processing, and organization.</template>
    <form @submit.prevent>
      <fieldset class="update-feed__fieldset" :disabled="isBusy">
            <!-- Feed name -->
            <div class="update-feed__field">
              <label class="app-form-label" for="update-feed-name">Feed name</label>
              <input
                id="update-feed-name"
                type="text"
                class="app-form-control"
                placeholder="Feed name"
                v-model="feed.feedName"
              />
            </div>

            <!-- Feed URL (only when errors) -->
            <div class="update-feed__field" v-if="(feed.errorSince || feed.status === 'error') && selectionStore.currentSelection.AIEnabled">
              <label class="app-form-label" for="update-feed-url">Feed URL</label>
              <input
                id="update-feed-url"
                type="text"
                class="app-form-control"
                placeholder="Feed URL"
                v-model="feed.url"
              />
              <div class="app-form-help">
                This feed has errors. You can update the URL or rediscover it.
              </div>
            </div>

            <!-- Rediscover RSS -->
            <div class="update-feed__field" v-if="(feed.errorSince || feed.status === 'error') && selectionStore.currentSelection.AIEnabled">
              <button
                type="button"
                class="app-button app-button--warning app-button--compact"
                :disabled="isBusy"
                :aria-busy="rediscovering ? 'true' : 'false'"
                @click="rediscoverRss"
              >
                {{ rediscovering ? 'Searching…' : 'Rediscover RSS feed using AI' }}
              </button>
            </div>

            <!-- Rediscovery result -->
            <div
              class="update-feed__field"
              v-if="rediscoveredRss && selectionStore.currentSelection.AIEnabled"
            >
              <div v-if="rediscoveredRss.url" class="app-notice app-notice--info" role="status">
                <div class="update-feed__notice-title">
                  Suggested feed found
                </div>
                <small class="update-feed__notice-metadata update-feed__notice-confidence">
                  <strong>Confidence:</strong> {{ rediscoveredRss.confidence }}%
                </small>
                <small class="update-feed__notice-metadata">{{ rediscoveredRss.reason }}</small>
              </div>
              <div v-else class="app-notice app-notice--warning" role="status">
                <div class="update-feed__notice-title">
                  No feed found
                </div>
                <small class="update-feed__notice-metadata update-feed__notice-confidence">
                  <strong>Confidence:</strong> {{ rediscoveredRss.confidence }}%
                </small>
                <small class="update-feed__notice-metadata">{{ rediscoveredRss.reason }}</small>
              </div>
            </div>

            <!-- Description -->
            <div
              class="update-feed__field"
              v-if="overviewStore.categories.length > 0"
            >
              <label class="app-form-label" for="update-feed-description">Feed description</label>
              <input
                id="update-feed-description"
                type="text"
                class="app-form-control"
                placeholder="Optional description"
                v-model="feed.feedDesc"
              />
            </div>

            <!-- Category -->
            <div
              class="update-feed__field"
              v-if="overviewStore.categories.length > 0"
            >
              <label class="app-form-label" for="update-feed-category">Category</label>
              <select
                id="update-feed-category"
                class="app-form-select"
                v-model="feed.categoryId"
              >
                <option
                  v-for="category in overviewStore.categories"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>
            </div>

            <!-- Status -->
            <div
              class="update-feed__field"
              v-if="overviewStore.categories.length > 0"
            >
              <label class="app-form-label" for="update-feed-status">Status</label>
              <select
                id="update-feed-status"
                class="app-form-select"
                v-model="feed.status"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <!-- Feed processing controls -->
            <div class="feed-controls-panel">
              <div class="update-feed__field">
                <label class="app-form-label" for="feed-update-interval">
                  Update interval
                </label>
                <select
                  id="feed-update-interval"
                  class="app-form-select"
                  v-model="feed.updateIntervalMinutes"
                >
                  <option
                    v-for="option in updateIntervalOptions"
                    :key="option.label"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <div class="app-form-help">
                  Minimum time between feed fetches.
                </div>
              </div>

              <div class="update-feed__processing-grid">
                <div>
                  <label class="app-form-label" for="feed-generate-embeddings">
                    Generate embeddings
                  </label>
                  <select
                    id="feed-generate-embeddings"
                    class="app-form-select"
                    v-model="feed.generateEmbeddings"
                  >
                    <option :value="true">Yes</option>
                    <option :value="false">No</option>
                  </select>
                  <div class="app-form-help">
                    Whether articles from this feed get vectors.
                  </div>
                </div>

                <div>
                  <label class="app-form-label" for="feed-apply-ai-analysis">
                    Apply AI analysis
                  </label>
                  <select
                    id="feed-apply-ai-analysis"
                    class="app-form-select"
                    v-model="feed.applyAiAnalysis"
                  >
                    <option :value="true">Yes</option>
                    <option :value="false">No</option>
                  </select>
                  <div class="app-form-help">
                    Whether articles get AI summary, tags, sentiment, quality, and ad score.
                  </div>
                </div>
              </div>

              <div class="update-feed__tags-field">
                <label class="app-form-label" for="feed-tags">
                  Feed tags
                </label>
                <input
                  id="feed-tags"
                  type="text"
                  class="app-form-control"
                  placeholder="ai, security, must-read"
                  v-model="feedTagsInput"
                />
                <div class="app-form-help">
                  Separate labels with spaces or commas.
                </div>
              </div>
            </div>

            <!-- Error info -->
            <div
              class="update-feed__field"
              v-if="feed.errorCount > 0 && feed.errorMessage"
            >
              <div class="app-notice app-notice--danger" role="alert">
                <div class="update-feed__notice-title">
                  Feed error
                </div>
                <small class="update-feed__notice-metadata update-feed__notice-confidence">
                  <strong>Error count:</strong> {{ feed.errorCount }}
                </small>
                <small class="update-feed__notice-metadata">{{ feed.errorMessage }}</small>
              </div>
            </div>
      </fieldset>
    </form>

    <template #footer>
      <div class="update-feed__footer">
      <button
        type="button"
        class="app-button app-button--danger base-dialog__button base-dialog__button--danger update-feed__delete"
        :disabled="isBusy"
        :aria-busy="deleting ? 'true' : 'false'"
        @click="deleteFeed"
      >
        {{ deleting ? 'Deleting…' : 'Delete feed' }}
      </button>
      <button
        type="button"
        class="app-button app-button--primary base-dialog__button base-dialog__button--primary update-feed__save"
        :disabled="isBusy"
        :aria-busy="updating ? 'true' : 'false'"
        @click="updateFeed"
      >
        {{ updating ? 'Updating…' : 'Update feed' }}
      </button>
      <button
        type="button"
        class="app-button app-button--secondary base-dialog__button base-dialog__button--secondary update-feed__cancel"
        :disabled="isBusy"
        @click="closeDialog"
      >
        Close
      </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../../store/selection.js';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import { useAuthStore } from '../../../store/auth.js';
import BaseDialog from '../BaseDialog.vue';
import { deleteFeed as deleteFeedAPI, rediscoverRss, updateFeed } from '../../../api/feeds';
import { setAuthToken } from '../../../api/client';
import { notifyActionError } from '../../../services/actionNotifications.js';

export default {
  name: 'UpdateFeed',
  components: {
    BaseDialog
  },
  // This function creates editable feed state and mutually exclusive operation flags.
  data() {
    return {
      feed: {},
      originalFeed: {}, // Store the original feed to track changes
      rediscovering: false,
      rediscoveredRss: null,
      deleting: false,
      updating: false,
      updateIntervalOptions: [
        { label: 'Global setting', value: null },
        { label: 'Every 5 minutes', value: 5 },
        { label: 'Every 15 minutes', value: 15 },
        { label: 'Every 30 minutes', value: 30 },
        { label: 'Every hour', value: 60 },
        { label: 'Every 2 hours', value: 120 },
        { label: 'Every 6 hours', value: 360 },
        { label: 'Every 12 hours', value: 720 },
        { label: 'Once a day', value: 1440 },
        { label: 'Never (manual refresh only)', value: 0 }
      ]
    };
  },
  // This function configures the authenticated API client for feed operations.
  created() {
    setAuthToken(this.authStore.token);
  },

  watch: {
    'overviewStore.categories': {
      // This function refreshes editable state when the feed overview changes.
      handler() {
        this.initializeFeed();
      },
      deep: true,
      immediate: true
    },
    'selectionStore.currentSelection.feedId': {
      // This function refreshes editable state when another feed is selected.
      handler() {
        this.initializeFeed();
      },
      immediate: true
    }
  },

  computed: {

    ...mapStores(useSelectionStore, useOverviewStore, useUiStore, useAuthStore),
    // This function locks incompatible controls while any feed operation is active.
    isBusy() {
      return this.updating || this.deleting || this.rediscovering;
    },
    feedTagsInput: {
      // This function presents stored feed tags as editable comma-separated text.
      get() {
        return Array.isArray(this.feed.feedTags)
          ? this.feed.feedTags.join(', ')
          : '';
      },
      // This function normalizes comma- or whitespace-separated feed tags.
      set(value) {
        this.feed.feedTags = value
          .split(/[\s,]+/)
          .map(tag => tag.trim())
          .filter(Boolean);
      }
    }
  },

  methods: {
    // This function initializes the editable feed from the store.
    initializeFeed() {
      const feedId = Number(this.selectionStore.currentSelection.feedId);
      
      // Search through all categories to find the feed
      for (const category of this.overviewStore.categories) {
        const feed = category.feeds?.find(f => f.id === feedId);
        if (feed) {
          this.feed = JSON.parse(JSON.stringify(feed));
          this.feed.updateIntervalMinutes = this.feed.updateIntervalMinutes ?? null;
          this.feed.feedTags = Array.isArray(this.feed.feedTags) ? this.feed.feedTags : [];
          this.feed.generateEmbeddings = this.feed.generateEmbeddings ?? true;
          this.feed.applyAiAnalysis = this.feed.applyAiAnalysis ?? true;
          this.originalFeed = JSON.parse(JSON.stringify(feed)); // Store original for comparison
          return;
        }
      }
      console.log('Feed not found for feedId:', feedId);
    },

    // This function rediscover RSS feed URL when the selected feed has errors.
    async rediscoverRss() {
      if (
        !this.selectionStore.currentSelection.AIEnabled ||
        this.updating ||
        this.deleting ||
        this.rediscovering
      ) return false;

      this.rediscovering = true;
      this.rediscoveredRss = null;

      try {
        const result = await rediscoverRss(this.feed.id);
        this.rediscoveredRss = result.data;

        if (result.data.suggestedUrl) {
          this.feed.url = result.data.suggestedUrl;
        }
      } catch (err) {
        console.error('RSS rediscovery failed:', err);
        // Check if error response contains feed suggestion data
        if (err.response?.data) {
          this.rediscoveredRss = err.response.data;
        } else {
          notifyActionError('Could not rediscover this feed. Please try again.', err);
        }
      } finally {
        this.rediscovering = false;
      }
    },

    // This function removes a deleted feed from local store state.
    removeFeedFromStore(feedId) {
      return this.overviewStore.removeFeed(feedId);
    },

    // This function deletes the selected feed and clears selection state.
    async deleteFeed() {
      if (
        !this.feed.id ||
        this.updating ||
        this.deleting ||
        this.rediscovering
      ) {
        return;
      }

      if (!window.confirm(`Delete "${this.feed.feedName}" and all related articles?`)) {
        return;
      }

      this.deleting = true;

      try {
        await deleteFeedAPI(this.feed.id);
        this.removeFeedFromStore(this.feed.id);
        this.selectionStore.selectFeed('%');
        this.uiStore.setShowModal('');
      } catch (error) {
        console.error(`Error deleting feed ${this.feed.id}:`, error);
        notifyActionError('Could not delete this feed. Please try again.', error);
      } finally {
        this.deleting = false;
      }
    },

    // This function updates the feed and syncs category changes in the store.
    async updateFeed() {
      if (this.updating || this.deleting || this.rediscovering) return;

      this.updating = true;
      try {
        const result = await updateFeed(this.feed.id, {
          feedName: this.feed.feedName,
          feedDesc: this.feed.feedDesc,
          categoryId: this.feed.categoryId,
          url: this.feed.url,
          status: this.feed.status,
          updateIntervalMinutes: this.feed.updateIntervalMinutes,
          feedTags: this.feed.feedTags,
          generateEmbeddings: this.feed.generateEmbeddings,
          applyAiAnalysis: this.feed.applyAiAnalysis
        });

        const updatedFeed = result.data.feed;
        if (!this.overviewStore.updateFeed({ ...updatedFeed, errorCount: 0 })) {
          console.warn(`Feed ${this.feed.id} was not found in the local overview.`);
        }
        if (String(this.originalFeed.categoryId) !== String(updatedFeed.categoryId)) {
          this.selectionStore.selectFeed(updatedFeed.id, updatedFeed.categoryId);
        }

        this.uiStore.setShowModal('');
      } catch (error) {
        console.error(`Error updating feed ${this.feed.id}:`, error);
        notifyActionError('Could not save this feed. Please try again.', error);
      } finally {
        this.updating = false;
      }
    },

    // This function closes the feed dialog while no operation is active.
    closeDialog() {
      if (this.updating || this.deleting || this.rediscovering) return;

      this.uiStore.setShowModal('');
    }
  }
};
</script>

<style scoped>
.update-feed__fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.update-feed__notice-title {
  margin-bottom: 0.25rem;
  font-weight: 600;
}

.update-feed__notice-metadata {
  font-size: 0.875em;
}

.update-feed__notice-confidence {
  display: block;
}

.update-feed__field {
  margin-bottom: 1rem;
}

.update-feed__processing-grid {
  display: grid;
  gap: 1rem;
}

.update-feed__tags-field {
  margin-top: 1rem;
}

.feed-controls-panel {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid var(--border-default);
  border-radius: 0.5rem;
  background: var(--bg-muted);
}

.update-feed__footer {
  display: flex;
  width: 100%;
  gap: 0.5rem;
  align-items: center;
}

.update-feed__delete {
  margin-right: auto;
}

.update-feed__cancel {
  order: 2;
}

.update-feed__save {
  order: 3;
}

:global(:root[data-theme='dark']) .feed-controls-panel {
  background: var(--bg-card);
  border-color: var(--border-subtle);
}

@media (min-width: 768px) {
  .update-feed__processing-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 575.98px) {
  .update-feed__footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .update-feed__delete {
    width: 100%;
    margin-right: 0;
  }

  .update-feed__cancel,
  .update-feed__save {
    width: 100%;
  }
}
</style>
