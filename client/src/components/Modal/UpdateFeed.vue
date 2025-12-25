<template>
  <div class="modal" tabindex="-1" role="dialog">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Update feed</h5>
        </div>

        <div class="modal-body">
          <!-- Feed name -->
          <div class="form-group row">
            <label class="col-sm-3 col-form-label">Feed name</label>
            <div class="col-sm-9">
              <input
                class="form-control"
                type="text"
                placeholder="Feed name"
                v-model="feed.feedName"
              />
            </div>
          </div>

          <!-- RSS URL (only visible when feed has errors) -->
          <div class="form-group row" v-if="feed.errorCount > 0">
            <label class="col-sm-3 col-form-label">Feed URL</label>
            <div class="col-sm-9">
              <input
                class="form-control"
                type="text"
                placeholder="Feed RSS Url"
                v-model="feed.rssUrl"
              />
            </div>
          </div>

          <!-- Rediscover RSS -->
          <div class="form-group row" v-if="feed.errorCount > 0 && $store.data.currentSelection.AIEnabled">
            <div class="col-sm-3"></div>
            <div class="col-sm-9">
              <button
                class="btn btn-warning btn-sm"
                :disabled="rediscovering"
                @click="rediscoverRss"
              >
                {{ rediscovering ? 'Searching…' : 'Rediscover RSS feed using AI' }}
              </button>
            </div>
          </div>

          <!-- Rediscovery result -->
          <div class="form-group row" v-if="rediscoveredRss && $store.data.currentSelection.AIEnabled">
            <label class="col-sm-3 col-form-label">Suggestion</label>
            <div class="col-sm-9">
              <div class="alert alert-info mb-0 py-2">
                <small>
                  <strong>Confidence:</strong> {{ rediscoveredRss.confidence }}%
                </small>
                <br />
                <small>{{ rediscoveredRss.reason }}</small>
              </div>
            </div>
          </div>

          <!-- Description & category -->
          <div v-if="$store.data.categories.length > 0">
            <div class="form-group row">
              <label class="col-sm-3 col-form-label">Feed description</label>
              <div class="col-sm-9">
                <input
                  class="form-control"
                  type="text"
                  placeholder="Feed description"
                  v-model="feed.feedDesc"
                />
              </div>
            </div>

            <div class="form-group row">
              <label class="col-sm-3 col-form-label">Category</label>
              <div class="col-sm-9">
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
            </div>
          </div>

          <!-- Error info -->
          <div class="form-group row" v-if="feed.errorCount > 0 && feed.errorMessage">
            <label class="col-sm-3 col-form-label text-danger">Error</label>
            <div class="col-sm-9">
              <div class="alert alert-danger mb-0 py-2">
                <small><strong>Error count:</strong> {{ feed.errorCount }}</small><br>
                <small>{{ feed.errorMessage }}</small>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" @click="updateFeed">
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
import axios from 'axios';
import helper from '../../services/helper.js';

export default {
  name: 'UpdateFeed',

  data() {
    return {
      feed: {},
      rediscovering: false,
      rediscoveredRss: null
    };
  },

  created() {
    axios.defaults.headers.common['Authorization'] =
      `Bearer ${this.$store.auth.token}`;

    // Clone selected feed
    this.feed = JSON.parse(JSON.stringify(this.selectedFeed));
  },

  methods: {
    async rediscoverRss() {
      if (!this.$store.data.currentSelection.AIEnabled) {
        return false
      }
      this.rediscovering = true;
      this.rediscoveredRss = null;

      try {
        const result = await axios.post(
          `${import.meta.env.VITE_VUE_APP_HOSTNAME}/api/feeds/${this.feed.id}/rediscover-rss`
        );

        this.rediscoveredRss = result.data;

        if (result.data.suggestedRssUrl) {
          this.feed.rssUrl = result.data.suggestedRssUrl;
        }
      } catch (err) {
        console.error('RSS rediscovery failed:', err);
        alert('Could not rediscover RSS feed.');
      } finally {
        this.rediscovering = false;
      }
    },

    async updateFeed() {
      const selectedCategoryId = this.feed.categoryId;
      const currentCategoryId = this.selectedFeed.categoryId;

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
        const result = await axios.put(
          `${import.meta.env.VITE_VUE_APP_HOSTNAME}/api/feeds/${this.feed.id}`,
          {
            feedName: this.feed.feedName,
            feedDesc: this.feed.feedDesc,
            categoryId: selectedCategoryId,
            rssUrl: this.feed.rssUrl
          }
        );

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
  },

  computed: {
    selectedFeed() {
      return helper.findArrayById(
        this.selectedCategory.feeds,
        this.$store.data.getSelectedFeedId
      );
    },
    selectedCategory() {
      return helper.findArrayById(
        this.$store.data.categories,
        this.$store.data.getSelectedCategoryId
      );
    }
  }
};
</script>

<style>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  max-width: 600px;
  width: 100%;
}

.row {
  margin-bottom: 5px;
}

.alert-danger,
.alert-info {
  margin-left: 20px;
  margin-right: 10px;
}

select.form-select, button.btn.btn-warning.btn-sm {
  margin-left: 20px;
}
</style>
