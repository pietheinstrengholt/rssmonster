<template>
  <div
    class="article-list-row mobile-swipe-content"
    :class="{ 'is-read': status === 'read' }"
    :style="mobileSwipeStyle"
    @click="$emit('article-touched', $event)"
    @touchstart.passive="$emit('swipe-touch-start', $event)"
    @touchmove="$emit('swipe-touch-move', $event)"
    @touchend="$emit('swipe-touch-end', $event)"
    @touchcancel="$emit('swipe-cancel')"
  >
    <button class="article-list-status" type="button" :aria-label="statusToggleLabel" :title="statusToggleLabel" @click.stop="$emit('toggle-read-status')">
      <BootstrapIcon :icon="status === 'read' ? 'circle-fill' : 'record-circle-fill'" aria-hidden="true" />
    </button>
    <div class="article-list-source" aria-hidden="true">
      <img v-if="feedFavicon" :src="feedFavicon" class="favicon" alt="" />
      <BootstrapIcon v-else icon="rss-fill" />
    </div>
    <div class="article-list-main">
      <h5 class="article-list-title">
        <a v-if="safeArticleUrl" ref="originalArticleLink" class="article-link" target="_blank" rel="noopener noreferrer" :href="safeArticleUrl" @click="$emit('article-clicked')"><HighlightedText :text="title" :terms="highlightTerms" /></a>
        <span v-else class="article-link"><HighlightedText :text="title" :terms="highlightTerms" /></span>
      </h5>
      <div class="article-list-meta">
        <span class="article-list-feed">{{ sourceLabel }}</span>
        <span class="article-list-dot">·</span>
        <span v-if="showSourceBadge" class="source-badge" :title="`${sourceCount} unique sources`"><BootstrapIcon icon="people-fill" class="source-diversity-icon" />{{ sourceCount }} sources</span>
        <BootstrapIcon v-if="isDevelopingStory" icon="lightning-charge-fill" class="developing-story-icon" title="Developing story" aria-label="Developing story" />
        <BootstrapIcon v-if="hotInd === 1" icon="fire" class="hot-icon" title="Hot article" aria-label="Hot article" />
        <button v-if="showSimilarBadge" type="button" class="similar-badge" :aria-label="`${eventExpanded ? 'Hide' : 'Show'} ${eventArticleCountTotal - 1} similar article${eventArticleCountTotal - 1 === 1 ? '' : 's'}`" :aria-expanded="eventExpanded ? 'true' : 'false'" @click.stop="$emit('view-event-articles', eventId)">+{{ eventArticleCountTotal - 1 }} similar article{{ eventArticleCountTotal - 1 === 1 ? '' : 's' }}</button>
        <button v-if="duplicateCount > 0" type="button" class="duplicate-badge" :aria-label="`${duplicatesExpanded ? 'Hide' : 'Show'} ${duplicateCount} duplicate article${duplicateCount === 1 ? '' : 's'}`" :aria-expanded="duplicatesExpanded ? 'true' : 'false'" @click.stop="$emit('view-duplicate-articles')">{{ duplicateCount }} duplicate{{ duplicateCount === 1 ? '' : 's' }}</button>
        <button v-for="tag in visibleRuleTags" :key="'list-rule-' + tag.id" type="button" class="tag tag-rule" :aria-label="`Filter articles by tag ${formatTagName(tag.name)}`" @click.stop="$emit('select-tag', tag)">{{ formatTagName(tag.name) }}</button>
        <button v-if="hasHiddenRuleTags" type="button" class="tag-disclosure" :aria-expanded="tagsExpanded ? 'true' : 'false'" :aria-label="tagsExpanded ? 'Show fewer tags' : `Show ${hiddenRuleTagCount} more tags`" @click.stop="tagsExpanded = !tagsExpanded">{{ tagsExpanded ? 'Show less' : `+${hiddenRuleTagCount}` }}</button>
      </div>
      <ArticlePreviewFallback v-if="!hasArticlePreview" :url="url" @open-original="$emit('article-clicked')" />
    </div>
    <div class="article-list-actions">
      <span class="article-list-time">{{ formatDate(publishedAt) }}</span>
      <ArticleActionsMenu :clickedAmount="clickedAmount" :clickPending="clickPending" :favoriteInd="favoriteInd" :favoritePending="favoritePending" @toggle-clicked="$emit('toggle-clicked')" @toggle-favorite="$emit('toggle-favorite')" @not-interested="$emit('not-interested')" @more-like-this="$emit('more-like-this')" @mute-feed="$emit('mute-feed')" />
      <button class="article-list-action-button article-list-favorite-button" type="button" :aria-label="favoriteLabel" :title="favoriteLabel" :disabled="favoritePending" @click.stop="$emit('toggle-favorite')">
        <BootstrapIcon :icon="favoriteInd === 1 ? 'bookmark-fill' : 'bookmark'" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script>
import ArticleActionsMenu from './ArticleActionsMenu.vue';
import ArticlePreviewFallback from './ArticlePreviewFallback.vue';
import HighlightedText from '../shared/HighlightedText.vue';
import { formatRelativeDate } from '../../utils/date';
import { formatTagName } from '../../utils/tags';
import { usableHttpUrl } from '../../utils/content.js';

export default {
  components: { ArticleActionsMenu, ArticlePreviewFallback, HighlightedText },
  emits: ['article-clicked', 'article-touched', 'more-like-this', 'mute-feed', 'not-interested', 'select-tag', 'swipe-cancel', 'swipe-touch-end', 'swipe-touch-move', 'swipe-touch-start', 'toggle-clicked', 'toggle-favorite', 'toggle-read-status', 'view-duplicate-articles', 'view-event-articles'],
  data() {
    return {
      tagsExpanded: false
    };
  },
  props: {
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    status: { type: String, default: '' },
    clickedAmount: { type: Number, default: 0 },
    clickPending: { type: Boolean, default: false },
    favoriteInd: { type: Number, default: 0 },
    favoritePending: { type: Boolean, default: false },
    hotInd: { type: Number, default: 0 },
    mobileSwipeStyle: { type: Object, default: () => ({}) },
    feedFavicon: { type: String, default: '' },
    sourceLabel: { type: String, default: '' },
    eventId: { type: [Number, String], default: null },
    sourceCount: { type: Number, default: 0 },
    eventArticleCountTotal: { type: Number, default: 0 },
    grouping: { type: String, default: 'none' },
    isEventArticle: { type: Boolean, default: false },
    isDevelopingStory: { type: Boolean, default: false },
    duplicateCount: { type: Number, default: 0 },
    eventExpanded: { type: Boolean, default: false },
    duplicatesExpanded: { type: Boolean, default: false },
    tags: { type: Array, default: () => [] },
    publishedAt: { type: [String, Date], default: '' },
    hasArticlePreview: { type: Boolean, default: false },
    highlightTerms: { type: Array, default: () => [] }
  },
  computed: {
    // Returns an absolute HTTP(S) destination eligible for external navigation.
    safeArticleUrl() {
      return usableHttpUrl(this.url);
    },
    // Returns tags assigned by rules for the compact metadata row.
    ruleTags() {
      return (this.tags || []).filter(tag => tag.tagType === 'rule');
    },
    // Returns the rule tags visible at the current disclosure level.
    visibleRuleTags() {
      return this.tagsExpanded ? this.ruleTags : this.ruleTags.slice(0, 3);
    },
    // Returns the number of rule tags hidden by the compact presentation.
    hiddenRuleTagCount() {
      return Math.max(0, this.ruleTags.length - 3);
    },
    // Returns whether the tag list needs an inline disclosure control.
    hasHiddenRuleTags() {
      return this.ruleTags.length > 3;
    },
    // Returns whether grouped-source diversity should be displayed.
    showSourceBadge() {
      return !this.isEventArticle && this.showSimilarBadge && this.sourceCount >= 2;
    },
    // Returns whether grouped similar-article navigation should be displayed.
    showSimilarBadge() {
      return !this.isEventArticle && this.eventId !== null && this.eventArticleCountTotal > 1 && this.grouping !== 'none';
    },
    // Returns the accessible label for the favorite toggle.
    favoriteLabel() {
      return this.favoriteInd === 1 ? 'Unmark favorite' : 'Mark as favorite';
    },
    // Returns the accessible label for the compact read-status control.
    statusToggleLabel() {
      return this.status === 'read' ? 'Mark article as unread' : 'Mark article as read';
    }
  },
  methods: {
    // Opens the original article through the compact row's owned link behavior.
    openOriginalArticle() {
      this.$refs.originalArticleLink?.click();
    },
    // Formats stored tag names for display.
    formatTagName,
    // Formats publication dates as elapsed time.
    formatDate: formatRelativeDate
  }
};
</script>

<style scoped>
.article-list-row {
  min-height: 64px;
  padding: 10px 16px;
  display: grid;
  grid-template-columns: 18px 24px minmax(0, 1fr) auto;
  column-gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--article-border, var(--border-subtle));
  border-left: 3px solid var(--color-transparent);
  background: var(--surface-page);
  font-family: var(--font-family);
  transition: background-color var(--motion-duration-fast) var(--motion-easing-standard), border-color var(--motion-duration-fast) var(--motion-easing-standard);
}

.article-list-row:hover {
  background: var(--surface-chrome);
}

:global(.article-list-card.article-list-card-selected .article-list-row) {
  background: var(--reader-list-item-selected-background);
  border-left-color: var(--reader-list-item-selected-accent);
}

:global(.article-list-card.article-list-card-selected .article-list-row:hover) {
  background: var(--reader-list-selected-hover-background);
}

.article-list-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 34px;
  padding: 0;
  border: 0;
  background: var(--color-transparent);
  color: var(--color-primary);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  transition: color var(--motion-duration-fast) var(--motion-easing-standard), transform var(--motion-duration-fast) var(--motion-easing-standard);
}

.article-list-status:hover {
  transform: scale(1.08);
}

.article-list-status:focus-visible,
.article-list-action-button:focus-visible,
.article-list-actions :deep(.article-actions__trigger:focus-visible) {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
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
  transition: color var(--motion-duration-fast) var(--motion-easing-standard);
}

.article-list-title a:hover {
  color: var(--article-heading-text);
  text-decoration: none;
}

.article-list-row.is-read .article-list-title .article-link {
  color: var(--text-secondary);
  font-weight: 600;
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

.article-list-feed {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-list-dot {
  color: var(--text-meta, var(--text-muted));
}

.tag,
.tag-disclosure,
.similar-badge,
.duplicate-badge {
  appearance: none;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border: 1px solid var(--color-transparent);
  border-radius: 6px;
  font-size: 11px;
  font-family: inherit;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  vertical-align: middle;
}

.tag {
  background-color: var(--article-tag-background);
  color: var(--badge-tag-text);
}

.tag.tag-rule {
  background-color: var(--article-rule-tag-background);
  color: var(--article-rule-tag-text);
}

.tag-disclosure {
  background-color: var(--surface-control);
  border-color: var(--border-subtle);
  color: var(--text-meta, var(--text-muted));
}

.tag-disclosure:hover {
  background-color: var(--surface-chrome);
  color: var(--text-secondary);
}

.similar-badge {
  background-color: var(--badge-similar-bg);
  color: var(--badge-similar-text);
}

.duplicate-badge {
  background-color: var(--badge-duplicate-bg);
  color: var(--badge-duplicate-text);
}

.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background-color: var(--article-source-diversity-background);
  border: 1px solid var(--color-transparent);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--article-source-diversity-text);
  white-space: nowrap;
  vertical-align: middle;
}

.source-diversity-icon {
  font-size: 10px;
}

.developing-story-icon,
.hot-icon {
  display: inline-flex;
  align-items: center;
  font-size: 0.875rem;
  line-height: 1;
  vertical-align: middle;
}

.developing-story-icon {
  color: var(--article-developing-icon);
}

.hot-icon {
  color: var(--article-hot-icon);
}

.tag:focus-visible,
.tag-disclosure:focus-visible,
.similar-badge:focus-visible,
.duplicate-badge:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
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
.article-list-actions :deep(.article-actions__trigger) {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-transparent);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-transparent);
  color: var(--text-meta, var(--text-muted));
  cursor: pointer;
  opacity: 1;
  padding: 0;
}

.article-list-action-button:hover,
.article-list-actions :deep(.article-actions__trigger:hover) {
  background: var(--surface-chrome);
  color: var(--article-heading-text);
}

.article-list-favorite-button .bi {
  color: var(--article-star-icon);
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-list-row {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    column-gap: 10px;
    padding: 10px;
  }

  .article-list-source,
  .article-list-time {
    display: none;
  }

  .article-list-actions {
    gap: 4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .article-list-row,
  .article-list-status,
  .article-list-title a {
    transition: none;
  }
}

:global(:root[data-theme='dark'] .article-card .article-list-row) {
  background: var(--surface-page);
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .article-card .article-list-row:hover) {
  background: var(--surface-control);
}

:global(:root[data-theme='dark'] .article-list-card.article-list-card-selected .article-list-row) {
  background: var(--reader-list-item-selected-background);
  border-left-color: var(--reader-list-item-selected-accent);
}

:global(:root[data-theme='dark'] .article-list-card.article-list-card-selected .article-list-row:hover) {
  background: var(--reader-list-selected-hover-background);
}

:global(:root[data-theme='dark'] .article-card .article-list-meta),
:global(:root[data-theme='dark'] .article-card .article-list-dot),
:global(:root[data-theme='dark'] .article-card .article-list-time),
:global(:root[data-theme='dark'] .article-card .article-list-source),
:global(:root[data-theme='dark'] .article-card .article-list-action-button),
:global(:root[data-theme='dark'] .article-card .article-list-actions .article-actions__trigger) {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-card .article-list-title a),
:global(:root[data-theme='dark'] .article-card .article-list-title a:hover) {
  color: var(--article-heading-text);
}

:global(:root[data-theme='dark'] .article-card .article-list-row.is-read .article-list-title .article-link) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .article-card .article-list-action-button:hover),
:global(:root[data-theme='dark'] .article-card .article-list-actions .article-actions__trigger:hover) {
  background: var(--surface-control);
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark'] .article-card .article-list-meta .developing-story-icon) {
  color: var(--article-developing-icon);
}

:global(:root[data-theme='dark'] .article-card .article-list-meta .similar-badge) {
  background-color: var(--badge-similar-bg);
  color: var(--badge-similar-text);
}

:global(:root[data-theme='dark'] .article-card .article-list-meta .tag) {
  background-color: var(--article-tag-background-dark);
  color: var(--article-tag-text-dark);
}

:global(:root[data-theme='dark'] .article-card .article-list-meta .tag.tag-rule) {
  background-color: var(--article-rule-tag-background-dark);
  color: var(--article-rule-tag-text-dark);
}
</style>
