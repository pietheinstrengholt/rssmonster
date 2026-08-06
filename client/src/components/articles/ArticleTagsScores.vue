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
