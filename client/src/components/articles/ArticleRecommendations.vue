<template>
  <section v-if="visibleArticles.length" class="article-recommendations" aria-labelledby="article-recommendations-title">
    <h2 id="article-recommendations-title" class="article-recommendations__title">You might also like</h2>

    <div class="article-recommendations__grid">
      <button
        v-for="article in visibleArticles"
        :key="article.id"
        type="button"
        class="article-recommendation-card"
        @click="$emit('select', article)"
      >
        <img
          v-if="imageUrl(article)"
          :src="imageUrl(article)"
          class="article-recommendation-card__image"
          alt=""
          loading="lazy"
        />

        <span class="article-recommendation-card__body">
          <span v-if="feedName(article)" class="article-recommendation-card__source">
            {{ feedName(article) }}
          </span>
          <span class="article-recommendation-card__title">{{ article.title }}</span>
          <span v-if="publishedLabel(article)" class="article-recommendation-card__meta">
            {{ publishedLabel(article) }}
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<script>
import { formatRelativeDate } from '../../utils/date.js';
import { usableHttpUrl } from '../../utils/content.js';

export default {
  emits: ['select'],
  props: {
    articles: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    // Caps defensive client rendering at the endpoint's four-article contract.
    visibleArticles() {
      return this.articles.slice(0, 4);
    }
  },
  methods: {
    // Returns a safe optional image URL without introducing placeholder artwork.
    imageUrl(article) {
      return usableHttpUrl(article.imageUrl);
    },
    // Returns the recommendation's source name across API association casing.
    feedName(article) {
      return article.Feed?.feedName || article.feed?.feedName || '';
    },
    // Formats recommendation dates through the shared article date helper.
    publishedLabel(article) {
      return formatRelativeDate(article.publishedAt);
    }
  }
};
</script>

<style scoped>
.article-recommendations {
  margin: 0 24px 40px;
  padding-top: 24px;
}

.article-recommendations__title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 16px;
}

.article-recommendations__grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.article-recommendation-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--text-primary);
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  text-align: left;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
  width: 100%;
}

.article-recommendation-card:hover {
  background: var(--surface-hover);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.article-recommendation-card:focus-visible {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
  outline: none;
}

.article-recommendation-card__image {
  aspect-ratio: 16 / 9;
  display: block;
  object-fit: cover;
  width: 100%;
}

.article-recommendation-card__body {
  display: block;
  padding: 12px 14px 14px;
}

.article-recommendation-card__source {
  color: var(--text-secondary);
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 5px;
}

.article-recommendation-card__title {
  color: var(--text-primary);
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.article-recommendation-card__meta {
  color: var(--text-muted);
  display: block;
  font-size: 12px;
  margin-top: 8px;
}

@media (min-width: 1400px) {
  .article-recommendations__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .article-recommendation-card {
    transition: none;
  }

  .article-recommendation-card:hover {
    transform: none;
  }
}
</style>
