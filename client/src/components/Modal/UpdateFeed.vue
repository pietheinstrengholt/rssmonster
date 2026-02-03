<template>
  <div class="modal" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Update feed</h5>
          <button
            type="button"
            class="btn-close"
            @click="$store.data.setShowModal('')"
          ></button>
        </div>

        <div class="modal-body">
          <div class="alert alert-info mb-3">
            <small>Update your feed settings below. Changes are saved immediately when you click the Update button.</small>
          </div>
          <form @submit.prevent>
            <!-- Feed name -->
            <div class="mb-3">
              <label class="form-label">Feed name</label>
              <input
                type="text"
                class="form-control"
                placeholder="Feed name"
                v-model="feed.feedName"
              />
            </div>

            <!-- Feed URL (only when errors) -->
            <div class="mb-3" v-if="(feed.errorSince || feed.status === 'error') && $store.data.currentSelection.AIEnabled">
              <label class="form-label">Feed URL</label>
              <input
                type="text"
                class="form-control"
                placeholder="Feed URL"
                v-model="feed.url"
              />
              <div class="form-text">
                This feed has errors. You can update the URL or rediscover it.
              </div>
            </div>

            <!-- Rediscover RSS -->
            <div class="mb-3" v-if="(feed.errorSince || feed.status === 'error') && $store.data.currentSelection.AIEnabled">
              <button
                type="button"
                class="btn btn-warning btn-sm"
                :disabled="rediscovering"
                @click="rediscoverRss"
              >
                {{ rediscovering ? 'Searching…' : 'Rediscover RSS feed using AI' }}
              </button>
            </div>

            <!-- Rediscovery result -->
            <div
              class="mb-3"
              v-if="rediscoveredRss && $store.data.currentSelection.AIEnabled"
            >
              <div v-if="rediscoveredRss.url" class="alert alert-info">
                <div class="fw-semibold mb-1">
                  Suggested feed found
                </div>
                <small class="d-block">
                  <strong>Confidence:</strong> {{ rediscoveredRss.confidence }}%
                </small>
                <small>{{ rediscoveredRss.reason }}</small>
              </div>
              <div v-else class="alert alert-warning">
                <div class="fw-semibold mb-1">
                  No feed found
                </div>
                <small class="d-block">
                  <strong>Confidence:</strong> {{ rediscoveredRss.confidence }}%
                </small>
                <small>{{ rediscoveredRss.reason }}</small>
              </div>
            </div>

            <!-- Description -->
            <div
              class="mb-3"
              v-if="$store.data.categories.length > 0"
            >
              <label class="form-label">Feed description</label>
              <input
                type="text"
                class="form-control"
                placeholder="Optional description"
                v-model="feed.feedDesc"
              />
            </div>

            <!-- Category -->
            <div
              class="mb-3"
              v-if="$store.data.categories.length > 0"
            >
              <label class="form-label">Category</label>
              <select
                class="form-select"
                v-model="feed.categoryId"
              >
                <option
                  v-for="category in $store.data.categories"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>
            </div>

            <!-- Status -->
            <div
              class="mb-3"
              v-if="$store.data.categories.length > 0"
            >
              <label class="form-label">Status</label>
              <select
                class="form-select"
                v-model="feed.status"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <!-- Error info -->
            <div
              class="mb-3"
              v-if="feed.errorCount > 0 && feed.errorMessage"
            >
              <div class="alert alert-danger">
                <div class="fw-semibold mb-1">
                  Feed error
                </div>
                <small class="d-block">
                  <strong>Error count:</strong> {{ feed.errorCount }}
                </small>
                <small>{{ feed.errorMessage }}</small>
              </div>
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <button
            class="btn btn-primary"
            @click="updateFeed"
          >
            Update feed
          </button>
          <button
            class="btn btn-secondary"
            @click="$store.data.setShowModal('')"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { rediscoverRss, updateFeed } from '../../api/feeds';
import { setAuthToken } from '../../api/client';
import helper from '../../services/helper.js';

export default {
  name: 'UpdateFeed',

  data() {
    return {
      feed: {},
      originalFeed: {}, // Store the original feed to track changes
      rediscovering: false,
      rediscoveredRss: null
    };
  },

  created() {
    setAuthToken(this.$store.auth.token);
  },

  watch: {
    '$store.data.categories': {
      handler() {
        this.initializeFeed();
      },
      deep: true,
      immediate: true
    },
    '$store.data.currentSelection.feedId': {
      handler() {
        this.initializeFeed();
      },
      immediate: true
    }
  },

  methods: {
    initializeFeed() {
      const feedId = Number(this.$store.data.currentSelection.feedId);
      
      // Search through all categories to find the feed
      for (const category of this.$store.data.categories) {
        const feed = category.feeds?.find(f => f.id === feedId);
        if (feed) {
          this.feed = JSON.parse(JSON.stringify(feed));
          this.originalFeed = JSON.parse(JSON.stringify(feed)); // Store original for comparison
          return;
        }
      }
      console.log('Feed not found for feedId:', feedId);
    },

    async rediscoverRss() {
      if (!this.$store.data.currentSelection.AIEnabled) {
        return false
      }
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
          alert('Could not rediscover RSS feed.');
        }
      } finally {
        this.rediscovering = false;
      }
    },

    async updateFeed() {
      const selectedCategoryId = this.feed.categoryId;
      const currentCategoryId = this.originalFeed.categoryId;

      const currentIndexCategory =
        helper.findIndexById(this.$store.data.categories, currentCategoryId);
      const currentIndexFeed =
        helper.findIndexById(
          this.$store.data.categories[currentIndexCategory].feeds,
          this.feed.id
        );
      const newIndexCategory =
        helper.findIndexById(this.$store.data.categories, selectedCategoryId);

      try {
        const result = await updateFeed(this.feed.id, {
          feedName: this.feed.feedName,
          feedDesc: this.feed.feedDesc,
          categoryId: selectedCategoryId,
          url: this.feed.url,
          status: this.feed.status
        });

        if (currentIndexFeed === -1 || currentIndexCategory === -1) {
          console.log('Store update failed');
          return;
        }

        const updatedFeed = result.data.feed;

        Object.assign(
          this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed],
          updatedFeed,
          { errorCount: 0 }
        );

        if (currentCategoryId !== updatedFeed.categoryId) {
          this.$store.data.categories[newIndexCategory].feeds.push(
            this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed]
          );

          this.$store.data.categories[currentIndexCategory].feeds.splice(
            currentIndexFeed,
            1
          );

          this.$store.data.setSelectedCategoryId(updatedFeed.categoryId);
        }

        this.$store.data.setShowModal('');
      } catch (error) {
        console.error('Update feed failed:', error);
        this.$store.data.setShowModal('');
      }
    }
  }
};
</script>

<style>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.modal-content {
  border-radius: 0.5rem;
}

.form-label {
  font-weight: 500;
}
</style>