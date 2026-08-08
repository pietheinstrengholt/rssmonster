<template>
  <div class="article-meta">
    <BootstrapIcon v-if="isMobilePortrait && quality !== undefined && roundedQuality !== neutralScore" :icon="getQualityIcon(roundedQuality)" :class="['mobile-score-icon', 'quality-icon', getQualityClass(roundedQuality)]" :title="`Overall quality: ${roundedQuality} (${scoreLabel(roundedQuality)})`" />
    <BootstrapIcon v-if="isMobilePortrait && advertisementScore !== undefined && advertisementScore < neutralScore" icon="megaphone-fill" class="mobile-score-icon ad-icon" :title="`Promotional content detected (score: ${advertisementScore})`" />
    <BootstrapIcon v-if="isMobilePortrait && sentimentScore !== undefined && sentimentScore < neutralScore" icon="arrow-down-circle-fill" :class="['mobile-score-icon', 'sentiment-icon', getSentimentClass(sentimentScore)]" :title="`Tone quality: ${sentimentScore}`" />
    <span v-if="hasProvenance" class="article-provenance">
      <span v-if="hasPublishedAt" class="article-published">{{ formatRelativeDate(publishedAt) }}</span>
      <span v-if="hasPublishedAt && hasSource" class="article-provenance-separator" aria-hidden="true">·</span>
      <span v-if="hasSource" class="article-source"><a target="_blank" :href="sourceUrl">{{ sourceLabel }}</a></span>
    </span>
    <span v-if="!isEventArticle && event && eventArticleCountTotal > 1 && grouping !== 'none' && event.sourceCount >= 2" class="source-badge" :title="`${event.sourceCount} unique sources`"><BootstrapIcon icon="people-fill" class="source-diversity-icon" />{{ event.sourceCount }} sources</span>
    <button v-if="!isEventArticle && event && eventArticleCountTotal > 1 && grouping !== 'none'" type="button" class="similar-badge" :aria-label="`${eventExpanded ? 'Hide' : 'Show'} ${eventArticleCountTotal - 1} similar article${eventArticleCountTotal - 1 === 1 ? '' : 's'}`" :aria-expanded="eventExpanded ? 'true' : 'false'" @click.stop="$emit('view-event-articles', event.id)">+{{ eventArticleCountTotal - 1 }} similar article{{ eventArticleCountTotal - 1 === 1 ? '' : 's' }}</button>
    <button v-if="duplicateCount > 0" type="button" class="duplicate-badge" :aria-label="`${duplicatesExpanded ? 'Hide' : 'Show'} ${duplicateCount} duplicate article${duplicateCount === 1 ? '' : 's'}`" :aria-expanded="duplicatesExpanded ? 'true' : 'false'" @click.stop="$emit('view-duplicate-articles')">{{ duplicateCount }} duplicate{{ duplicateCount === 1 ? '' : 's' }}</button>
  </div>
</template>

<script>
import {
  getQualityClass,
  getQualityIcon,
  getSentimentClass,
  scoreLabel
} from '../../services/articlePresentation.js';
import { formatRelativeDate } from '../../utils/date.js';

export default {
  emits: ['view-event-articles', 'view-duplicate-articles'],
  props: {
    publishedAt: { type: [String, Date], default: '' }, feed: { type: Object, default: () => ({}) }, author: { type: String, default: '' }, event: { type: Object, default: null }, eventArticleCountTotal: { type: Number, default: 0 }, duplicateCount: { type: Number, default: 0 }, grouping: { type: String, default: '' }, isEventArticle: { type: Boolean, default: false }, eventExpanded: { type: Boolean, default: false }, duplicatesExpanded: { type: Boolean, default: false }, isMobilePortrait: { type: Boolean, default: false }, quality: { type: Number, default: undefined }, roundedQuality: { type: Number, default: 0 }, advertisementScore: { type: Number, default: undefined }, sentimentScore: { type: Number, default: undefined }, neutralScore: { type: Number, required: true }
  },
  computed: {
    // Returns the author or feed name displayed as the article source.
    sourceLabel() {
      return String(this.author || this.feed?.feedName || '').trim();
    },
    // Returns whether the article has a usable publication timestamp.
    hasPublishedAt() {
      if (this.publishedAt instanceof Date) return !Number.isNaN(this.publishedAt.getTime());
      return Boolean(String(this.publishedAt || '').trim());
    },
    // Returns whether source text is available for the provenance group.
    hasSource() {
      return Boolean(this.sourceLabel);
    },
    // Returns whether any provenance value should be rendered.
    hasProvenance() {
      return this.hasPublishedAt || this.hasSource;
    },
    // Returns the source origin while preserving the existing link behavior.
    sourceUrl() {
      if (!this.hasSource) return '';

      const value = this.feed?.url;
      try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}/`;
      } catch {
        return value;
      }
    }
  },
  methods: {
    // Formats publication dates as elapsed time.
    formatRelativeDate,
    // Returns the icon name for a quality score.
    getQualityIcon,
    // Returns the CSS class for a quality score.
    getQualityClass,
    // Returns the CSS class for a sentiment score.
    getSentimentClass,
    // Returns the display label for a score.
    scoreLabel
  }
};
</script>

<style scoped>
.article-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.3;
  max-width: 100%;
  margin: 0;
  min-width: 0;
  font-weight: 400;
}

.article-provenance {
  align-items: center;
  display: inline-flex;
  flex: 0 1 auto;
  gap: 4px;
  max-width: 100%;
  min-width: 0;
}

.article-published,
.article-provenance-separator {
  flex: 0 0 auto;
  white-space: nowrap;
}

.article-published,
.article-source a {
  color: var(--text-muted);
}

.article-provenance-separator {
  font-size: 16px;
  line-height: 1;
}

.article-source {
  min-width: 0;
}

.article-source a {
  overflow-wrap: anywhere;
  text-decoration: none;
}

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

.similar-badge:focus-visible,
.duplicate-badge:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
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
  color: var(--article-sentiment-poor);
}

.mobile-score-icon.sentiment-very-poor {
  color: var(--text-danger-placeholder);
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-meta {
    gap: 8px;
    min-width: 0;
  }
}

@media (min-width: 880px) {
  .article-meta {
    gap: 14px;
  }
}

:global(:root[data-theme='dark'] .article-card .article-meta),
:global(:root[data-theme='dark'] .article-card .article-meta .article-published),
:global(:root[data-theme='dark'] .article-card .article-meta .article-source a) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .article-card.event-article .article-meta) {
  background-color: var(--article-event-background-dark);
}

:global(:root[data-theme='dark'] .article-card .similar-badge) {
  background-color: var(--badge-similar-bg);
  color: var(--badge-similar-text);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.quality-excellent) {
  color: var(--article-quality-excellent);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.quality-good) {
  color: var(--article-quality-good-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.quality-okay) {
  color: var(--article-quality-okay-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.quality-weak) {
  color: var(--article-ad-score-text-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.quality-poor) {
  color: var(--article-quality-poor-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.ad-icon) {
  color: var(--article-ad-score-text-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.sentiment-icon) {
  color: var(--article-sentiment-score-text-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.sentiment-moderate) {
  color: var(--article-sentiment-moderate-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.sentiment-poor) {
  color: var(--article-sentiment-poor-dark);
}

:global(:root[data-theme='dark'] .article-card .mobile-score-icon.sentiment-very-poor) {
  color: var(--article-quality-poor-dark);
}
</style>
