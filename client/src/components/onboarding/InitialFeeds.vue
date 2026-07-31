<template>
  <div class="onboarding">
    <h2>Welcome to RSSMonster</h2>

    <div class="alert alert-info mb-3">
      <p class="mb-2">
        We’ll add a few high-quality feeds so you can explore
        Smart Folders, recommended ranking, and clustering.
      </p>
    </div>

    <ul class="list-group mb-3">
      <li
        v-for="feed in feeds"
        :key="feed.url"
        class="list-group-item d-flex align-items-center"
      >
        <input
          type="checkbox"
          class="form-check-input me-2"
          v-model="feed.selected"
          :id="`feed-${feed.url}`"
        />
        <label class="mb-0" :for="`feed-${feed.url}`">{{ feed.title }}</label>
      </li>
    </ul>

    <div
      v-if="setupMessage"
      class="alert"
      :class="`alert-${setupMessageType}`"
      role="alert"
    >
      {{ setupMessage }}
    </div>

    <div class="actions">
      <button type="button" class="btn btn-primary" :disabled="setupPending" @click="start">
        {{ setupPending ? 'Adding selected feeds…' : 'Start with selected feeds' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  margin-top: 60px;
}
</style>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../store/overview.js';
import { createCategory } from '../../api/categories';
import { createFeed } from '../../api/feeds';
import { isFatalActionError } from '../../services/actionNotifications.js';

export default {
  computed: {
    ...mapStores(useOverviewStore)
  },
  name: "InitialFeeds",
  // This function creates the initial onboarding form state.
  data() {
    return {
        setupMessage: '',
        setupMessageType: 'danger',
        setupPending: false,
        feeds: [
            // Reddit
            {
                title: "Reddit - All",
                url: "https://www.reddit.com/.rss",
                category: "Reddit",
                selected: true
            },
            {
                title: "Reddit - Technology",
                url: "https://www.reddit.com/r/technology/.rss",
                category: "Technology",
                selected: true
            },
            {
                title: "Reddit - Science",
                url: "https://www.reddit.com/r/science/.rss",
                category: "Science",
                selected: true
            },

            // Technology
            {
                title: "Ars Technica",
                url: "https://arstechnica.com/feed/",
                category: "Technology",
                selected: true
            },
            {
                title: "The Verge",
                url: "https://www.theverge.com/rss/index.xml",
                category: "Technology",
                selected: true
            },

            // Development
            {
                title: "Hacker News",
                url: "https://news.ycombinator.com/rss",
                category: "Development",
                selected: true
            },
            {
                title: "Smashing Magazine",
                url: "https://www.smashingmagazine.com/feed/",
                category: "Development",
                selected: true
            },

            // AI & Science
            {
                title: "MIT Technology Review",
                url: "https://www.technologyreview.com/feed/",
                category: "AI & Science",
                selected: true
            },
            {
                title: "IEEE Spectrum",
                url: "https://spectrum.ieee.org/rss/fulltext",
                category: "AI & Science",
                selected: true
            },

            // Games
            {
                title: "Polygon",
                url: "https://www.polygon.com/rss/index.xml",
                category: "Games",
                selected: true
            },
            {
                title: "Rock Paper Shotgun",
                url: "https://www.rockpapershotgun.com/feed",
                category: "Games",
                selected: true
            },

            // Business & Economy
            {
                title: "Financial Times - Technology",
                url: "https://www.ft.com/technology?format=rss",
                category: "Business & Economy",
                selected: true
            },

            // Security & Privacy
            {
                title: "Krebs on Security",
                url: "https://krebsonsecurity.com/feed/",
                category: "Security & Privacy",
                selected: true
            },
            {
                title: "The Hacker News",
                url: "https://feeds.feedburner.com/TheHackersNews",
                category: "Security & Privacy",
                selected: true
            }
        ]
    };
  },

  methods: {
    // This function creates the selected starter data and keeps onboarding open after partial failures.
    async start() {
      if (this.setupPending) return;

      this.setupMessage = '';
      this.setupPending = true;

      try {
        const categoryResult = await this.createCategoriesFromSelectedFeeds();
        if (categoryResult.fatal) return;

        const feedResult = await this.createFeedsFromSelectedFeeds();
        if (feedResult.fatal) return;

        const failedCategoryCount = categoryResult.failedNames.length;
        const failedFeedCount = feedResult.failedTitles.length;

        if (failedCategoryCount || failedFeedCount) {
          const changedCount = categoryResult.createdCount + feedResult.createdCount;
          this.setupMessageType = changedCount > 0 ? 'warning' : 'danger';
          this.setupMessage = this.formatSetupFailureMessage(
            failedCategoryCount,
            failedFeedCount,
            changedCount > 0
          );
          return;
        }

        this.$emit("completed");
      } finally {
        this.setupPending = false;
      }
    },

    // This function creates missing categories and reports recoverable failures for safe retries.
    async createCategoriesFromSelectedFeeds() {
      const requiredCategories = [
        ...new Set(
          this.feeds
            .filter(feed => feed.selected)
            .map(feed => feed.category)
        )
      ];

      const existingNames = this.overviewStore.categories.map(c => c.name);
      const resultSummary = {
        createdCount: 0,
        failedNames: [],
        fatal: false
      };

      for (const name of requiredCategories) {
        if (existingNames.includes(name)) continue;

        try {
          const result = await createCategory(name);

          this.overviewStore.addCategory(result.data);
          existingNames.push(name);
          resultSummary.createdCount += 1;

        } catch (err) {
          console.error(`Error creating onboarding category "${name}":`, err);
          if (isFatalActionError(err)) {
            resultSummary.fatal = true;
            return resultSummary;
          }
          resultSummary.failedNames.push(name);
        }
      }

      return resultSummary;
    },

    // This function creates missing starter feeds and leaves successful additions in retry-safe store state.
    async createFeedsFromSelectedFeeds() {
      const resultSummary = {
        createdCount: 0,
        failedTitles: [],
        fatal: false
      };

      for (const feed of this.feeds.filter(f => f.selected)) {
        const category = this.overviewStore.categories.find(
          c => c.name === feed.category
        );

        if (!category) {
          resultSummary.failedTitles.push(feed.title);
          continue;
        }

        // Prevent duplicate feeds
        const exists = category.feeds.some(f => f.url === feed.url || f.feedUrl === feed.url);
        if (exists) continue;

        try {
          const result = await createFeed({
            categoryId: category.id,
            feedName: feed.title,
            url: feed.url
          });

          const newFeed = result.data.feed ?? result.data;
          this.overviewStore.addFeed(category.id, newFeed);
          resultSummary.createdCount += 1;

        } catch (err) {
          console.error(`Error creating onboarding feed "${feed.title}":`, err);
          if (isFatalActionError(err)) {
            resultSummary.fatal = true;
            return resultSummary;
          }
          resultSummary.failedTitles.push(feed.title);
        }
      }

      return resultSummary;
    },

    // This function summarizes incomplete onboarding without exposing backend details.
    formatSetupFailureMessage(failedCategoryCount, failedFeedCount, hasPartialSuccess) {
      const failures = [];
      if (failedCategoryCount) {
        failures.push(`${failedCategoryCount} ${failedCategoryCount === 1 ? 'category' : 'categories'}`);
      }
      if (failedFeedCount) {
        failures.push(`${failedFeedCount} selected ${failedFeedCount === 1 ? 'feed' : 'feeds'}`);
      }

      const prefix = hasPartialSuccess
        ? 'Some starter content was added, but'
        : 'Setup could not finish because';

      return `${prefix} ${failures.join(' and ')} could not be added. You can retry safely.`;
    }
  }
};
</script>
