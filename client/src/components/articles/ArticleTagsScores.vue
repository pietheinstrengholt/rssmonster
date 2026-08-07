<template>
  <div v-if="categoryName || tags.length || showQuality || showAdvertisement || showSentiment || showWritingQuality" class="article-tags">
    <button v-if="categoryName" type="button" class="tag-badge" :aria-label="`Filter articles by category ${categoryName}`" @click.stop="$emit('select-category')">{{ categoryName }}</button>
    <button v-for="tag in tags" :key="tag.id" type="button" :class="['tag', { 'tag-rule': tag.tagType === 'rule' }]" :aria-label="`Filter articles by tag ${formatTagName(tag.name)}`" @click.stop="$emit('select-tag', tag)">{{ formatTagName(tag.name) }}</button>
    <span v-if="showQuality" :class="['score', 'overall-score', scoreSeverityClass(roundedQuality)]" :title="`Overall quality: ${roundedQuality} (${scoreLabel(roundedQuality)})`">Quality: {{ roundedQuality }} · {{ scoreLabel(roundedQuality) }}</span>
    <span v-if="showAdvertisement" :class="['score', 'ad-score', scoreSeverityClass(advertisementScore)]" :title="`Promotional content detected (score: ${advertisementScore})`">Ads: {{ advertisementScore }}</span>
    <span v-if="showSentiment" :class="['score', 'sentiment-score', scoreSeverityClass(sentimentScore)]" :title="`Tone quality: ${sentimentScore}`">Sentiment: {{ sentimentScore }}</span>
    <span v-if="showWritingQuality" :class="['score', 'quality-score', scoreSeverityClass(qualityScore)]" :title="`Writing quality: ${qualityScore}`">Writing: {{ qualityScore }}</span>
  </div>
</template>
<script>
import { formatTagName } from '../../utils/tags';

// Maps every analysis score onto the shared poor, medium, or good visual scale.
const scoreSeverityClass = score => {
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-medium';
  return 'score-poor';
};

export default { emits: ['select-category', 'select-tag'], props: { categoryName: { type: String, default: '' }, tags: { type: Array, default: () => [] }, roundedQuality: { type: Number, default: 0 }, advertisementScore: { type: Number, default: undefined }, sentimentScore: { type: Number, default: undefined }, qualityScore: { type: Number, default: undefined }, neutralScore: { type: Number, required: true }, scoreLabel: { type: Function, required: true }, showQuality: { type: Boolean, default: false }, showAdvertisement: { type: Boolean, default: false }, showSentiment: { type: Boolean, default: false }, showWritingQuality: { type: Boolean, default: false } }, methods: { formatTagName, scoreSeverityClass } };
</script>

<style scoped>
.article-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.tag-badge,
.tag,
.score {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  vertical-align: middle;
}

.tag-badge,
.tag {
  appearance: none;
  font-family: inherit;
  cursor: pointer;
}

.tag-badge {
  background-color: var(--color-transparent);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.tag {
  background-color: var(--article-tag-background);
  border: 1px solid var(--color-transparent);
  color: var(--badge-tag-text);
}

.tag.tag-rule {
  background-color: var(--article-rule-tag-background);
  color: var(--article-rule-tag-text);
}

.score {
  border: 1px solid var(--color-transparent);
  background-color: var(--bg-subtle);
  color: var(--article-score-text);
}

.score.score-poor {
  background-color: var(--article-score-poor-background);
  color: var(--article-score-poor-text);
}

.score.score-medium {
  background-color: var(--article-score-medium-background);
  color: var(--article-score-medium-text);
}

.score.score-good {
  background-color: var(--article-score-good-background);
  color: var(--article-score-good-text);
}

.tag-badge:focus-visible,
.tag:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-tags {
    gap: 8px;
    min-width: 0;
  }

  .tag:not(.tag-rule),
  .score {
    display: none;
  }
}

:global(:root[data-theme='dark'] .article-card .article-tags .tag-badge) {
  background-color: var(--color-transparent);
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .article-card .article-tags .tag) {
  background-color: var(--article-tag-background-dark);
  color: var(--article-tag-text-dark);
}

:global(:root[data-theme='dark'] .article-card .article-tags .tag.tag-rule) {
  background-color: var(--article-rule-tag-background-dark);
  color: var(--article-rule-tag-text-dark);
}
</style>
