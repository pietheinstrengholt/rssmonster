<template>
  <div class="onboarding">
    <h2>Welcome to RSSMonster</h2>

    <div class="alert alert-info mb-3">
      <p class="mb-2">
        We’ll add a few high-quality feeds so you can explore
        Smart Folders, importance ranking, and clustering.
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

    <div class="actions">
      <button class="btn btn-primary" @click="start">
        Start with selected feeds
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
import axios from "axios";

export default {
  name: "InitialFeeds",

  created() {
    axios.defaults.headers.common["Authorization"] =
      `Bearer ${this.$store.auth.token}`;
  },

  data() {
    return {
      feeds: [
        {
          title: "Reuters - World News",
          url: "https://www.reuters.com/rssFeed/worldNews",
          category: "World News",
          selected: true
        },
        {
          title: "Reuters - Technology",
          url: "https://www.reuters.com/rssFeed/technologyNews",
          category: "World News",
          selected: true
        },
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
        }
      ]
    };
  },

  methods: {
    async start() {
      await this.createCategoriesFromSelectedFeeds();
      await this.createFeedsFromSelectedFeeds();
      this.$emit("completed");
    },

    async createCategoriesFromSelectedFeeds() {
      const requiredCategories = [
        ...new Set(
          this.feeds
            .filter(feed => feed.selected)
            .map(feed => feed.category)
        )
      ];

      const existingNames = this.$store.data.categories.map(c => c.name);
      const hostname = import.meta.env.VITE_VUE_APP_HOSTNAME;

      for (const name of requiredCategories) {
        if (existingNames.includes(name)) continue;

        try {
          const result = await axios.post(
            `${hostname}/api/categories`,
            { name }
          );

          const category = result.data;

          category.unreadCount = 0;
          category.readCount = 0;
          category.starCount = 0;
          category.feeds = [];

          this.$store.data.categories.push(category);

        } catch (err) {
          console.error("Failed to create category:", name, err);
        }
      }
    },

    async createFeedsFromSelectedFeeds() {
      const hostname = import.meta.env.VITE_VUE_APP_HOSTNAME;

      for (const feed of this.feeds.filter(f => f.selected)) {
        const category = this.$store.data.categories.find(
          c => c.name === feed.category
        );

        if (!category) continue;

        // Prevent duplicate feeds
        const exists = category.feeds.some(f => f.url === feed.url);
        if (exists) continue;

        try {
          const result = await axios.post(
            `${hostname}/api/feeds`,
            {
              categoryId: category.id,
              feedName: feed.title,
              url: feed.url
            }
          );

          const newFeed = result.data.feed ?? result.data;

          // Normalize feed object
          newFeed.unreadCount = 0;
          newFeed.readCount = 0;
          newFeed.starCount = 0;
          newFeed.errorCount = 0;

          category.feeds.push(newFeed);

        } catch (err) {
          console.error("Failed to create feed:", feed.title, err);
        }
      }
    }
  }
};
</script>