<template>
  <div class="block" :id="id" :class="{ 'cluster-article': isClusterArticle }">
    <div class="article" :class="[{ starred: starInd === 1, hot: hotInd === 1 }, isUnread && predictedAffinity ? `affinity-${predictedAffinity}` : '']" @click="articleTouched($event)">
      <div class="maximal">
        <ArticleHeader :url="url" :title="title" :clickedAmount="clickedAmount" :starInd="starInd" :hotInd="hotInd" :hasInterestScore="hasInterestScore" :isEventClusterView="isEventClusterView" :clusterCountTotal="clusterCountTotal" @article-clicked="articleClicked" @toggle-favorite="markAsFavorite" @not-interested="markNotInterested" @more-like-this="moreLikeThis" @less-like-this="lessLikeThis" @ignore-topic="ignoreTopic" @mute-feed="muteFeedSevenDays" />
        <ArticleMeta :published="published" :feed="feed" :author="author" :cluster="cluster" :clusterCountTotal="clusterCountTotal" :clusterView="$store.data.currentSelection.clusterView" :ruleTags="ruleTags" :isMobilePortrait="isMobilePortrait" :quality="quality" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :neutralScore="NEUTRAL_SCORE" :formatDate="formatDate" :mainURL="mainURL" :getQualityIcon="getQualityIcon" :getQualityClass="getQualityClass" :getSentimentClass="getSentimentClass" :scoreLabel="scoreLabel" @select-category="selectCategory" @select-tag="selectTag" @view-cluster-articles="viewClusterArticles" />
        <ArticleTagsScores v-if="$store.data.currentSelection.viewMode !== 'minimal'" :categoryName="categoryName" :tags="tags || []" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :qualityScore="qualityScore" :neutralScore="NEUTRAL_SCORE" :scoreLabel="scoreLabel" :showQuality="quality !== undefined && roundedQuality !== NEUTRAL_SCORE" :showAdvertisement="advertisementScore !== undefined && advertisementScore < NEUTRAL_SCORE" :showSentiment="sentimentScore !== undefined && sentimentScore !== NEUTRAL_SCORE" :showWritingQuality="qualityScore !== undefined && qualityScore !== NEUTRAL_SCORE" @select-category="selectCategory" @select-tag="selectTag" />
      </div>
      <ArticleContent :viewMode="$store.data.currentSelection.viewMode" :contentOriginal="contentOriginal" :imageUrl="imageUrl" :contentSummaryBullets="contentSummaryBullets" :visibleBulletCount="visibleBulletCount" :shouldShowImage="shouldShowImage" :showMinimalContent="showMinimalContent" />
    </div>
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
.block .article-body iframe {
  display: none;
}

/* Override css that comes from other websites */
.article-content img, .article-content div {
  float: none !important;
}

/* Override css that comes from other websites */
.article-content iframe {
    width: 100% !important;
    height: auto !important;
}

/* Override css that comes from other websites */
.article {
  max-width: 100% !important;
}

.block .article-content img, .block .article-content figure {
  display: block;
  max-width: 100% !important;
  height: auto !important;
  margin-bottom: 10px !important;
}

.block .article-content figure {
  margin: 0 0 10px !important;
  padding: 0 !important;
}

.block .article-content figure video,
.block .article-content video {
  width: 100% !important;
  height: auto !important;
  display: block;
}

.block .article-content figure.wp-block-video {
  max-width: 100% !important;
  width: 100% !important;
}

.block .article-content p {
  display: inline !important;
}

/* Remove position: relative from all elements in article body */
.article-body * {
  position: static !important;
}
</style>

<style>
.article.affinity-muted {
  opacity: 0.55;
}

.article.affinity-compact h5 a {
  font-size: 17px;
}

.article.affinity-expanded h5 a {
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
  color: var(--component-color-198754);
}

.recommendation-negative-icon,
.recommendation-ignore-icon {
  color: var(--color-danger);
}

/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  .block {
    padding-top: 2px;
  }

  .article {
    display: inline-block;
    position: relative;
    margin-top: 2px;
  }
}

/* Landscape phones and portrait tablets */
@media (min-width: 767px) {
  .block {
    padding-top: 4px;
  }
}

.block {
  margin-bottom: 0px;
}

.block.cluster-article {
  background-color: var(--component-color-f0f9f6);
}

.block.cluster-article .article {
  background-color: var(--component-color-f0f9f6);
}

.block .article.hot {
  background-color: var(--component-color-fffff4);
  border-color: var(--component-color-ffc7c7);
}

.block .article.starred {
  background-color: var(--component-color-fffafa);
  border-color: var(--component-color-ffc7c7);
}

.star-icon {
  color: var(--component-color-db2b39);
  margin-right: 4px;
  vertical-align: middle;
}

.clicked-icon {
  color: var(--component-color-2b79c2);
  margin-right: 4px;
  vertical-align: middle;
}

.read-icon {
  color: var(--color-success);
  margin-right: 4px;
  vertical-align: middle;
}

.hot-icon {
  color: var(--component-color-f3a712);
  margin-right: 4px;
  vertical-align: middle;
}

.cluster-icon {
  color: var(--component-color-f3a712);
  margin-right: 4px;
  vertical-align: middle;
}

.recommendation-icon {
  color: var(--component-color-f3a712);
  font-size: 0.85rem;
  margin-right: 4px;
  opacity: 0.8;
  vertical-align: middle;
}

.block .article {
  padding-top: 2px;
  padding-left: 5px;
  padding-right: 5px;
  font-family: var(--font-family);
  border-color: var(--border-subtle);
  background-color: var(--component-color-fbfbfb);
  width: 100%;
}

.block .article-content {
  color: var(--component-color-1b1f23);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.45;
  margin-bottom: 5px;
  margin-top: 1px;
  margin-left: 0px;
  padding-bottom: 3px;
}

.block .article-body {
  font-family: var(--font-family);
  line-height: 1.45;
}

.block .article h5 a {
  color: var(--component-color-51556a);
  font-weight: 600;
  font-size: 19px;
  text-decoration: none;
  border-bottom: none;
}

.heading-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  gap: 8px;
}

.heading-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.block .dropdown {
  position: relative;
}

.block .dropdown .btn {
  width: 30px !important;
  height: 30px !important;
  padding: 0 !important;
  border: none !important;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--component-color-51556a);
  opacity: 0.7;
  transition: opacity 0.2s;
}

.block .dropdown .btn:hover {
  opacity: 1;
  background-color: transparent !important;
}

.block .dropdown-menu {
  min-width: 120px !important;
}

.block .dropdown-item {
  padding: 6px 8px !important;
  font-size: 13px !important;
}

.block .dropdown-item:hover,
.block .dropdown-item:focus {
  color: var(--text-inverted) !important;
}

.block .feedname {
  margin-top: -8px;
  font-size: 12px;
  padding-top: 1px;
  padding-left: 0px;
  font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-weight: bold;
  margin-bottom: 2px;
  color: var(--component-color-51556a);
}

.block .article-tags-scores {
  margin-top: 5px;
  margin-bottom: 5px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.block .article-tags-scores .category-badge {
  display: inline-block;
  background-color: var(--component-color-f0f0f0);
  color: var(--component-color-555);
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
}

.block .article-tags-scores .tag {
  display: inline-block;
  background-color: var(--component-color-e8f4f8);
  color: var(--color-primary);
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.block .article-tags-scores .tag.tag-rule {
  background-color: var(--component-color-f3e8ff);
  color: var(--component-color-7c3aed);
}

.block .article-tags-scores .score {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  background-color: var(--component-color-f5f5f5);
  color: var(--component-color-666);
}

.block .article-tags-scores .overall-score {
  background-color: var(--component-color-ffebee);  /* Pale red */
  color: var(--component-color-c62828);             /* Darker red */
}

.block .article-tags-scores .ad-score {
  background-color: var(--component-color-fff3e0);
  color: var(--component-color-e65100);
}

.block .article-tags-scores .sentiment-score {
  background-color: var(--component-color-e8eaf6);
  color: var(--component-color-3f51b5);
}

.block .article-tags-scores .quality-score {
  background-color: var(--component-color-e8f5e9);
  color: var(--component-color-2e7d32);
}

/* Hide tags and scores on mobile portrait mode, except rule-based tags */
@media (max-width: 766px) and (orientation: portrait) {
  .block .feedname {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
  }

  .block .article-tags-scores .tag {
    display: none;
  }

  .block .article-tags-scores .score {
    display: none;
  }

  .block .article h5 a {
    font-size: 18px;
  }
}

.block.active {
  background-color: var(--component-color-ffffe5);
}

.break {
  margin-left: 2px;
  margin-right: 2px;
}

/* Override css that comes from other websites */
.block .article-content img {
  max-width: 100%;
  height: auto !important;
}

span.feed_name a {
  color: var(--component-color-51556a);
}

span.cluster {
  cursor: pointer;
}

.source-diversity-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background-color: var(--component-color-e8f5e9);
  color: var(--component-color-2e7d32);
  white-space: nowrap;
}

.source-diversity-icon {
  font-size: 10px;
}

/* Rule-based tags shown inline with feedname on mobile portrait only */
.mobile-rule-tag {
  display: none;
}

@media (max-width: 766px) and (orientation: portrait) {
  .mobile-rule-tag {
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    background-color: var(--component-color-f3e8ff);
    color: var(--component-color-7c3aed);
  }
}

.mobile-score-icon {
  font-size: 11px;
  margin-right: 3px;
  vertical-align: middle;
}

.mobile-score-icon.quality-excellent {
  color: var(--component-color-2e7d32);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-good {
  color: var(--component-color-43a047);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-okay {
  color: var(--component-color-fbc02d);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-weak {
  color: var(--component-color-f57c00);
  margin-bottom: 2px;
}

.mobile-score-icon.quality-poor {
  color: var(--component-color-c62828);
  margin-bottom: 2px;
}

.mobile-score-icon.ad-icon {
  color: var(--component-color-e65100);
}

.mobile-score-icon.sentiment-icon {
  color: var(--component-color-3f51b5);
}

.mobile-score-icon.sentiment-moderate {
  color: var(--component-color-d4a017);
}

.mobile-score-icon.sentiment-poor {
  color: var(--component-color-ff6f00);
}

.mobile-score-icon.sentiment-very-poor {
  color: var(--text-danger-placeholder);
}

.block span.favicon img.favicon {
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
  background-color: var(--component-color-f5f5f5);
  color: var(--component-color-666);
  padding: 2px 6px;
  border-radius: 3px;
}

.inline-mobile-tags .overall-score {
  background-color: var(--component-color-ffebee);
  color: var(--component-color-c62828);
}

.inline-mobile-tags .ad-score {
  background-color: var(--component-color-fff3e0);
  color: var(--component-color-e65100);
}

.inline-mobile-tags .sentiment-score {
  background-color: var(--component-color-e8eaf6);
  color: var(--component-color-3f51b5);
}

.inline-mobile-tags .quality-score {
  background-color: var(--component-color-e8f5e9);
  color: var(--component-color-2e7d32);
}

.media-content.enclosure img {
  max-width: 100%;
  height: auto;
  padding-bottom: 5px;
}

.summary-bullets {
  margin: 5px 0;
  padding-left: 20px;
  list-style-type: disc;
}

.summary-bullets li {
  color: var(--component-color-1b1f23);
  font-family: var(--font-family);
  font-size: 14px;
  margin-bottom: 6px;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .summary-bullets li {
    color: var(--text-inverted);
  }
}

@media (prefers-color-scheme: light) {
  .block {
  box-shadow: 0 4px 2px -2px var(--component-color-gray);
}
}

@media (prefers-color-scheme: dark) {
  .block, .block .article, .article-content, h5.heading, .block .feedname {
    color: var(--text-inverted);
    background: var(--component-color-121212);
    border-color: var(--component-color-121212);
    border-bottom-color: var(--text-inverted);
    background-color: var(--component-color-121212);
  }

  .block a, .block .article h5 a, .block .article-content, .block span.feed_name a {
    color: var(--text-inverted);
  }

  .block {
    border-bottom-color: var(--component-color-121212);
    background: var(--component-color-424242);
  }

  /* Landscape phones and portrait tablets */
  @media (max-width: 766px) {
    .block {
      background: var(--component-color-424242);
    }
  }

  .article h1.heading, .article h2.heading {
    color: var(--text-inverted);
  }

  .article h1.heading a {
    color: var(--text-inverted);
  }

  .block .article {
    border-bottom-color: var(--component-color-000);
    border-width: 0px;
    border-radius: 0px;
  }

  .block .article.hot {
    background-color: var(--component-color-121212);
    border-color: var(--component-color-121212);
  }

  .block .article.starred {
    background-color: var(--component-color-121212);
    border-color: var(--component-color-121212);
  }

  .block.cluster-article {
    background-color: var(--component-color-0d2f27);
  }

  .block.cluster-article .article {
    background-color: var(--component-color-0d2f27);
  }

  .block.cluster-article .article-content,
  .block.cluster-article h5.heading,
  .block.cluster-article .feedname {
    background-color: var(--component-color-0d2f27);
  }

  .block .article-tags-scores .tag {
    background-color: var(--component-color-1e3a5f);
    color: var(--component-color-a8c5e8);
  }

  .block .article-tags-scores .category-badge {
    background-color: var(--bg-control);
    color: var(--text-label);
  }

  .block .article-tags-scores .tag.tag-rule {
    background-color: var(--component-color-3b1f5e);
    color: var(--component-color-d4b5f0);
  }

  .mobile-rule-tag {
    background-color: var(--component-color-3b1f5e);
    color: var(--component-color-d4b5f0);
  }

  .block .article-tags-scores .score {
    background-color: var(--bg-modal);
    color: var(--text-label);
  }

 .block .article-tags-scores .overall-score {
    background-color: var(--component-color-2d1a1f);  /* Dark reddish-brown */
    color: var(--component-color-ef5350);             /* Bright red */
  }

  .block .dropdown .btn {
    color: var(--text-inverted);
    opacity: 0.9;
  }

  .block .dropdown-menu {
    background-color: var(--component-color-1f1f1f);
    border-color: var(--bg-modal);
  }

  .block .dropdown-item {
    color: var(--text-inverted) !important;
  }

  .block .dropdown-item:hover,
  .block .dropdown-item:focus {
    background-color: var(--bg-modal);
    color: var(--text-inverted) !important;
  }

  .block .article-tags-scores .ad-score {
    background-color: var(--component-color-3d2a1f);
    color: var(--component-color-ffb74d);
  }

  .block .article-tags-scores .sentiment-score {
    background-color: var(--component-color-1a1f3a);
    color: var(--component-color-9fa8da);
  }

  .block .article-tags-scores .quality-score {
    background-color: var(--component-color-1f2e1f);
    color: var(--component-color-81c784);
  }

  .inline-mobile-tags .tag,
  .inline-mobile-tags .score {
    background-color: var(--bg-modal);
    color: var(--text-label);
  }

  .inline-mobile-tags .overall-score {
    background-color: var(--component-color-2d1a1f);
    color: var(--component-color-ef5350);
  }

  .inline-mobile-tags .ad-score {
    background-color: var(--component-color-3d2a1f);
    color: var(--component-color-ffb74d);
  }

  .inline-mobile-tags .sentiment-score {
    background-color: var(--component-color-1a1f3a);
    color: var(--component-color-9fa8da);
  }

  .inline-mobile-tags .quality-score {
    background-color: var(--component-color-1f2e1f);
    color: var(--component-color-81c784);
  }

  .mobile-score-icon.quality-excellent {
    color: var(--component-color-81c784);
  }

  .mobile-score-icon.quality-good {
    color: var(--component-color-66bb6a);
  }

  .mobile-score-icon.quality-okay {
    color: var(--component-color-fdd835);
  }

  .mobile-score-icon.quality-weak {
    color: var(--component-color-ffb74d);
  }

  .mobile-score-icon.quality-poor {
    color: var(--component-color-ef5350);
  }

  .mobile-score-icon.ad-icon {
    color: var(--component-color-ffb74d);
  }

  .mobile-score-icon.sentiment-icon {
    color: var(--component-color-9fa8da);
  }

  .mobile-score-icon.sentiment-moderate {
    color: var(--component-color-f9a825);
  }

  .mobile-score-icon.sentiment-poor {
    color: var(--component-color-ffb74d);
  }

  .mobile-score-icon.sentiment-very-poor {
    color: var(--component-color-ef5350);
  }

  nav ul li {
    background: var(--component-color-000);
  }

  .source-diversity-badge {
    background-color: var(--component-color-1f2e1f);
    color: var(--component-color-81c784);
  }

  a:visited, a:active, a:link {
    color: var(--component-color-18bc9c);
  }
}
</style>
