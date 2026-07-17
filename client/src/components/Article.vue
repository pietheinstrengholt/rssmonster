<template>
  <div class="article-card" :id="`article-${id}`" :class="[{ 'cluster-article': isClusterArticle }, { 'article-list-card': isMinimalView }]" v-bind="filteredAttrs">
    <div v-if="isMinimalView" class="mobile-swipe-shell">
      <div class="mobile-swipe-action" aria-hidden="true">
        <i :class="['bi', favoriteInd === 1 ? 'bi-bookmark-x-fill' : 'bi-bookmark-fill']" aria-hidden="true"></i>
        <span>{{ favoriteInd === 1 ? 'Remove favorite' : 'Add to favorites' }}</span>
      </div>
      <div class="article-list-row mobile-swipe-content" :class="{ 'is-read': status === 'read', favorited: favoriteInd === 1, hot: hotInd === 1 }" :style="mobileSwipeStyle" @click="articleTouched($event)" @touchstart.passive="onSwipeTouchStart" @touchmove="onSwipeTouchMove" @touchend="onSwipeTouchEnd" @touchcancel="resetSwipe">
      <button class="article-list-status" type="button" :aria-label="statusToggleLabel" :title="statusToggleLabel" @click.stop="toggleMinimalReadStatus">
        <i :class="['bi', status === 'read' ? 'bi-circle-fill' : 'bi-record-circle-fill']" aria-hidden="true"></i>
      </button>
      <div class="article-list-source" aria-hidden="true">
        <img v-if="feedFavicon" :src="feedFavicon" class="favicon" alt="" />
        <BootstrapIcon v-else icon="rss-fill" />
      </div>
      <div class="article-list-main">
        <h5 class="article-list-title">
          <a class="article-link" target="_blank" :href="url" v-text="title" @click="articleClicked"></a>
        </h5>
        <div class="article-list-meta">
          <span class="article-list-feed">{{ author || feed.feedName }}</span>
          <span class="article-list-dot">·</span>
          <span v-if="cluster && clusterCountTotal > 1 && $store.data.currentSelection.grouping !== 'none' && cluster.sourceCount >= 2" class="source-badge" :title="`${cluster.sourceCount} unique sources`"><BootstrapIcon icon="people-fill" class="source-diversity-icon" />{{ cluster.sourceCount }} sources</span>
          <span v-if="cluster && clusterCountTotal > 1 && $store.data.currentSelection.grouping !== 'none'" class="similar-badge" @click.stop="viewClusterArticles(cluster.id)">+{{ clusterCountTotal - 1 }} similar article{{ clusterCountTotal - 1 === 1 ? '' : 's' }}</span>
          <span v-if="duplicateCount > 0" class="duplicate-badge" @click.stop="viewDuplicateArticles">{{ duplicateCount }} duplicate{{ duplicateCount === 1 ? '' : 's' }}</span>
          <span v-for="tag in ruleTags" :key="'list-rule-' + tag.id" class="tag tag-rule mobile-rule-tag" @click.stop="selectTag(tag)">{{ formatTagName(tag.name) }}</span>
        </div>
      </div>
      <div class="article-list-actions">
        <span class="article-list-time">{{ formatDate(publishedAt) }}</span>
        <ArticleActionsMenu :favoriteInd="favoriteInd" @toggle-favorite="markAsFavorite" @not-interested="markNotInterested" @more-like-this="moreLikeThis" @less-like-this="lessLikeThis" @ignore-topic="ignoreTopic" @mute-feed="muteFeedSevenDays" />
        <button class="article-list-action-button article-list-favorite-button" type="button" :aria-label="favoriteLabel" :title="favoriteLabel" @click.stop="markAsFavorite">
          <i :class="['bi', favoriteInd === 1 ? 'bi-bookmark-fill' : 'bi-bookmark']" aria-hidden="true"></i>
        </button>
      </div>
      </div>
    </div>
    <div v-else class="mobile-swipe-shell">
      <div class="mobile-swipe-action" aria-hidden="true">
        <i :class="['bi', favoriteInd === 1 ? 'bi-bookmark-x-fill' : 'bi-bookmark-fill']" aria-hidden="true"></i>
        <span>{{ favoriteInd === 1 ? 'Remove favorite' : 'Add to favorites' }}</span>
      </div>
      <div class="article-body mobile-swipe-content" :class="[{ favorited: favoriteInd === 1, hot: hotInd === 1 }, isUnread && predictedAffinity ? `affinity-${predictedAffinity}` : '']" :style="mobileSwipeStyle" @click="articleTouched($event)" @touchstart.passive="onSwipeTouchStart" @touchmove="onSwipeTouchMove" @touchend="onSwipeTouchEnd" @touchcancel="resetSwipe">
        <div class="article-layout">
          <ArticleHeader :url="url" :title="title" :clickedAmount="clickedAmount" :favoriteInd="favoriteInd" :hotInd="hotInd" :status="status" :viewMode="$store.data.currentSelection.viewMode" :hasVideoMedia="hasVideoMedia" :hasInterestScore="hasInterestScore" :isGroupedView="isGroupedView" :clusterCountTotal="clusterCountTotal" @article-clicked="articleClicked" @toggle-favorite="markAsFavorite" @toggle-read-status="$emit('toggle-read-status', { id, status })" @not-interested="markNotInterested" @more-like-this="moreLikeThis" @less-like-this="lessLikeThis" @ignore-topic="ignoreTopic" @mute-feed="muteFeedSevenDays" />
          <div class="meta-row">
            <ArticleMeta :published-at="publishedAt" :feed="feed" :author="author" :cluster="cluster" :clusterCountTotal="clusterCountTotal" :duplicateCount="duplicateCount" :grouping="$store.data.currentSelection.grouping" :ruleTags="ruleTags" :isMobilePortrait="isMobilePortrait" :quality="quality" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :neutralScore="NEUTRAL_SCORE" :formatDate="formatDate" :mainURL="mainURL" :getQualityIcon="getQualityIcon" :getQualityClass="getQualityClass" :getSentimentClass="getSentimentClass" :scoreLabel="scoreLabel" @select-category="selectCategory" @select-tag="selectTag" @view-cluster-articles="viewClusterArticles" @view-duplicate-articles="viewDuplicateArticles" />
            <ArticleTagsScores v-if="$store.data.currentSelection.viewMode !== 'minimal'" :categoryName="categoryName" :tags="tags || []" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :qualityScore="qualityScore" :neutralScore="NEUTRAL_SCORE" :scoreLabel="scoreLabel" :showQuality="quality !== undefined && roundedQuality !== NEUTRAL_SCORE" :showAdvertisement="advertisementScore !== undefined && advertisementScore < NEUTRAL_SCORE" :showSentiment="sentimentScore !== undefined && sentimentScore !== NEUTRAL_SCORE" :showWritingQuality="qualityScore !== undefined && qualityScore !== NEUTRAL_SCORE" @select-category="selectCategory" @select-tag="selectTag" />
          </div>
          <div v-if="articleSignals.length" class="article-signal-bar" aria-label="Article relevance signals">
            <template v-for="(signal, index) in articleSignals" :key="signal.label">
              <span v-if="index > 0" class="signal-divider" aria-hidden="true"></span>
              <span class="signal-badge">
                <span :class="['signal-icon', signal.icon]" aria-hidden="true"></span>
                {{ signal.label }}
              </span>
            </template>
          </div>
        </div>
        <ArticleMedia v-if="shouldRenderMedia" :media="media" :articleUrl="url" :imageUrl="imageUrl" :title="title" @media-clicked="articleClicked" />
        <ArticleContent :viewMode="$store.data.currentSelection.viewMode" :content="displayContent" :imageUrl="imageUrl" :contentSummaryBullets="contentSummaryBullets" :visibleBulletCount="visibleBulletCount" :shouldShowImage="shouldShowImage && !hasVideoMedia" :showMinimalContent="showMinimalContent" />
      </div>
    </div>
    <ArticleMedia v-if="isMinimalView && shouldRenderMedia" :media="media" :articleUrl="url" :imageUrl="imageUrl" :title="title" @media-clicked="articleClicked" />
    <ArticleContent v-if="isMinimalView" :viewMode="$store.data.currentSelection.viewMode" :content="displayContent" :imageUrl="imageUrl" :contentSummaryBullets="contentSummaryBullets" :visibleBulletCount="visibleBulletCount" :shouldShowImage="shouldShowImage && !hasVideoMedia" :showMinimalContent="shouldShowMinimalContent" />
    <div class="article-divider"></div>
  </div>
</template>

<script>
import {
  markAsFavorite as markArticleAsFavoriteAPI,
  markClicked,
  markNotInterested,
  markMoreLikeThis,
  fetchDuplicateArticles
} from '../api/articles';

import { muteFeed } from '../api/feeds';
import { fetchEventArticles } from '../api/events';
import { fetchTopicArticles } from '../api/topics';
import ArticleHeader from './articles/ArticleHeader.vue';
import ArticleMeta from './articles/ArticleMeta.vue';
import ArticleTagsScores from './articles/ArticleTagsScores.vue';
import ArticleContent from './articles/ArticleContent.vue';
import ArticleMedia from './articles/ArticleMedia.vue';
import ArticleActionsMenu from './articles/ArticleActionsMenu.vue';
import { formatRelativeDate } from '../utils/date';
import { formatTagName } from '../utils/tags';

const NEUTRAL_SCORE = 70;
const SWIPE_MAX = 128;
const SWIPE_THRESHOLD = 86;
const TRUSTED_FEED_THRESHOLD = 0.85;

export default {
  inheritAttrs: false,
  components: { ArticleHeader, ArticleMeta, ArticleTagsScores, ArticleContent, ArticleMedia, ArticleActionsMenu },
  emits: ['update-favorite', 'update-clicked', 'toggle-read-status', 'minimal-article-opened', 'minimal-article-closed', 'toggle-minimal-read-status', 'cluster-articles-loaded', 'cluster-articles-collapsed', 'duplicate-articles-loaded', 'duplicate-articles-collapsed', 'article-not-interested'],
  props: {
    id: { type: [Number, String], required: true },
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    publishedAt: { type: [String, Date], default: '' },
    feed: { type: Object, default: () => ({}) },
    content: { type: String, default: '' },
    description: { type: String, default: '' },
    contentOriginal: { type: String, default: '' },
    author: { type: String, default: '' },
    hotInd: { type: Number, default: 0 },
    status: { type: String, default: '' },
    favoriteInd: { type: Number, default: 0 },
    clickedAmount: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    media: { type: [Boolean, Object, Array, String], default: null },
    contentHtml: { type: String, default: '' },
    language: { type: String, default: '' },
    createdAt: { type: [String, Date], default: '' },
    updatedAt: { type: [String, Date], default: '' },
    feedId: { type: [Number, String], default: null },
    tags: { type: Array, default: () => [] },
    advertisementScore: { type: Number, default: undefined },
    sentimentScore: { type: Number, default: undefined },
    qualityScore: { type: Number, default: undefined },
    recommendationScore: { type: Number, default: undefined },
    quality: { type: Number, default: undefined },
    isOfficialSource: { type: Boolean, default: false },
    officialOrganization: { type: String, default: '' },
    interestScore: { type: [Number, String], default: 0 },
    cluster: { type: Object, default: null },
    duplicateCount: { type: Number, default: 0 },
    contentSummaryBullets: { type: Array, default: () => [] },
    isClusterArticle: { type: Boolean, default: false },
    presentation: { type: Object, default: null },
    isMinimalContentOpen: { type: Boolean, default: false }
  },
  data() {
    return {
      showMinimalContent: false,
      clusterExpanded: false,
      duplicatesExpanded: false,
      NEUTRAL_SCORE,
      isMobilePortrait: false,
      mediaQuery: null,
      swipeStartX: 0,
      swipeStartY: 0,
      swipeTranslateX: 0,
      swipeTracking: false,
      swipeLocked: false,
      swipeSuppressClick: false
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
        'attentionbucket',
        'attentionBucket',
        'attentionscore',
        'attentionScore',
        'articlevector',
        'articleVector',
        'contentsourcehash',
        'contentSourceHash',
        'contenttext',
        'contentText',
        'contenttexthash',
        'contentTextHash',
        'description',
        'embedding_model',
        'embeddingModel',
        'externalid',
        'externalId',
        'externalidtype',
        'externalIdType',
        'freshness',
        'hotlinks',
        'negativeind',
        'negativeInd',
        'normalizedurl',
        'normalizedUrl',
        'normalizedurlhash',
        'normalizedUrlHash',
        'positiveind',
        'positiveInd',
        'publishinferred',
        'publishInferred',
        'uniqueness',
        'userid',
        'userId',
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
    // Returns article body content, falling back to the feed description.
    displayContent() {
      return this.contentHtml || this.content || this.description || '';
    },
    // Converts the quality score to a percentage.
    roundedQuality() {
      return Math.round((this.quality || 0) * 100);
    },
    // Formats publication dates as elapsed time.
    formatDate() {
      return formatRelativeDate;
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
    // Returns whether normalized video metadata is available for this article.
    hasVideoMedia() {
      return this.media && typeof this.media === 'object' && this.media.type === 'video';
    },
    // Returns whether the media poster belongs in the active article view.
    shouldRenderMedia() {
      if (!this.hasVideoMedia) return false;

      const viewMode = this.$store.data.currentSelection.viewMode;
      return viewMode === 'full' ||
        viewMode === 'reader' ||
        (viewMode === 'minimal' && this.shouldShowMinimalContent);
    },
    // Returns compact relevance signals for the current article.
    articleSignals() {
      const signals = [];

      if (this.hasHighQualitySignal) {
        signals.push({ label: 'High quality', icon: 'bi bi-stars' });
      }

      if (this.hasMajorEventSignal) {
        signals.push({ label: 'Major event', icon: 'bi bi-broadcast' });
      } else if (this.hasTrendingSignal) {
        signals.push({ label: 'Trending', icon: 'bi bi-graph-up-arrow' });
      }

      if (this.hasOfficialSourceSignal) {
        signals.push({ label: this.officialSourceLabel, icon: 'bi bi-patch-check-fill' });
      } else if (this.hasTrustedSourceSignal) {
        signals.push({ label: this.trustedSourceLabel, icon: 'bi bi-shield-fill-check' });
      }

      return signals;
    },
    // Returns whether quality or recommendation metadata clears the high-quality threshold.
    hasHighQualitySignal() {
      return this.scoreAsPercent(this.qualityScore) > 90
        || this.scoreAsPercent(this.recommendationScore) > 90;
    },
    // Returns whether this article was crawled from a configured official source domain.
    hasOfficialSourceSignal() {
      return this.isOfficialSource === true;
    },
    // Returns the official-source label, including organization when available.
    officialSourceLabel() {
      return this.officialOrganization
        ? `Official Feed (${this.officialOrganization})`
        : 'Official Feed';
    },
    // Returns whether the feed trust score clears the trusted-source threshold.
    hasTrustedSourceSignal() {
      const feedTrust = Number(this.feed?.feedTrust);
      return Number.isFinite(feedTrust) && feedTrust > TRUSTED_FEED_THRESHOLD;
    },
    // Returns the trusted-source label, including feed name when metadata shows an author.
    trustedSourceLabel() {
      const feedName = this.feed?.feedName;
      return this.author && feedName
        ? `Trusted source (${feedName})`
        : 'Trusted source';
    },
    // Returns whether event source coverage clears the trending threshold.
    hasTrendingSignal() {
      return this.eventSourceScore > 4;
    },
    // Returns whether event source coverage clears the major-event threshold.
    hasMajorEventSignal() {
      return this.eventSourceScore > 6;
    },
    // Returns the unique-source score stored on the event/cluster metadata.
    eventSourceScore() {
      const score = Number(this.cluster?.sourceCount);
      return Number.isFinite(score) ? score : 0;
    },
    // Returns the total number of articles in the active event view.
    clusterCountTotal() {
      if (!this.cluster) return 0;
      if (this.$store.data.currentSelection.grouping === 'topic') {
        return Number(this.cluster.topicArticleCount ?? this.cluster.articleCount ?? 0);
      }
      return Number(this.cluster.articleCount || 0);
    },
    // Determines whether the active view is grouped.
    isGroupedView() {
      return this.$store.data.currentSelection.grouping !== 'none';
    },
    // Determines whether the article has a non-zero interest score.
    hasInterestScore() {
      const score = Number(this.interestScore);
      return Number.isFinite(score) && score !== 0;
    },
    // Returns whether the article should use the compact list row.
    isMinimalView() {
      return this.$store.data.currentSelection.viewMode === 'minimal';
    },
    // Returns the accessible label for the favorite toggle.
    favoriteLabel() {
      return this.favoriteInd === 1 ? 'Unmark favorite' : 'Mark as favorite';
    },
    // Returns the accessible label for the compact read status control.
    statusToggleLabel() {
      return this.status === 'read' ? 'Mark article as unread' : 'Mark article as read';
    },
    // Returns whether the minimal content panel should be visible.
    shouldShowMinimalContent() {
      return this.isMinimalView ? this.isMinimalContentOpen : this.showMinimalContent;
    },
    // Returns the article feed favicon from the payload or loaded sidebar feed data.
    feedFavicon() {
      if (this.feed?.favicon) return this.feed.favicon;

      const targetFeedId = String(this.feed?.id ?? this.feedId ?? '');
      if (!targetFeedId) return '';

      for (const category of this.$store.data.categories) {
        const matchedFeed = category.feeds?.find(feed => String(feed.id) === targetFeedId);
        if (matchedFeed?.favicon) return matchedFeed.favicon;
      }

      return '';
    },
    // Returns the inline transform used while a mobile swipe is active.
    mobileSwipeStyle() {
      if (!this.isMobilePortrait && !this.swipeTranslateX) return {};

      return {
        transform: `translateX(${this.swipeTranslateX}px)`,
        transition: this.swipeTracking ? 'none' : 'transform 180ms ease'
      };
    }
  },
  methods: {
    // Formats stored tag names for display.
    formatTagName,
    // Converts score values stored as either 0-1 or 0-100 into percentages.
    scoreAsPercent(value) {
      const score = Number(value);
      if (!Number.isFinite(score)) return 0;
      return score <= 1 ? score * 100 : score;
    },
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
      if (!event.matches) this.resetSwipe();
    },
    // Starts tracking a right-swipe favorite gesture in mobile portrait mode.
    onSwipeTouchStart(event) {
      if (!this.isMobilePortrait || event.touches.length !== 1) {
        this.resetSwipe();
        return;
      }

      const touch = event.touches[0];
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.swipeTranslateX = 0;
      this.swipeTracking = true;
      this.swipeLocked = false;
      this.swipeSuppressClick = false;
    },
    // Updates the article offset while ignoring vertical scroll gestures.
    onSwipeTouchMove(event) {
      if (!this.swipeTracking || !this.isMobilePortrait) return;
      if (event.touches.length !== 1) {
        this.resetSwipe();
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - this.swipeStartX;
      const deltaY = touch.clientY - this.swipeStartY;

      if (!this.swipeLocked && Math.abs(deltaY) > Math.abs(deltaX)) {
        this.resetSwipe();
        return;
      }

      if (deltaX <= 0) {
        this.swipeTranslateX = 0;
        return;
      }

      this.swipeLocked = true;
      this.swipeSuppressClick = true;
      this.swipeTranslateX = Math.min(deltaX, SWIPE_MAX);
      if (event.cancelable) event.preventDefault();
    },
    // Toggles favorite status when the swipe crosses the threshold.
    onSwipeTouchEnd() {
      if (!this.swipeTracking) return;

      const shouldToggle = this.swipeTranslateX >= SWIPE_THRESHOLD;
      this.swipeTracking = false;

      if (shouldToggle) this.markAsFavorite();

      this.resetSwipe(false);
      if (this.swipeSuppressClick) {
        window.setTimeout(() => {
          this.swipeSuppressClick = false;
        }, 250);
      }
    },
    // Resets all swipe gesture state.
    resetSwipe(clearSuppressClick = true) {
      this.swipeTranslateX = 0;
      this.swipeTracking = false;
      this.swipeLocked = false;
      if (clearSuppressClick) this.swipeSuppressClick = false;
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
      if (this.swipeSuppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (this.$store.data.currentSelection.viewMode === 'minimal') {
        if (event.target?.closest?.('a, button, .dropdown-menu')) return;
        if (this.isMinimalContentOpen) {
          this.$emit('minimal-article-closed', { id: this.id });
          return;
        }

        this.$emit('minimal-article-opened', { id: this.id, status: this.status });
      }
    },
    // Requests a read/unread toggle from the compact list status control.
    toggleMinimalReadStatus() {
      this.$emit('toggle-minimal-read-status', { id: this.id, status: this.status });
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
      // Toggle favorite status.
      const updateType = this.favoriteInd ? 'unmark' : 'mark';
      const newFavoriteInd = this.favoriteInd ? 0 : 1;
      
      markArticleAsFavoriteAPI(this.id, updateType)
      .then(response => {
        const category = this.$store.data.categories.find(
          c => c.id === response.data.feed.categoryId
        );
        if (category) {
          const delta = newFavoriteInd ? 1 : -1;
          category.favoriteCount += delta;
          const feed = category.feeds.find(f => f.id === response.data.feedId);
          if (feed) feed.favoriteCount += delta;
        }
        newFavoriteInd
          ? this.$store.data.increaseFavoriteCount()
          : this.$store.data.decreaseFavoriteCount();

        this.$emit('update-favorite', { id: this.id, favoriteInd: newFavoriteInd });
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
    // Expands or collapses related articles for the selected event or topic.
    viewClusterArticles(eventId) {
      if (this.clusterExpanded) {
        this.clusterExpanded = false;
        this.$emit('cluster-articles-collapsed', { articleId: this.id });
        return;
      }

      const grouping = this.$store.data.currentSelection.grouping;
      const fetchRelatedArticles = grouping === 'topic'
        ? fetchTopicArticles
        : fetchEventArticles;

      console.log(`Fetching ${grouping} articles for event:`, eventId);
      fetchRelatedArticles(eventId, this.id)
      .then(response => {
        this.clusterExpanded = true;
        this.$emit('cluster-articles-loaded', {
          articleId: this.id,
          clusterId: eventId,
          articles: response.data.articles || []
        });
      })
      .catch(error => {
        console.error(`Error fetching ${grouping} articles:`, error);
      });
    },
    // Expands or collapses duplicates belonging to this canonical article.
    viewDuplicateArticles() {
      if (this.duplicatesExpanded) {
        this.duplicatesExpanded = false;
        this.$emit('duplicate-articles-collapsed', { articleId: this.id });
        return;
      }

      fetchDuplicateArticles(this.id)
      .then(response => {
        this.duplicatesExpanded = true;
        this.$emit('duplicate-articles-loaded', {
          articleId: this.id,
          articles: response.data.articles || []
        });
      })
      .catch(error => {
        console.error('Error fetching duplicate articles:', error);
      });
    }
  }
};
</script>

<style>
.article-card .article-full-content iframe {
  display: none;
}

.article-card .article-full-content iframe.rssmonster-youtube-frame {
  display: block;
  width: 100% !important;
  max-width: 760px !important;
  aspect-ratio: 16 / 9;
  height: auto !important;
  border: 0;
  border-radius: 8px;
  background: #000;
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

.article-card .article-content-wrapper figure.rssmonster-youtube-embed {
  width: 100% !important;
  max-width: 760px !important;
  margin: 14px 0 !important;
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

.media-video-icon {
  color: #dc2626;
}

.bluesky-icon {
  color: #1185fe;
}

.reddit-icon {
  color: #ff4500;
}

.github-icon {
  color: #000;
}

.mastodon-icon {
  color: #6364ff;
}

.medium-icon {
  color: #000;
}

.podcast-icon {
  color: #1e40af;
}

.cluster-icon {
  color: var(--article-hot-icon);
}

.recommendation-icon {
  color: var(--article-hot-icon);
  font-size: 0.85rem;
  opacity: 0.8;
}

@media (prefers-color-scheme: dark) {
  :root[data-theme='dark'] .media-video-icon {
    color: #991b1b;
  }

  :root[data-theme='dark'] .bluesky-icon {
    color: #0866c6;
  }

  :root[data-theme='dark'] .reddit-icon {
    color: #b83200;
  }

  :root[data-theme='dark'] .github-icon {
    color: #fff;
  }

  :root[data-theme='dark'] .mastodon-icon {
    color: #4547d9;
  }

  :root[data-theme='dark'] .medium-icon {
    color: #fff;
  }

  :root[data-theme='dark'] .podcast-icon {
    color: #1e3a8a;
  }
}

:root[data-theme='dark'] .media-video-icon {
  color: #991b1b;
}

:root[data-theme='dark'] .bluesky-icon {
  color: #0866c6;
}

:root[data-theme='dark'] .reddit-icon {
  color: #b83200;
}

:root[data-theme='dark'] .github-icon {
  color: #fff;
}

:root[data-theme='dark'] .mastodon-icon {
  color: #4547d9;
}

:root[data-theme='dark'] .medium-icon {
  color: #fff;
}

:root[data-theme='dark'] .podcast-icon {
  color: #1e3a8a;
}

.article-card .article-body {
  padding: 4px 48px 4px 16px;
  font-family: var(--font-family);
  margin-top: 6px;
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

.article-signal-bar {
  align-items: center;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  color: #7c2d12;
  display: flex;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 500;
  gap: 10px;
  margin: 12px 0 8px;
  padding: 10px 14px;
}

.signal-badge {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  white-space: nowrap;
}

.signal-icon {
  font-size: 15px;
  line-height: 1;
}

.signal-divider {
  background: #fdba74;
  height: 16px;
  opacity: 0.8;
  width: 1px;
}

:root[data-theme='dark'] .article-signal-bar {
  background: rgba(124, 45, 18, 0.22);
  border-color: rgba(253, 186, 116, 0.42);
  color: #fed7aa;
}

:root[data-theme='dark'] .signal-divider {
  background: rgba(253, 186, 116, 0.55);
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

.article-header-actions {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.article-read-status-button {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  color: var(--article-heading-text);
  display: inline-flex;
  height: 30px;
  justify-content: center;
  line-height: 1;
  opacity: 0.7;
  padding: 0;
  width: 30px;
}

.article-read-status-button svg {
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
  color: var(--toolbar-text) !important;
  font-size: 14px !important;
  font-weight: 500;
  padding: 6px 8px !important;
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

/* Keep mobile portrait metadata and visible tags in one wrapping row. */
@media (max-width: 766px) and (orientation: portrait) {
  .article-card .article-body {
    padding: 4px 8px 4px 8px;
  }

  .article-divider {
    margin-right: 8px;
    margin-left: 8px;
  }

  .article-card .meta-row {
    align-items: center;
    gap: 8px;
  }

  .article-card .article-meta {
    display: contents;
  }

  .article-card .article-tags {
    display: contents;
  }

  .article-card .article-meta .mobile-rule-tag {
    margin-left: 0;
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

.duplicate-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  background-color: var(--badge-duplicate-bg);
  color: var(--badge-duplicate-text);
  white-space: nowrap;
  vertical-align: middle;
  opacity: 0.85;
  cursor: pointer;
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

.article-list-card {
  padding-top: 0 !important;
  margin-bottom: 0;
}

.article-list-row {
  min-height: 68px;
  padding: 12px 16px;
  display: grid;
  grid-template-columns: 18px 24px minmax(0, 1fr) auto;
  column-gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--article-border, var(--border-subtle, #E5E7EB));
  background: var(--bg-page);
  font-family: var(--font-family);
}

.article-list-row:hover {
  background: var(--bg-sidebar, var(--bg-menu-item, var(--bg-subtle)));
}

.article-list-row.active,
.article-list-row.selected,
.article-card.active .article-list-row {
  background: var(--bg-selected-soft, var(--article-active-background));
}

.article-list-row.hot {
  background-color: var(--article-hot-background);
  border-color: var(--article-highlight-border);
}

.article-list-row.favorited {
  background-color: var(--desktop-toolbar-background);
}

.article-list-card.cluster-article,
.article-list-card.cluster-article .article-list-row {
  background-color: var(--article-cluster-background);
}

.article-list-card.article-list-card-selected {
  background: transparent;
}

.article-list-card.article-list-card-selected:focus {
  outline: 0;
}

.article-list-card.article-list-card-selected .article-list-row {
  background: var(--reader-list-item-selected-background);
}

.article-list-card.article-list-card-selected .article-list-row:hover {
  background: var(--reader-list-selected-hover-background);
}

.article-list-card .article-divider {
  display: none;
}

.mobile-swipe-action {
  display: none;
}

.article-list-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 34px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.article-list-source {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-meta, var(--text-muted));
  font-size: 15px;
}

.article-list-source img,
.article-list-source .favicon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
}

.article-list-main {
  min-width: 0;
}

.article-list-title {
  margin: 0;
  min-width: 0;
}

.article-list-title a {
  color: var(--article-heading-text);
  font-size: 16px;
  line-height: 1.35;
  font-weight: 700;
  text-decoration: none;
  display: block;
  overflow-wrap: anywhere;
}

.article-list-title a:hover {
  color: var(--article-heading-text);
  text-decoration: none;
}

.article-list-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-meta, var(--text-muted));
  font-size: 13px;
  line-height: 1.3;
}

.article-list-meta .article-list-feed {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-list-dot {
  color: var(--text-meta, var(--text-muted));
}

.article-list-meta .mobile-rule-tag {
  display: inline-flex;
  margin-left: 0;
}

.article-list-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  align-self: center;
  white-space: nowrap;
}

.article-list-time {
  color: var(--text-meta, var(--text-muted));
  font-size: 13px;
  min-width: 72px;
  text-align: right;
}

.article-list-action-button,
.article-list-actions .dropdown .btn {
  width: 34px !important;
  height: 34px !important;
  border: 1px solid transparent !important;
  border-radius: 8px !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  color: var(--text-meta, var(--text-muted)) !important;
  cursor: pointer;
  opacity: 1;
  padding: 0 !important;
}

.article-list-action-button:hover,
.article-list-actions .dropdown .btn:hover {
  background: var(--bg-menu-item, var(--bg-subtle)) !important;
  color: var(--article-heading-text) !important;
}

.article-list-favorite-button .bi {
  color: var(--article-star-icon);
}

.article-list-card .article-content-wrapper {
  margin: 0;
  padding: 10px 16px 12px 70px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--article-border, var(--border-subtle, #E5E7EB));
}

.article-list-card > .article-media {
  width: auto;
  max-width: none;
  margin: 0;
  padding: 10px 16px 0 70px;
  background: var(--bg-page);
}

@media (max-width: 766px) and (orientation: portrait) {
  .mobile-swipe-shell {
    position: relative;
    overflow: hidden;
  }

  .mobile-swipe-action {
    position: absolute;
    inset: 0 auto 0 0;
    width: 128px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    pointer-events: none;
  }

  .mobile-swipe-action .bi {
    font-size: 30px;
    line-height: 1;
  }

  .mobile-swipe-content {
    position: relative;
    z-index: 1;
    background: var(--bg-card);
    will-change: transform;
    touch-action: pan-y pinch-zoom;
  }

  .article-list-row {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    column-gap: 10px;
    padding: 12px 10px;
  }

  .article-list-source {
    display: none;
  }

  .article-list-time {
    display: none;
  }

  .article-list-actions {
    gap: 4px;
  }

  .article-list-card .article-content-wrapper {
    padding-left: 40px;
    padding-right: 10px;
  }

  .article-list-card > .article-media {
    padding-left: 40px;
    padding-right: 10px;
  }

  :root[data-theme='dark'] .mobile-swipe-shell,
  :root[data-theme='dark'] .mobile-swipe-action {
    color: var(--text-primary);
  }

  :root[data-theme='dark'] .mobile-swipe-content {
    background: var(--bg-card);
  }
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

  .article-card .article-body.favorited {
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
    color: var(--toolbar-text) !important;
  }

  .article-card .dropdown-item:hover,
  .article-card .dropdown-item:focus {
    background-color: var(--bg-modal);
    color: var(--toolbar-text) !important;
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

  .article-list-card,
  .article-list-row {
    background: var(--dark-bg-page, var(--dark-page-surface));
    border-bottom-color: var(--dark-border, var(--border-color));
  }

  .article-list-row:hover {
    background: var(--dark-bg-hover, var(--bg-control));
  }

  .article-list-row.active,
  .article-list-row.selected,
  .article-card.active .article-list-row {
    background: #1E3A8A;
  }

  .article-list-card.cluster-article,
  .article-list-card.cluster-article .article-list-row {
    background-color: var(--article-cluster-background-dark);
  }

  .article-list-row.hot,
  .article-list-row.favorited {
    background-color: var(--dark-bg-page, var(--dark-page-surface));
    border-color: var(--dark-border, var(--border-color));
  }

  .article-list-card.article-list-card-selected {
    background: transparent;
  }

  .article-list-card.article-list-card-selected:focus {
    outline: 0;
  }

  .article-list-card.article-list-card-selected .article-list-row {
    background: var(--reader-list-item-selected-background);
  }

  .article-list-card.article-list-card-selected .article-list-row:hover {
    background: var(--reader-list-selected-hover-background);
  }

  .article-list-meta,
  .article-list-dot,
  .article-list-time,
  .article-list-source,
  .article-list-action-button,
  .article-list-actions .dropdown .btn {
    color: var(--dark-text-meta, var(--text-secondary)) !important;
  }

  .article-list-title a,
  .article-list-title a:hover {
    color: var(--article-heading-text);
  }

  .article-list-action-button:hover,
  .article-list-actions .dropdown .btn:hover {
    background: var(--dark-bg-hover, var(--bg-control)) !important;
    color: var(--dark-text-primary, var(--text-primary)) !important;
  }

  .article-list-card .article-content-wrapper {
    background: var(--dark-bg-page, var(--dark-page-surface));
    border-bottom-color: var(--dark-border, var(--border-color));
  }

  .article-list-card > .article-media {
    background: var(--dark-bg-page, var(--dark-page-surface));
  }
}
</style>
