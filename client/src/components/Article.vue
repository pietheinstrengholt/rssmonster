<template>
  <div class="article-card" :id="`article-${id}`" :class="{ 'cluster-article': isClusterArticle }" v-bind="filteredAttrs">
    <div class="article-body" :class="[{ starred: starInd === 1, hot: hotInd === 1 }, isUnread && predictedAffinity ? `affinity-${predictedAffinity}` : '']" @click="articleTouched($event)">
      <div class="article-layout">
        <ArticleHeader :url="url" :title="title" :clickedAmount="clickedAmount" :starInd="starInd" :hotInd="hotInd" :hasInterestScore="hasInterestScore" :isEventClusterView="isEventClusterView" :clusterCountTotal="clusterCountTotal" @article-clicked="articleClicked" @toggle-favorite="markAsFavorite" @not-interested="markNotInterested" @more-like-this="moreLikeThis" @less-like-this="lessLikeThis" @ignore-topic="ignoreTopic" @mute-feed="muteFeedSevenDays" />
        <div class="meta-row">
          <ArticleMeta :published="published" :feed="feed" :author="author" :cluster="cluster" :clusterCountTotal="clusterCountTotal" :clusterView="$store.data.currentSelection.clusterView" :ruleTags="ruleTags" :isMobilePortrait="isMobilePortrait" :quality="quality" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :neutralScore="NEUTRAL_SCORE" :formatDate="formatDate" :mainURL="mainURL" :getQualityIcon="getQualityIcon" :getQualityClass="getQualityClass" :getSentimentClass="getSentimentClass" :scoreLabel="scoreLabel" @select-category="selectCategory" @select-tag="selectTag" @view-cluster-articles="viewClusterArticles" />
          <ArticleTagsScores v-if="$store.data.currentSelection.viewMode !== 'minimal'" :categoryName="categoryName" :tags="tags || []" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :qualityScore="qualityScore" :neutralScore="NEUTRAL_SCORE" :scoreLabel="scoreLabel" :showQuality="quality !== undefined && roundedQuality !== NEUTRAL_SCORE" :showAdvertisement="advertisementScore !== undefined && advertisementScore < NEUTRAL_SCORE" :showSentiment="sentimentScore !== undefined && sentimentScore !== NEUTRAL_SCORE" :showWritingQuality="qualityScore !== undefined && qualityScore !== NEUTRAL_SCORE" @select-category="selectCategory" @select-tag="selectTag" />
        </div>
      </div>
      <ArticleContent :viewMode="$store.data.currentSelection.viewMode" :contentOriginal="contentOriginal" :imageUrl="imageUrl" :contentSummaryBullets="contentSummaryBullets" :visibleBulletCount="visibleBulletCount" :shouldShowImage="shouldShowImage" :showMinimalContent="showMinimalContent" />
    </div>
    <div class="article-divider"></div>
  </div>
</template>

<script>
import {
  markWithStar,
  markClicked,
  markNotInterested,
  markMoreLikeThis
} from '../api/articles';

import { muteFeed } from '../api/feeds';
import { fetchClusterArticles } from '../api/clusters';
import ArticleHeader from './articles/ArticleHeader.vue';
import ArticleMeta from './articles/ArticleMeta.vue';
import ArticleTagsScores from './articles/ArticleTagsScores.vue';
import ArticleContent from './articles/ArticleContent.vue';

const NEUTRAL_SCORE = 70;

// This function formats elapsed time for article publication dates.
function timeDifference(current, previous) {
  const msPerMinute = 60 * 1000;
  const msPerHour = msPerMinute * 60;
  const msPerDay = msPerHour * 24;
  const msPerMonth = msPerDay * 30;
  const msPerYear = msPerDay * 365;
  const elapsed = Math.abs(current - previous);
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

  if (elapsed < msPerMinute) return plural(Math.round(elapsed / 1000), 'second');
  if (elapsed < msPerHour) return plural(Math.round(elapsed / msPerMinute), 'minute');
  if (elapsed < msPerDay) return plural(Math.round(elapsed / msPerHour), 'hour');
  if (elapsed < msPerMonth) return plural(Math.round(elapsed / msPerDay), 'day');
  if (elapsed < msPerYear) return plural(Math.round(elapsed / msPerMonth), 'month');
  return plural(Math.round(elapsed / msPerYear), 'year');
}

export default {
  inheritAttrs: false,
  components: { ArticleHeader, ArticleMeta, ArticleTagsScores, ArticleContent },
  emits: ['update-star', 'update-clicked', 'cluster-articles-loaded', 'cluster-articles-collapsed', 'article-not-interested'],
  props: {
    id: { type: [Number, String], required: true },
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    published: { type: [String, Date], default: '' },
    feed: { type: Object, default: () => ({}) },
    contentOriginal: { type: String, default: '' },
    author: { type: String, default: '' },
    hotInd: { type: Number, default: 0 },
    status: { type: String, default: '' },
    starInd: { type: Number, default: 0 },
    clickedAmount: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    media: { type: [Boolean, Object, Array, String], default: null },
    contentStripped: { type: String, default: '' },
    language: { type: String, default: '' },
    createdAt: { type: [String, Date], default: '' },
    updatedAt: { type: [String, Date], default: '' },
    feedId: { type: [Number, String], default: null },
    tags: { type: Array, default: () => [] },
    advertisementScore: { type: Number, default: undefined },
    sentimentScore: { type: Number, default: undefined },
    qualityScore: { type: Number, default: undefined },
    quality: { type: Number, default: undefined },
    interestScore: { type: [Number, String], default: 0 },
    cluster: { type: Object, default: null },
    contentSummaryBullets: { type: Array, default: () => [] },
    isClusterArticle: { type: Boolean, default: false },
    presentation: { type: Object, default: null }
  },
  data() {
    return {
      showMinimalContent: false,
      clusterExpanded: false,
      NEUTRAL_SCORE,
      isMobilePortrait: false,
      mediaQuery: null
    };
  },
  mounted() {
    this.setupMediaQueryListener();
  },
  beforeUnmount() {
    this.teardownMediaQueryListener();
  },
  computed: {
    // Removes internal article metadata from the root element.
    filteredAttrs() {
      const attrs = { ...this.$attrs };
      [
        'articlevector',
        'articleVector',
        'contenthash',
        'contentHash',
        'description',
        'embedding_model',
        'embeddingModel',
        'urlhash',
        'urlHash'
      ].forEach(attribute => delete attrs[attribute]);
      return attrs;
    },
    // Returns tags that were assigned by rules.
    ruleTags() {
      return (this.tags || []).filter(t => t.tagType === 'rule');
    },
    // Returns the article feed's category name.
    categoryName() {
      if (!this.feed?.categoryId) return '';
      const category = this.$store.data.categories.find(c => c.id === this.feed.categoryId);
      return category?.name || '';
    },
    // Converts the quality score to a percentage.
    roundedQuality() {
      return Math.round((this.quality || 0) * 100);
    },
    // Formats publication dates as elapsed time.
    formatDate() {
      return value => {
        if (!value) return '';
        const publishedAt = new Date(value).getTime();
        if (Number.isNaN(publishedAt)) return '';
        const result = timeDifference(Date.now(), publishedAt);
        return result.charAt(0).toUpperCase() + result.slice(1);
      };
    },
    // Extracts the origin URL from a URL value.
    mainURL() {
      return value => {
        try {
          const url = new URL(value);
          return `${url.protocol}//${url.host}/`;
        } catch {
          return value;
        }
      };
    },
    // Returns the predicted reading affinity.
    predictedAffinity() {
      return this.presentation?.predictedAffinity || null;
    },
    // Determines whether the article is unread.
    isUnread() {
      return this.status === 'unread';
    },
    // Returns the summary bullet limit for the article affinity.
    visibleBulletCount() {
      if (!this.isUnread || !this.predictedAffinity) return Infinity;

      switch (this.predictedAffinity) {
        case 'deep':   return 7;
        case 'medium': return 4;
        case 'skim':   return 1;
        case 'cold':   return 3;
        default:       return 3;
      }
    },
    // Determines whether the article image should be displayed.
    shouldShowImage() {
      if (!this.isUnread || !this.predictedAffinity) return true;
      return this.predictedAffinity !== 'cold';
    },
    // Returns the total number of articles in the active cluster view.
    clusterCountTotal() {
      if (!this.cluster) return 0;
      if (this.$store.data.currentSelection.clusterView === 'topicGroup') {
        return Number(this.cluster.topicGroupCount ?? this.cluster.articleCount ?? 0);
      }
      return Number(this.cluster.articleCount || 0);
    },
    // Determines whether the active view is an event cluster.
    isEventClusterView() {
      return this.$store.data.currentSelection.clusterView === 'eventCluster';
    },
    // Determines whether the article has a non-zero interest score.
    hasInterestScore() {
      const score = Number(this.interestScore);
      return Number.isFinite(score) && score !== 0;
    }
  },
  methods: {
    // Sets up the listener that tracks mobile portrait orientation.
    setupMediaQueryListener() {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      this.mediaQuery = window.matchMedia('(max-width: 766px) and (orientation: portrait)');
      this.isMobilePortrait = this.mediaQuery.matches;
      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener('change', this.handleMediaChange);
      } else if (this.mediaQuery.addListener) {
        this.mediaQuery.addListener(this.handleMediaChange);
      }
    },
    // Removes the listener that tracks mobile portrait orientation.
    teardownMediaQueryListener() {
      if (this.mediaQuery) {
        if (this.mediaQuery.removeEventListener) {
          this.mediaQuery.removeEventListener('change', this.handleMediaChange);
        } else if (this.mediaQuery.removeListener) {
          this.mediaQuery.removeListener(this.handleMediaChange);
        }
        this.mediaQuery = null;
      }
    },
    // Updates the portrait state when the media query changes.
    handleMediaChange(event) {
      this.isMobilePortrait = event.matches;
    },
    // Returns the icon name for a quality score.
    getQualityIcon(score) {
      if (score >= 90) return 'patch-check-fill';
      if (score >= 80) return 'patch-check-fill';
      if (score >= 70) return 'exclamation-circle-fill';
      if (score >= 60) return 'exclamation-triangle-fill';
      return 'x-octagon-fill';
    },
    // Returns the CSS class for a quality score.
    getQualityClass(score) {
      if (score >= 90) return 'quality-excellent';
      if (score >= 80) return 'quality-good';
      if (score >= 70) return 'quality-okay';
      if (score >= 60) return 'quality-weak';
      return 'quality-poor';
    },
    // Returns the CSS class for a sentiment score.
    getSentimentClass(score) {
      if (score >= 50) return 'sentiment-moderate';
      if (score >= 30) return 'sentiment-poor';
      return 'sentiment-very-poor';
    },
    // Returns the display label for a score.
    scoreLabel(score) {
      if (score >= 90) return 'Excellent';
      if (score >= 80) return 'Good';
      if (score >= 70) return 'Okay';
      if (score >= 60) return 'Weak';
      return 'Poor';
    },
    // Toggles minimal article content when the article is touched.
    articleTouched(event) {
      if (this.$store.data.currentSelection.viewMode === 'minimal') {
        if (event.target?.nodeName === 'A') return;
        this.showMinimalContent = !this.showMinimalContent;
      }
    },
    // Selects a tag in the current view.
    selectTag(tag) {
      if (this.$store.data.currentSelection) {
        this.$store.data.currentSelection.tag = tag?.name || '';
      }
    },
    // Selects the article feed's category.
    selectCategory() {
      if (this.feed?.categoryId) {
        this.$store.data.setSelectedCategoryId(this.feed.categoryId);
      }
    },
    // Marks the article as clicked and updates its parent.
    articleClicked() {
      markClicked(this.id)
      .finally(() =>
        this.$emit('update-clicked', { id: this.id, clickedAmount: 1 })
      );
    },
    // Toggles the article's favorite status.
    markAsFavorite() {
      // Toggle star status
      const updateType = this.starInd ? 'unmark' : 'mark';
      const newStarInd = this.starInd ? 0 : 1;
      
      markWithStar(this.id, updateType)
      .then(response => {
        const category = this.$store.data.categories.find(
          c => c.id === response.data.feed.categoryId
        );
        if (category) {
          const delta = newStarInd ? 1 : -1;
          category.starCount += delta;
          const feed = category.feeds.find(f => f.id === response.data.feedId);
          if (feed) feed.starCount += delta;
        }
        newStarInd
          ? this.$store.data.increaseStarCount()
          : this.$store.data.decreaseStarCount();

        this.$emit('update-star', { id: this.id, starInd: newStarInd });
      });
    },
    // Marks the article as not interesting.
    markNotInterested() {
      // Mark article with negativeInd flag
      markNotInterested(this.id)
      .then(() => {
        console.log('Marked as not interested:', this.id);
        this.$emit('article-not-interested', { id: this.id });
      });
    },
    // Marks the article as similar to the user's interests.
    moreLikeThis() {
      markMoreLikeThis(this.id)
      .then(() => {
        console.log('Marked as more like this:', this.id);
      });
    },
    // Marks the article as less similar to the user's interests.
    lessLikeThis() {
      this.markNotInterested();
    },
    // Ignores the topic by marking the article as not interesting.
    ignoreTopic() {
      this.markNotInterested();
    },
    // Mutes the article feed for seven days after confirmation.
    muteFeedSevenDays() {
      if (confirm(`Mute "${this.feed.feedName}" for 7 days?`)) {
        const mutedUntil = new Date();
        mutedUntil.setDate(mutedUntil.getDate() + 7);
        
        muteFeed(this.feedId, mutedUntil.toISOString())
        .then(() => {
          console.log('Feed muted until:', mutedUntil);
        });
      }
    },
    // Expands or collapses articles in the selected cluster.
    viewClusterArticles(clusterId) {
      if (this.clusterExpanded) {
        this.clusterExpanded = false;
        this.$emit('cluster-articles-collapsed', { articleId: this.id });
        return;
      }
      console.log('Fetching articles for cluster:', clusterId);
      fetchClusterArticles(
        clusterId,
        this.$store.data.currentSelection.clusterView,
        this.id
      )
      .then(response => {
        this.clusterExpanded = true;
        this.$emit('cluster-articles-loaded', {
          articleId: this.id,
          clusterId,
          articles: response.data.articles || []
        });
      })
      .catch(error => {
        console.error('Error fetching cluster articles:', error);
      });
    }
  }
};
</script>

<style>
.article-card .article-full-content iframe {
  display: none;
}

/* Override css that comes from other websites */
.article-content-wrapper img, .article-content-wrapper div {
  float: none !important;
}

/* Override css that comes from other websites */
.article-content-wrapper iframe {
    width: 100% !important;
    height: auto !important;
}

/* Override css that comes from other websites */
.article-body {
  max-width: 100% !important;
}

.article-card .article-content-wrapper img, .article-card .article-content-wrapper figure {
  display: block;
  max-width: 100% !important;
  height: auto !important;
  margin-bottom: 10px !important;
}

.article-card .article-content-wrapper figure {
  margin: 0 0 10px !important;
  padding: 0 !important;
}

.article-card .article-content-wrapper figure video,
.article-card .article-content-wrapper video {
  width: 100% !important;
  height: auto !important;
  display: block;
}

.article-card .article-content-wrapper figure.wp-block-video {
  max-width: 100% !important;
  width: 100% !important;
}

@media (min-width: 1200px) {
  .article-card .article-content-wrapper img {
    max-width: 100% !important;
  }
}

@media (min-width: 1500px) {
  .article-card .article-content-wrapper img {
    max-width: 90% !important;
  }
}

@media (min-width: 2000px) {
  .article-card .article-content-wrapper img {
    max-width: 80% !important;
  }
}

.article-card .article-content-wrapper p {
  display: inline !important;
}

/* Remove position: relative from all elements in article body */
.article-full-content * {
  position: static !important;
}
</style>

<style>
.article-body.affinity-muted {
  opacity: 0.55;
}

.article-body.affinity-compact h5 a {
  font-size: 17px;
}

.article-body.affinity-expanded h5 a {
  font-size: 20px;
}

.recommendation-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recommendation-action-icon {
  width: 14px;
  flex: 0 0 auto;
}

.recommendation-positive-icon {
  color: var(--recommendation-positive-icon);
}

.recommendation-negative-icon,
.recommendation-ignore-icon {
  color: var(--color-danger);
}

/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  .article-card {
    padding-top: 2px;
  }

  .article-body {
    display: inline-block;
    position: relative;
    margin-top: 2px;
  }
}

/* Landscape phones and portrait tablets */
@media (min-width: 767px) {
  .article-card {
    padding-top: 4px;
  }
}

.article-card {
  margin-bottom: 0px;
}

.article-card.cluster-article {
  background-color: var(--article-cluster-background);
}

.article-card.cluster-article .article-body {
  background-color: var(--article-cluster-background);
}

.article-card .article-body.hot {
  background-color: var(--article-hot-background);
  border-color: var(--article-highlight-border);
}

.article-card .article-body.starred {
  background-color: var(--desktop-toolbar-background);
}

.article-kind-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--article-warning-text);
  margin-right: 8px;
  flex-shrink: 0;
  line-height: 1;
  vertical-align: middle;
}

.article-kind-icon svg {
  margin-bottom: 0;
}

.star-icon {
  color: var(--article-star-icon);
}

.clicked-icon {
  color: var(--article-clicked-icon);
}

.read-icon {
  color: var(--color-success);
  margin-right: 4px;
  vertical-align: middle;
}

.hot-icon {
  color: var(--article-hot-icon);
}

.cluster-icon {
  color: var(--article-hot-icon);
}

.recommendation-icon {
  color: var(--article-hot-icon);
  font-size: 0.85rem;
  opacity: 0.8;
}

.article-card .article-body {
  padding: 4px 48px 4px 16px;
  font-family: var(--font-family);
  margin-top: 6px;
  background-color: var(--desktop-toolbar-background);
  width: 100%;
}

.article-divider {
  height: 1px;
  margin: 10px 18px 0 16px;
  background-color: var(--border-subtle);
}

:root[data-theme='dark'] .article-divider {
  background-color: var(--border-color);
}

:root[data-theme='dark'] .article-card .article-body {
  background-color: var(--dark-page-surface);
  border-bottom-color: var(--border-color);
}

:root[data-theme='dark'] .article-card .article-body h5 a {
  color: var(--text-primary);
}

:root[data-theme='dark'] .article-card .article-full-content {
  color: var(--article-content-text);
}

:root[data-theme='dark'] .article-card.cluster-article,
:root[data-theme='dark'] .article-card.cluster-article .article-body,
:root[data-theme='dark'] .article-card.cluster-article .article-content-wrapper,
:root[data-theme='dark'] .article-card.cluster-article h5.article-header,
:root[data-theme='dark'] .article-card.cluster-article .article-meta {
  background-color: var(--article-cluster-background-dark);
}

:root[data-theme='dark'] .article-card .article-meta,
:root[data-theme='dark'] .article-card .article-meta .article-published,
:root[data-theme='dark'] .article-card .article-meta .article-source a {
  color: var(--text-secondary);
}

:root[data-theme='dark'] .article-card .article-actions .btn {
  color: var(--text-secondary);
  opacity: 0.9;
}

.article-card .meta-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
}
.article-card .article-content-wrapper {
  color: var(--text-primary);
  padding-top: 6px;
  font-size: 14px;
  line-height: 1.65;
  font-weight: 400;
  margin-bottom: 5px;
  margin-top: 1px;
  margin-left: 0px;
  padding-bottom: 6px;
}

.article-card .article-full-content {
  font-family: var(--font-family);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.65;
  font-weight: 400;
}

.article-card .article-full-content a,
.article-card .article-content-wrapper a {
  color: var(--color-link);
}

.article-card .article-full-content a:hover,
.article-card .article-content-wrapper a:hover {
  color: var(--color-link-hover);
}

.article-card .article-full-content a:visited,
.article-card .article-content-wrapper a:visited {
  color: var(--color-link-visited);
}

.article-card .article-full-content a:active,
.article-card .article-content-wrapper a:active {
  color: var(--color-link-active);
}

.article-card .article-body h5 a {
  margin: 0;
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-decoration: none;
  border-bottom: none;
  display: flex;
  align-items: center;
  line-height: 1.25;
}

.article-card .article-body h5.article-header {
  margin: 0;
  line-height: 1;
  margin-bottom: 8px;
}

.article-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  gap: 8px;
}

.article-header-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.article-header-left svg {
  margin-bottom: 0 !important;
}

.article-card .dropdown {
  position: relative;
}

.article-card .dropdown .btn {
  width: 30px !important;
  height: 30px !important;
  padding: 0 !important;
  border: none !important;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--article-heading-text);
  opacity: 0.7;
  transition: opacity 0.2s;
}

.article-card .dropdown .btn:hover {
  opacity: 1;
  background-color: var(--color-transparent) !important;
}

.article-card .dropdown-menu {
  min-width: 120px !important;
}

.article-card .dropdown-item {
  padding: 6px 8px !important;
  font-size: 13px !important;
}

.article-card .dropdown-item:hover,
.article-card .dropdown-item:focus {
  color: var(--text-inverted) !important;
}

.article-card .article-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.3;
  margin: 0;
  font-weight: 400;
}

.article-card .article-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.article-card .article-tags .tag-badge {
  display: inline-flex;
  align-items: center;
  background-color: var(--article-category-badge-background);
  color: var(--badge-tag-text);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  vertical-align: middle;
  opacity: 0.85;
}

.article-card .article-tags .tag {
  display: inline-flex;
  align-items: center;
  background-color: var(--article-tag-background);
  color: var(--badge-tag-text);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  vertical-align: middle;
}

.article-card .article-tags .tag.tag-rule {
  background-color: var(--article-rule-tag-background);
  color: var(--article-rule-tag-text);
}

.article-card .article-tags .score {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  background-color: var(--bg-subtle);
  color: var(--article-score-text);
  vertical-align: middle;
}

.article-card .article-tags .overall-score {
  opacity: 0.85;
  background-color: var(--article-overall-score-background);  /* Pale red */
  color: var(--article-overall-score-text);             /* Darker red */
}

.article-card .article-tags .ad-score {
  opacity: 0.85;
  background-color: var(--article-ad-score-background);
  color: var(--article-ad-score-text);
}

.article-card .article-tags .sentiment-score {
  opacity: 0.85;
  background-color: var(--article-sentiment-score-background);
  color: var(--article-sentiment-score-text);
}

.article-card .article-tags .quality-score {
  opacity: 0.85;
  background-color: var(--article-quality-background);
  color: var(--article-quality-positive);
}

.article-content-wrapper h1 {
  font-size: 24px !important;
  line-height: 1.2;
}

.article-content-wrapper h2 {
  font-size: 20px !important;
}

.article-content-wrapper h3 {
  font-size: 18px !important;
}

.article-body:hover {
    background: var(--bg-page);
}

/* Hide tags and scores on mobile portrait mode, except rule-based tags */
@media (max-width: 766px) and (orientation: portrait) {
  .article-card .article-body {
    padding: 4px 8px 4px 8px;
  }

  .article-divider {
    margin-right: 8px;
    margin-left: 8px;
  }

  .article-card .article-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .article-card .article-tags .tag {
    display: none;
  }

  .article-card .article-tags .score {
    display: none;
  }

  .article-card .article-body h5 a {
    font-size: 18px;
  }
}

.article-card.active {
  background-color: var(--article-active-background);
}

.article-published {
  margin-right: -3px;
  margin-top: -1px;
}

.article-card .article-meta .article-published,
.article-card .article-meta .article-source a {
  color: var(--text-muted);
}

.break {
  margin-left: -3px;
  margin-right: -3px;
  margin-top: -1px;
  font-size: 16px;
}

/* Override css that comes from other websites */
.article-card .article-content-wrapper img {
  max-width: 100%;
  height: auto !important;
  margin-top: 10px;
}

span.article-source {
  margin-left: -3px;
  margin-top: -1px;
  margin-right: 10px;
}

span.article-source a {
  text-decoration: none;
}

@media (min-width: 767px) {
  .article-card .meta-row,
  .article-card .article-meta {
    gap: 14px;
  }

  .article-published {
    margin-right: -1px;
  }

  .break {
    margin-left: -1px;
    margin-right: -1px;
  }

  span.article-source {
    margin-left: -1px;
  }
}

span.similar-badge {
  display: inline-flex;
  align-items: center;
  background-color: var(--badge-similar-bg);
  color: var(--badge-similar-text);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  vertical-align: middle;
  opacity: 0.85;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  background-color: var(--article-quality-background);
  color: var(--article-quality-positive);
  white-space: nowrap;
  vertical-align: middle;
  opacity: 0.85;
}

:root[data-theme='dark'] .source-badge {
  background-color: var(--article-quality-background-dark);
  color: var(--article-quality-good-dark);
}

:root[data-theme='dark'] span.similar-badge {
  background-color: var(--badge-similar-bg);
  color: var(--badge-similar-text);
}

:root[data-theme='dark'] .article-card .article-tags .tag-badge {
  background-color: var(--bg-control);
  color: var(--text-secondary);
}

:root[data-theme='dark'] .article-card .article-tags .tag {
  background-color: var(--article-tag-background-dark);
  color: var(--article-tag-text-dark);
}

:root[data-theme='dark'] .article-card .article-tags .tag.tag-rule {
  background-color: var(--article-rule-tag-background-dark);
  color: var(--article-rule-tag-text-dark);
}

:root[data-theme='dark'] .article-card .article-tags .score {
  background-color: var(--bg-modal);
  color: var(--text-secondary);
}

:root[data-theme='dark'] .article-card .article-tags .overall-score {
  background-color: var(--article-overall-score-background-dark);
  color: var(--article-quality-poor-dark);
}

:root[data-theme='dark'] .article-card .article-tags .ad-score {
  background-color: var(--article-ad-score-background-dark);
  color: var(--article-ad-score-text-dark);
}

:root[data-theme='dark'] .article-card .article-tags .sentiment-score {
  background-color: var(--article-sentiment-background-dark);
  color: var(--article-sentiment-score-text-dark);
}

:root[data-theme='dark'] .article-card .article-tags .quality-score {
  background-color: var(--article-quality-background-dark);
  color: var(--article-quality-excellent);
}

.source-diversity-icon {
  font-size: 10px;
}

/* Rule-based tags shown inline with article-meta on mobile portrait only */
.mobile-rule-tag {
  display: none;
}

@media (max-width: 766px) and (orientation: portrait) {
  .mobile-rule-tag {
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
    vertical-align: middle;
    background-color: var(--article-rule-tag-background);
    color: var(--article-rule-tag-text);
  }
}

.mobile-score-icon {
  font-size: 11px;
  margin-right: 3px;
  vertical-align: middle;
}

.mobile-score-icon.quality-excellent {
  color: var(--article-quality-positive);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-good {
  color: var(--article-quality-good);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-okay {
  color: var(--article-quality-okay);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-weak {
  color: var(--article-quality-weak);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-poor {
  color: var(--article-overall-score-text);
  margin-bottom: 2px;
}

.mobile-score-icon.ad-icon {
  color: var(--article-ad-score-text);
}

.mobile-score-icon.sentiment-icon {
  color: var(--article-sentiment-score-text);
}

.mobile-score-icon.sentiment-moderate {
  color: var(--article-sentiment-moderate);
}

.mobile-score-icon.sentiment-poor {
  color: var(--article-sentiment-poor-dark);
}

.mobile-score-icon.sentiment-very-poor {
  color: var(--text-danger-placeholder);
}

.article-card span.favicon img.favicon {
  margin-right: 5px;
  height: 18px;
  width: 18px;
  margin-top: -1px;
}

.inline-mobile-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
}

.inline-mobile-tags .tag,
.inline-mobile-tags .score {
  background-color: var(--badge-tag-bg);
  color: var(--article-score-text);
  padding: 2px 6px;
  border-radius: 3px;
}

.inline-mobile-tags .overall-score {
  background-color: var(--article-overall-score-background);
  color: var(--article-overall-score-text);
}

.inline-mobile-tags .ad-score {
  background-color: var(--article-ad-score-background);
  color: var(--article-ad-score-text);
}

.inline-mobile-tags .sentiment-score {
  background-color: var(--article-sentiment-score-background);
  color: var(--article-sentiment-score-text);
}

.inline-mobile-tags .quality-score {
  background-color: var(--article-quality-background);
  color: var(--article-quality-positive);
}

.media-content.enclosure img {
  max-width: 100%;
  height: auto;
  padding-bottom: 5px;
}

.article-summary {
  margin: 5px 0;
  padding-left: 20px;
  list-style-type: disc;
}

.article-summary li {
  color: var(--article-content-text);
  font-family: var(--font-family);
  font-size: 14px;
  margin-bottom: 6px;
  line-height: 1.5;
}

:root[data-theme='dark'] {
  .article-summary li {
    color: var(--article-content-text);
  }
}

:root[data-theme='dark'] {
  .article-card, .article-card .article-body, .article-content-wrapper, h5.article-header, .article-card .article-meta {
    color: var(--article-content-text);
    background: var(--dark-page-surface);
    border-color: var(--dark-page-surface);
    border-bottom-color: var(--border-color);
    background-color: var(--dark-page-surface);
  }

  .article-card a, .article-card .article-body h5 a, .article-card .article-content-wrapper, .article-card span.article-source a {
    color: var(--text-primary);
  }

  .article-card {
    border-bottom-color: var(--dark-page-surface);
  }

  .article-body h1.article-header, .article-body h2.article-header {
    color: var(--text-primary);
  }

  .article-body h1.article-header a {
    color: var(--text-primary);
  }

  .article-card .article-body {
    border-bottom-color: var(--dark-contrast);
    border-width: 0px;
    border-radius: 0px;
  }

  .article-card .article-body.hot {
    background-color: var(--dark-page-surface);
    border-color: var(--dark-page-surface);
  }

  .article-card .article-body.starred {
    background-color: var(--dark-page-surface);
  }

  .article-card.cluster-article {
    background-color: var(--article-cluster-background-dark);
  }

  .article-card.cluster-article .article-body {
    background-color: var(--article-cluster-background-dark);
  }

  .article-card.cluster-article .article-content-wrapper,
  .article-card.cluster-article h5.article-header,
  .article-card.cluster-article .article-meta {
    background-color: var(--article-cluster-background-dark);
  }

  .article-card .article-tags .tag {
    background-color: var(--article-tag-background-dark);
    color: var(--article-tag-text-dark);
  }

  .article-card .article-tags .tag-badge {
    background-color: var(--bg-control);
    color: var(--text-secondary);
  }

  .article-card .article-tags .tag.tag-rule {
    background-color: var(--article-rule-tag-background-dark);
    color: var(--article-rule-tag-text-dark);
  }

  .mobile-rule-tag {
    background-color: var(--article-rule-tag-background-dark);
    color: var(--article-rule-tag-text-dark);
  }

  .article-card .article-tags .score {
    background-color: var(--bg-modal);
    color: var(--text-secondary);
  }

 .article-card .article-tags .overall-score {
    background-color: var(--article-overall-score-background-dark);  /* Dark reddish-brown */
    color: var(--article-quality-poor-dark);             /* Bright red */
  }

  .article-card .dropdown .btn {
    color: var(--text-inverted);
    opacity: 0.9;
  }

  .article-card .dropdown-menu {
    background-color: var(--article-dropdown-background-dark);
    border-color: var(--bg-modal);
  }

  .article-card .dropdown-item {
    color: var(--text-inverted) !important;
  }

  .article-card .dropdown-item:hover,
  .article-card .dropdown-item:focus {
    background-color: var(--bg-modal);
    color: var(--text-inverted) !important;
  }

  .article-card .article-tags .ad-score {
    background-color: var(--article-ad-score-background-dark);
    color: var(--article-ad-score-text-dark);
  }

  .article-card .article-tags .sentiment-score {
    background-color: var(--article-sentiment-background-dark);
    color: var(--article-sentiment-score-text-dark);
  }

  .article-card .article-tags .quality-score {
    background-color: var(--article-quality-background-dark);
    color: var(--article-quality-excellent);
  }

  .inline-mobile-tags .tag,
  .inline-mobile-tags .score {
    background-color: var(--bg-modal);
    color: var(--text-secondary);
  }

  .inline-mobile-tags .overall-score {
    background-color: var(--article-overall-score-background-dark);
    color: var(--article-quality-poor-dark);
  }

  .inline-mobile-tags .ad-score {
    background-color: var(--article-ad-score-background-dark);
    color: var(--article-ad-score-text-dark);
  }

  .inline-mobile-tags .sentiment-score {
    background-color: var(--article-sentiment-background-dark);
    color: var(--article-sentiment-score-text-dark);
  }

  .inline-mobile-tags .quality-score {
    background-color: var(--article-quality-background-dark);
    color: var(--article-quality-excellent);
  }

  .mobile-score-icon.quality-excellent {
    color: var(--article-quality-excellent);
  }

  .mobile-score-icon.quality-good {
    color: var(--article-quality-good-dark);
  }

  .mobile-score-icon.quality-okay {
    color: var(--article-quality-okay-dark);
  }

  .mobile-score-icon.quality-weak {
    color: var(--article-ad-score-text-dark);
  }

  .mobile-score-icon.quality-poor {
    color: var(--article-quality-poor-dark);
  }

  .mobile-score-icon.ad-icon {
    color: var(--article-ad-score-text-dark);
  }

  .mobile-score-icon.sentiment-icon {
    color: var(--article-sentiment-score-text-dark);
  }

  .mobile-score-icon.sentiment-moderate {
    color: var(--article-sentiment-moderate-dark);
  }

  .mobile-score-icon.sentiment-poor {
    color: var(--article-ad-score-text-dark);
  }

  .mobile-score-icon.sentiment-very-poor {
    color: var(--article-quality-poor-dark);
  }

  .source-badge {
    background-color: var(--article-quality-background-dark);
    color: var(--article-quality-excellent);
  }

  .article-card .article-full-content a,
  .article-card .article-content-wrapper a {
    color: var(--article-link-dark);
  }

  .article-card .article-full-content a:hover,
  .article-card .article-content-wrapper a:hover {
    color: var(--article-link-hover-dark);
  }

  .article-card .article-full-content a:visited,
  .article-card .article-content-wrapper a:visited {
    color: var(--article-link-visited-dark);
  }

  .article-card .article-full-content a:active,
  .article-card .article-content-wrapper a:active {
    color: var(--article-link-active-dark);
  }
}
</style>
