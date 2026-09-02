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
                  Base cadence; cache and retry deadlines can delay a fetch.
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

            <!-- Feed item filter -->
            <section class="feed-filter-panel" aria-labelledby="feed-filter-title">
              <header class="feed-filter-header">
                <div class="feed-filter-title-row">
                  <h3 id="feed-filter-title">Item filter</h3>
                </div>
                <p>Only store items that match this filter expression.</p>
              </header>

              <div class="update-feed__field feed-filter-field">
                <label class="app-form-label feed-filter-label" for="feed-item-filter">
                  Filter expression
                  <span class="feed-filter-tooltip">
                    <button
                      type="button"
                      class="feed-filter-tooltip-trigger"
                      aria-label="About item filters"
                      aria-describedby="feed-filter-tooltip-text"
                    >
                      <BootstrapIcon icon="info-circle-fill" aria-hidden="true" />
                    </button>
                    <span id="feed-filter-tooltip-text" class="feed-filter-tooltip-text" role="tooltip">
                      When a filter is set, only items that match the specified filter expression are stored in the database.
                    </span>
                  </span>
                </label>
                <input
                  id="feed-item-filter"
                  v-model="feed.itemFilter"
                  type="text"
                  class="app-form-control"
                  :class="{ 'feed-filter-input--invalid': itemFilterInvalid }"
                  :aria-invalid="itemFilterInvalid ? 'true' : 'false'"
                  :aria-describedby="itemFilterInvalid ? 'feed-item-filter-help feed-item-filter-error' : 'feed-item-filter-help'"
                  placeholder="Example: title:/Hollow Knight|Silksong/i"
                />
                <div id="feed-item-filter-help" class="app-form-help">
                  Use regular expressions to include or exclude items by title, content, URL, author, or category.
                  When empty, all items are accepted.
                </div>
                <div
                  v-if="itemFilterInvalid"
                  id="feed-item-filter-error"
                  class="feed-filter-error"
                  role="alert"
                >
                  {{ itemFilterError }}
                </div>
              </div>

              <div class="feed-filter-help-grid">
                <section>
                  <h4>Examples</h4>
                  <dl>
                    <div><dt><code>/regex/</code></dt><dd>Match title or content</dd></div>
                    <div><dt><code>title:/regex/</code></dt><dd>Match title</dd></div>
                    <div><dt><code>content:/regex/</code></dt><dd>Match content</dd></div>
                    <div><dt><code>!title:/regex/</code></dt><dd>Exclude matching titles</dd></div>
                  </dl>
                </section>
                <section>
                  <h4>Supported fields</h4>
                  <dl>
                    <div><dt><code>title:</code></dt><dd>Item title</dd></div>
                    <div><dt><code>content:</code></dt><dd>Item content</dd></div>
                    <div><dt><code>url:</code></dt><dd>Item URL</dd></div>
                    <div><dt><code>author:</code></dt><dd>Item author</dd></div>
                    <div><dt><code>category:</code></dt><dd>Item category</dd></div>
                  </dl>
                </section>
                <section>
                  <h4>Tips</h4>
                  <ul>
                    <li>Use <code>/.../</code> for regular expressions.</li>
                    <li>Add <code>!</code> in front to exclude matches.</li>
                    <li>Field-specific filters are more precise.</li>
                    <li>Leave empty to accept all items.</li>
                  </ul>
                </section>
              </div>
            </section>

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
        :disabled="isBusy || itemFilterInvalid"
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
import BaseDialog from '../BaseDialog.vue';
import { deleteFeed as deleteFeedAPI, rediscoverRss, updateFeed } from '../../../api/feeds';
import { notifyActionError } from '../../../services/actionNotifications.js';
import { validateItemFilter } from '../../../services/itemFilterValidation.js';

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
        { label: 'Adaptive (publisher activity)', value: null },
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

    ...mapStores(useSelectionStore, useOverviewStore, useUiStore),
    // This function locks incompatible controls while any feed operation is active.
    isBusy() {
      return this.updating || this.deleting || this.rediscovering;
    },
    // This function exposes the current item filter validation result to the form.
    itemFilterValidation() {
      return validateItemFilter(this.feed.itemFilter);
    },
    // This function reports whether the current item filter blocks persistence.
    itemFilterInvalid() {
      return !this.itemFilterValidation.valid;
    },
    // This function returns the current item filter validation message.
    itemFilterError() {
      return this.itemFilterValidation.error;
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
          this.feed.itemFilter = this.feed.itemFilter ?? '';
          this.originalFeed = JSON.parse(JSON.stringify(feed)); // Store original for comparison
          return;
        }
      }
      console.warn('Feed not found for feedId:', feedId);
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
      if (
        this.updating ||
        this.deleting ||
        this.rediscovering ||
        !validateItemFilter(this.feed.itemFilter).valid
      ) return;

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
          applyAiAnalysis: this.feed.applyAiAnalysis,
          itemFilter: this.feed.itemFilter?.trim() ? this.feed.itemFilter : null
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
  background: var(--surface-chrome);
}

.feed-filter-panel {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid var(--border-default);
  border-radius: 0.5rem;
  background: var(--surface-chrome);
}

.feed-filter-header {
  margin-bottom: 1rem;
}

.feed-filter-header p {
  margin: 0.375rem 0 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.feed-filter-title-row,
.feed-filter-label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.feed-filter-title-row h3,
.feed-filter-help-grid h4 {
  margin: 0;
  color: var(--text-primary);
}

.feed-filter-title-row h3 {
  font-size: 1rem;
  font-weight: 700;
}

.feed-filter-tooltip {
  position: relative;
  display: inline-flex;
}

.feed-filter-tooltip-trigger {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: help;
}

.feed-filter-tooltip-trigger :deep(svg) {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.feed-filter-tooltip-trigger:focus-visible {
  border-radius: 0.25rem;
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.feed-filter-tooltip-text {
  position: absolute;
  z-index: 2;
  top: calc(100% + 0.5rem);
  left: 0;
  width: min(18rem, calc(100vw - 4rem));
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-default);
  border-radius: 0.375rem;
  background: var(--surface-card);
  box-shadow: var(--shadow-modal);
  color: var(--text-primary);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-0.25rem);
  transition: opacity 120ms ease, transform 120ms ease;
}

.feed-filter-tooltip:hover .feed-filter-tooltip-text,
.feed-filter-tooltip:focus-within .feed-filter-tooltip-text {
  opacity: 1;
  transform: translateY(0);
}

.feed-filter-field {
  margin-bottom: 1rem;
}

.feed-filter-input--invalid {
  border-color: var(--border-danger);
  background: var(--bg-danger-subtle);
  color: var(--text-danger);
}

.feed-filter-error {
  margin-top: 0.375rem;
  color: var(--text-danger);
  font-size: 0.75rem;
}

.feed-filter-help-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.feed-filter-help-grid h4 {
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
}

.feed-filter-help-grid dl,
.feed-filter-help-grid ul {
  margin: 0;
}

.feed-filter-help-grid dl > div {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.feed-filter-help-grid dt,
.feed-filter-help-grid dd {
  margin: 0;
}

.feed-filter-help-grid ul {
  padding-left: 1rem;
}

.feed-filter-help-grid li + li {
  margin-top: 0.375rem;
}

.feed-filter-help-grid code {
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  background: var(--settings-query-code-bg);
  color: var(--settings-query-code-text);
  font-size: inherit;
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
  background: var(--surface-card);
  border-color: var(--border-subtle);
}

:global(:root[data-theme='dark']) .feed-filter-panel {
  background: var(--surface-card);
  border-color: var(--border-subtle);
}

@media (min-width: 768px) {
  .update-feed__processing-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .feed-filter-help-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
