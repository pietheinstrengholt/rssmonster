<template>
  <div class="article-card" :id="`article-${id}`" :class="[{ 'event-article': isEventArticle }, { 'article-list-card': isMinimalView }]" v-bind="filteredAttrs">
    <div v-if="isMinimalView" class="mobile-swipe-shell">
      <div class="mobile-swipe-action" aria-hidden="true">
        <BootstrapIcon :icon="favoriteInd === 1 ? 'bookmark-x-fill' : 'bookmark-fill'" aria-hidden="true" />
        <span>{{ favoriteInd === 1 ? 'Remove favorite' : 'Add to favorites' }}</span>
      </div>
      <ArticleHeadlineRow
        ref="articleHeading"
        :url="url"
        :title="title"
        :status="status"
        :favorite-ind="favoriteInd"
        :favorite-pending="favoriteMutationPending"
        :hot-ind="hotInd"
        :mobile-swipe-style="mobileSwipeStyle"
        :feed-favicon="feedFavicon"
        :source-label="author || feed.feedName"
        :event-id="event?.id"
        :source-count="event?.sourceCount || 0"
        :event-article-count-total="eventArticleCountTotal"
        :grouping="selectionStore.currentSelection.grouping"
        :is-event-article="isEventArticle"
        :is-developing-story="isDevelopingStory"
        :duplicate-count="duplicateCount"
        :event-expanded="eventExpanded"
        :duplicates-expanded="duplicatesExpanded"
        :tags="tags || []"
        :published-at="publishedAt"
        :has-article-preview="hasArticlePreview"
        @article-clicked="articleClicked"
        @article-touched="articleTouched"
        @swipe-touch-start="onSwipeTouchStart"
        @swipe-touch-move="onSwipeTouchMove"
        @swipe-touch-end="onSwipeTouchEnd"
        @swipe-cancel="resetSwipe"
        @toggle-read-status="toggleMinimalReadStatus"
        @view-event-articles="viewEventArticles"
        @view-duplicate-articles="viewDuplicateArticles"
        @select-tag="selectTag"
        @toggle-favorite="markAsFavorite"
        @not-interested="markNotInterested"
        @more-like-this="moreLikeThis"
        @mute-feed="muteFeedSevenDays"
      />
    </div>
    <div v-else class="mobile-swipe-shell">
      <div class="mobile-swipe-action" aria-hidden="true">
        <BootstrapIcon :icon="favoriteInd === 1 ? 'bookmark-x-fill' : 'bookmark-fill'" aria-hidden="true" />
        <span>{{ favoriteInd === 1 ? 'Remove favorite' : 'Add to favorites' }}</span>
      </div>
      <div class="article-body mobile-swipe-content" :class="[{ favorited: favoriteInd === 1, hot: hotInd === 1 }, isUnread && predictedAffinity ? `affinity-${predictedAffinity}` : '']" :style="mobileSwipeStyle" @click="articleTouched($event)" @touchstart.passive="onSwipeTouchStart" @touchmove="onSwipeTouchMove" @touchend="onSwipeTouchEnd" @touchcancel="resetSwipe">
        <div class="article-layout">
          <ArticleHeader ref="articleHeading" :url="url" :title="title" :clickedAmount="clickedAmount" :favoriteInd="favoriteInd" :favoritePending="favoriteMutationPending" :hotInd="hotInd" :status="status" :viewMode="selectionStore.currentSelection.viewMode" :hasVideoMedia="hasVideoMedia" :isDeveloping="isDevelopingStory" :hasInterestScore="hasInterestScore" :isGroupedView="isGroupedView" :eventArticleCountTotal="eventArticleCountTotal" @article-clicked="articleClicked" @toggle-favorite="markAsFavorite" @toggle-read-status="$emit('toggle-read-status', { id, status })" @not-interested="markNotInterested" @more-like-this="moreLikeThis" @mute-feed="muteFeedSevenDays" />
          <div class="meta-row">
            <ArticleMeta :published-at="publishedAt" :feed="feed" :author="author" :event="event" :eventArticleCountTotal="eventArticleCountTotal" :duplicateCount="duplicateCount" :grouping="selectionStore.currentSelection.grouping" :isEventArticle="isEventArticle" :eventExpanded="eventExpanded" :duplicatesExpanded="duplicatesExpanded" :isMobilePortrait="isMobilePortrait" :quality="quality" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :neutralScore="NEUTRAL_SCORE" @view-event-articles="viewEventArticles" @view-duplicate-articles="viewDuplicateArticles" />
            <ArticleTagsScores v-if="selectionStore.currentSelection.viewMode !== 'minimal'" :categoryName="categoryName" :tags="tags || []" :roundedQuality="roundedQuality" :advertisementScore="advertisementScore" :sentimentScore="sentimentScore" :qualityScore="qualityScore" :showQuality="quality !== undefined && roundedQuality !== NEUTRAL_SCORE" :showAdvertisement="advertisementScore !== undefined && advertisementScore < NEUTRAL_SCORE" :showSentiment="sentimentScore !== undefined && sentimentScore !== NEUTRAL_SCORE" :showWritingQuality="qualityScore !== undefined && qualityScore !== NEUTRAL_SCORE" @select-category="selectCategory" @select-tag="selectTag" />
          </div>
          <ArticlePreviewFallback v-if="!hasArticlePreview" :url="url" @open-original="articleClicked" />
          <div v-if="articleSignals.length" class="article-signal-bar" aria-label="Article relevance signals">
            <template v-for="(signal, index) in articleSignals" :key="signal.label">
              <span v-if="index > 0" class="signal-divider" aria-hidden="true"></span>
              <span class="signal-badge">
                <BootstrapIcon :icon="signal.icon" class="signal-icon" aria-hidden="true" />
                {{ signal.label }}
              </span>
            </template>
          </div>
        </div>
        <ArticleMedia v-if="shouldRenderMedia" :media="media" :articleUrl="url" :imageUrl="imageUrl" :contentHtml="displayContent" :title="title" @media-clicked="articleClicked" />
        <ArticleContent :viewMode="selectionStore.currentSelection.viewMode" :content="displayContent" :imageUrl="imageUrl" :contentSummaryBullets="contentSummaryBullets" :visibleBulletCount="visibleBulletCount" :shouldShowImage="shouldShowImage && !hasVideoMedia" :showMinimalContent="showMinimalContent" />
      </div>
    </div>
    <ArticleMedia v-if="isMinimalView && shouldRenderMedia" :media="media" :articleUrl="url" :imageUrl="imageUrl" :contentHtml="displayContent" :title="title" @media-clicked="articleClicked" />
    <ArticleContent v-if="isMinimalView" :viewMode="selectionStore.currentSelection.viewMode" :content="displayContent" :imageUrl="imageUrl" :contentSummaryBullets="contentSummaryBullets" :visibleBulletCount="visibleBulletCount" :shouldShowImage="shouldShowImage && !hasVideoMedia" :showMinimalContent="shouldShowMinimalContent" />
    <div class="article-divider"></div>
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import ArticleHeader from './ArticleHeader.vue';
import ArticleMeta from './ArticleMeta.vue';
import ArticleTagsScores from './ArticleTagsScores.vue';
import ArticleContent from './ArticleContent.vue';
import ArticleHeadlineRow from './ArticleHeadlineRow.vue';
import ArticleMedia from './ArticleMedia.vue';
import ArticlePreviewFallback from './ArticlePreviewFallback.vue';
import { articleActionMethods } from './helpers/articleActions.js';
import {
  createArticleExpansionState,
  articleExpansionMethods
} from './helpers/articleExpansion.js';
import { articleSignalComputed } from './helpers/articleSignals.js';
import {
  createArticleMobileSwipeState,
  articleMobileSwipeComputed,
  articleMobileSwipeMethods
} from './helpers/mobileSwipe.js';
import { hasRenderableContent } from '../../utils/content';
import { useMediaQuery } from '../../composables/useMediaQuery.js';
import { safeDescriptionFallbackHtml } from '../../services/articleContentService.js';

const NEUTRAL_SCORE = 70;

export default {
  inheritAttrs: false,
  components: { ArticleHeader, ArticleMeta, ArticleTagsScores, ArticleContent, ArticleHeadlineRow, ArticleMedia, ArticlePreviewFallback },
  emits: ['update-favorite', 'update-clicked', 'toggle-read-status', 'minimal-article-opened', 'minimal-article-closed', 'toggle-minimal-read-status', 'event-articles-loaded', 'event-articles-collapsed', 'duplicate-articles-loaded', 'duplicate-articles-collapsed', 'article-not-interested'],
  props: {
    id: { type: [Number, String], required: true },
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    publishedAt: { type: [String, Date], default: '' },
    feed: { type: Object, default: () => ({}) },
    content: { type: String, default: '' },
    description: { type: String, default: '' },
    descriptionHtml: { type: String, default: '' },
    descriptionText: { type: String, default: '' },
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
    isDevelopingStory: { type: Boolean, default: false },
    event: { type: Object, default: null },
    duplicateCount: { type: Number, default: 0 },
    contentSummaryBullets: { type: Array, default: () => [] },
    isEventArticle: { type: Boolean, default: false },
    presentation: { type: Object, default: null },
    isMinimalContentOpen: { type: Boolean, default: false }
  },
  // Exposes portrait eligibility while swipe gesture behavior remains component-owned.
  setup() {
    return {
      isMobilePortrait: useMediaQuery('(max-width: 879px) and (orientation: portrait)')
    };
  },
  data() {
    return {
      ...createArticleExpansionState(),
      ...createArticleMobileSwipeState(),
      showMinimalContent: false,
      favoriteMutationPending: false,
      clickMutationPending: false,
      NEUTRAL_SCORE
    };
  },
  watch: {
    // This function cancels an active swipe when portrait eligibility ends.
    isMobilePortrait(matches) {
      if (!matches) this.resetSwipe();
    }
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore),
    ...articleSignalComputed,
    ...articleMobileSwipeComputed,

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
        'contentoriginal',
        'contentOriginal',
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
    // Returns the article feed's category name.
    categoryName() {
      if (!this.feed?.categoryId) return '';
      const category = this.overviewStore.categories.find(c => c.id === this.feed.categoryId);
      return category?.name || '';
    },
    // Returns sanitized article HTML, escaping raw descriptions for legacy rows only.
    displayContent() {
      return this.contentHtml ||
        this.content ||
        this.descriptionHtml ||
        safeDescriptionFallbackHtml(this.description);
    },
    // Returns whether the article card will actually render content, a description, or video media.
    hasArticlePreview() {
      return hasRenderableContent(this.displayContent)
        || this.shouldRenderMedia;
    },
    // Converts the quality score to a percentage.
    roundedQuality() {
      return Math.round((this.quality || 0) * 100);
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
    // Returns whether normalized media exposes at least one safe client-renderable asset.
    hasPresentableMedia() {
      if (!this.media || typeof this.media !== 'object' || Array.isArray(this.media)) return false;

      const isSafeUrl = value => {
        try {
          return ['http:', 'https:'].includes(new URL(String(value || '')).protocol);
        } catch {
          return false;
        }
      };
      const sourceUrls = Array.isArray(this.media.sources)
        ? this.media.sources.map(source => source?.url)
        : [];

      if (this.media.type === 'gallery') {
        return Array.isArray(this.media.items) && this.media.items.some(item => isSafeUrl(item?.url));
      }
      if (this.media.type === 'image') return isSafeUrl(this.media.url);
      if (this.media.type === 'audio') return [this.media.url, ...sourceUrls].some(isSafeUrl);
      if (this.media.type === 'video') {
        return [this.media.url, this.media.thumbnailUrl, this.url, ...sourceUrls].some(isSafeUrl);
      }
      return isSafeUrl(this.media.url);
    },
    // Returns whether normalized media belongs in the active article view.
    shouldRenderMedia() {
      if (!this.hasPresentableMedia) return false;

      const viewMode = this.selectionStore.currentSelection.viewMode;
      return viewMode === 'full' ||
        viewMode === 'reader' ||
        (viewMode === 'minimal' && this.shouldShowMinimalContent);
    },
    // Returns the total number of articles in the active event view.
    eventArticleCountTotal() {
      if (!this.event) return 0;
      if (this.selectionStore.currentSelection.grouping === 'topic') {
        return Number(this.event.topicArticleCount ?? this.event.articleCount ?? 0);
      }
      return Number(this.event.articleCount || 0);
    },
    // Determines whether the active view is grouped.
    isGroupedView() {
      return this.selectionStore.currentSelection.grouping !== 'none';
    },
    // Determines whether the article has a non-zero interest score.
    hasInterestScore() {
      const score = Number(this.interestScore);
      return Number.isFinite(score) && score !== 0;
    },
    // Returns whether the article should use the compact list row.
    isMinimalView() {
      return this.selectionStore.currentSelection.viewMode === 'minimal';
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

      for (const category of this.overviewStore.categories) {
        const matchedFeed = category.feeds?.find(feed => String(feed.id) === targetFeedId);
        if (matchedFeed?.favicon) return matchedFeed.favicon;
      }

      return '';
    }
  },
  methods: {
    ...articleActionMethods,
    ...articleExpansionMethods,
    ...articleMobileSwipeMethods,

    // Opens the original article through the active presentation component's public contract.
    openOriginalArticle() {
      this.$refs.articleHeading?.openOriginalArticle?.();
    },

    // Toggles minimal article content when the article is touched.
    articleTouched(event) {
      if (this.swipeSuppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (this.selectionStore.currentSelection.viewMode === 'minimal') {
        if (event.target?.closest?.('a, button, .app-dropdown__menu')) return;
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
      this.selectionStore.setTag(tag?.name || '');
    },
    // Selects the article feed's category.
    selectCategory() {
      if (this.feed?.categoryId) {
        this.selectionStore.selectCategory(this.feed.categoryId);
      }
    }
  }
};
</script>

<style src="./articleContentOverrides.css"></style>

<style scoped>
.article-body.affinity-muted {
  opacity: 0.55;
}

.article-body.affinity-compact {
  --article-title-size: 17px;
}

.article-body.affinity-expanded {
  --article-title-size: 20px;
}

/* Landscape phones and portrait tablets */
@media (max-width: 879px) {
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
@media (min-width: 880px) {
  .article-card {
    padding-top: 4px;
  }
}

.article-card {
  background-color: var(--bg-card);
  content-visibility: auto;
  contain-intrinsic-size: auto 720px;
  margin-bottom: 0px;
}

/* Lets an open article menu escape rendering containment and overlay surrounding content. */
:global(.article-card:has(.article-actions .app-dropdown__menu--open)) {
  content-visibility: visible;
  position: relative;
  z-index: 1040;
}

.article-card.event-article {
  background-color: var(--article-event-background);
}

.article-card.event-article .article-body {
  background-color: var(--article-event-background);
}

.article-card .article-body.hot {
  border-color: var(--article-highlight-border);
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

:global(:root[data-theme='dark'] .article-card .article-divider) {
  background-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .article-card .article-body) {
  background-color: var(--dark-page-surface);
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .article-card.event-article),
:global(:root[data-theme='dark'] .article-card.event-article .article-body) {
  background-color: var(--article-event-background-dark);
}

.article-card .meta-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
}

/* Lets every metadata badge share one wrapping row across child components. */
.article-card .meta-row :deep(.article-meta),
.article-card .meta-row :deep(.article-tags) {
  display: contents;
}

.article-signal-bar {
  align-items: center;
  background: var(--article-signal-surface);
  border: 1px solid var(--article-signal-border);
  border-radius: 8px;
  color: var(--article-signal-text);
  display: flex;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 600;
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
  background: var(--article-signal-divider);
  height: 16px;
  opacity: 0.8;
  width: 1px;
}

:global(:root[data-theme='dark'] .article-card .article-signal-bar) {
  background: var(--article-signal-surface);
  border-color: var(--article-signal-border);
  color: var(--article-signal-text);
}

:global(:root[data-theme='dark'] .article-card .signal-divider) {
  background: var(--article-signal-divider);
}

@media (max-width: 879px) and (orientation: portrait) {
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

  .article-card .article-body {
    --article-title-size: 18px;
  }
}

.article-card.active {
  background-color: var(--article-active-background);
}

@media (min-width: 880px) {
  .article-card .meta-row {
    gap: 14px;
  }
}

.article-list-card {
  contain-intrinsic-size: auto 72px;
  padding-top: 0 !important;
  margin-bottom: 0;
}

@media print {
  .article-card {
    content-visibility: visible;
    contain-intrinsic-size: none;
  }
}

.article-list-card.event-article {
  background-color: var(--article-event-background);
}

.article-list-card.article-list-card-selected {
  background: var(--color-transparent);
}

.article-list-card:focus:not(:focus-visible) {
  outline: none;
}

.article-list-card:focus-visible {
  outline: 3px solid var(--border-focus);
  outline-offset: -3px;
}

.article-list-card .article-divider {
  display: none;
}

.mobile-swipe-action {
  display: none;
}

.article-list-card > .article-media {
  width: auto;
  max-width: none;
  margin: 0;
  padding: 10px 16px 0 70px;
  background: var(--bg-page);
}

@media (max-width: 879px) and (orientation: portrait) {
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

  .article-list-card > .article-media {
    padding-left: 40px;
    padding-right: 10px;
  }

  :global(:root[data-theme='dark'] .article-card .mobile-swipe-shell),
  :global(:root[data-theme='dark'] .article-card .mobile-swipe-action) {
    color: var(--text-primary);
  }

  :global(:root[data-theme='dark'] .article-card .mobile-swipe-content) {
    background: var(--bg-card);
  }
}

:global(:root[data-theme='dark'] .article-card),
:global(:root[data-theme='dark'] .article-card .article-body) {
  color: var(--article-content-text);
  background: var(--dark-page-surface);
  border-color: var(--dark-page-surface);
  border-bottom-color: var(--border-subtle);
  background-color: var(--dark-page-surface);
}

:global(:root[data-theme='dark'] .article-card) {
  border-bottom-color: var(--dark-page-surface);
}

:global(:root[data-theme='dark'] .article-card .article-body) {
  border-bottom-color: var(--dark-contrast);
  border-width: 0px;
  border-radius: 0px;
}

:global(:root[data-theme='dark'] .article-card .article-body.hot) {
  background-color: var(--dark-page-surface);
  border-color: var(--dark-page-surface);
}

:global(:root[data-theme='dark'] .article-card .article-body.favorited) {
  background-color: var(--dark-page-surface);
}

:global(:root[data-theme='dark'] .article-card.event-article),
:global(:root[data-theme='dark'] .article-card.event-article .article-body) {
  background-color: var(--article-event-background-dark);
}

:global(:root[data-theme='dark'] .article-card.article-list-card) {
  background: var(--dark-bg-page, var(--dark-page-surface));
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .article-card.article-list-card.event-article) {
  background-color: var(--article-event-background-dark);
}

:global(:root[data-theme='dark'] .article-card.article-list-card.article-list-card-selected) {
  background: var(--color-transparent);
}

:global(:root[data-theme='dark'] .article-card.article-list-card > .article-media) {
  background: var(--dark-bg-page, var(--dark-page-surface));
}
</style>
