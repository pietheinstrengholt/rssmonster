<template>
  <div class="onboarding">
    <header class="onboarding__header">
      <div class="onboarding__icon" aria-hidden="true">
        <BootstrapIcon icon="rss-fill" />
      </div>
      <div>
        <p class="onboarding__eyebrow">Quick setup</p>
        <h2>Welcome to RSSMonster</h2>
        <p class="onboarding__intro">
          We’ll add a few high-quality feeds so you can explore
          Smart Folders, recommended ranking, and clustering.
        </p>
      </div>
    </header>

    <section class="onboarding__selection" aria-labelledby="starter-feeds-heading">
      <div class="onboarding__section-heading">
        <div>
          <h3 id="starter-feeds-heading">Choose your starter feeds</h3>
          <p>You can add, remove, or reorganize feeds at any time.</p>
        </div>
      </div>

      <ul class="onboarding__feed-list">
        <li
          v-for="feed in feeds"
          :key="feed.url"
          class="onboarding__feed-item"
        >
          <label class="onboarding__feed-option" :for="`feed-${feed.url}`">
            <input
              type="checkbox"
              v-model="feed.selected"
              :id="`feed-${feed.url}`"
            />
            <span class="onboarding__feed-copy">
              <span class="onboarding__feed-title">{{ feed.title }}</span>
              <span class="onboarding__feed-category">{{ feed.category }}</span>
            </span>
          </label>
        </li>
      </ul>
    </section>

    <div
      v-if="setupMessage"
      class="onboarding__message"
      :class="`onboarding__message--${setupMessageType}`"
      role="alert"
    >
      {{ setupMessage }}
    </div>

    <div class="actions">
      <button type="button" class="onboarding__start" :disabled="setupPending" @click="start">
        {{ setupPending ? 'Adding selected feeds…' : 'Start with selected feeds' }}
        <BootstrapIcon v-if="!setupPending" icon="arrow-right" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  box-sizing: border-box;
  width: min(100%, 1080px);
  margin: 0 auto;
  padding: 48px 40px 64px;
  color: var(--text-primary);
}

.onboarding__header {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.onboarding__icon {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--settings-orange-bg);
  color: var(--color-brand);
  font-size: 21px;
}

.onboarding__eyebrow {
  margin: 1px 0 4px;
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.onboarding h2 {
  margin: 0;
  font-size: clamp(24px, 3vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.onboarding__intro {
  max-width: 680px;
  margin: 9px 0 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.55;
}

.onboarding__selection {
  margin-top: 36px;
}

.onboarding__section-heading h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.onboarding__section-heading p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.onboarding__feed-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.onboarding__feed-option {
  display: flex;
  min-height: 64px;
  gap: 12px;
  align-items: center;
  padding: 11px 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.onboarding__feed-option:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.onboarding__feed-option:has(input:checked) {
  border-color: var(--border-selected);
  background: var(--color-primary-soft);
}

.onboarding__feed-option input {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--color-primary);
}

.onboarding__feed-option:has(input:focus-visible) {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.onboarding__feed-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.onboarding__feed-title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onboarding__feed-category {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.onboarding__message {
  margin-top: 20px;
  padding: 11px 13px;
  border: 1px solid var(--border-danger);
  border-radius: 8px;
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
  font-size: 13px;
}

.onboarding__message--warning {
  border-color: var(--border-warning);
  background: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.onboarding__start {
  display: inline-flex;
  min-height: 40px;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--text-inverted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.onboarding__start:hover:not(:disabled) {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
}

.onboarding__start:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.onboarding__start:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:global(:root[data-theme='dark'] .onboarding__feed-option:has(input:checked)) {
  border-color: var(--border-selected);
  background: var(--color-primary-surface-dark);
}

@media (min-width: 880px) {
  .onboarding {
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: 48px max(40px, calc(50% - 500px)) 64px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
}

@media (max-width: 767px) {
  .onboarding {
    padding: 32px 20px 48px;
  }

  .onboarding__header {
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 13px;
  }

  .onboarding__icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    font-size: 18px;
  }

  .onboarding__selection {
    margin-top: 30px;
  }

  .onboarding__feed-list {
    grid-template-columns: 1fr;
  }

  .actions {
    justify-content: stretch;
  }

  .onboarding__start {
    width: 100%;
  }
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
