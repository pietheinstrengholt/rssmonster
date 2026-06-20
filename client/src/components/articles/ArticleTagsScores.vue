<template>
  <div v-if="categoryName || tags.length || showQuality || showAdvertisement || showSentiment || showWritingQuality" class="article-tags-scores">
    <span v-if="categoryName" class="category-badge" @click.stop="$emit('select-category')">{{ categoryName }}</span>
    <span v-for="tag in tags" :key="tag.id" :class="['tag', { 'tag-rule': tag.tagType === 'rule' }]" @click.stop="$emit('select-tag', tag)">{{ tag.name.toLowerCase() }}</span>
    <span v-if="showQuality" class="score overall-score" :title="`Overall quality: ${roundedQuality} (${scoreLabel(roundedQuality)})`">Quality: {{ roundedQuality }} · {{ scoreLabel(roundedQuality) }}</span>
    <span v-if="showAdvertisement" class="score ad-score" :title="`Promotional content detected (score: ${advertisementScore})`">Ads: {{ advertisementScore }}</span>
    <span v-if="showSentiment" class="score sentiment-score" :title="`Tone quality: ${sentimentScore}`">Sentiment: {{ sentimentScore }}</span>
    <span v-if="showWritingQuality" class="score quality-score" :title="`Writing quality: ${qualityScore}`">Writing: {{ qualityScore }}</span>
  </div>
</template>
<script>
export default { emits: ['select-category', 'select-tag'], props: { categoryName: { type: String, default: '' }, tags: { type: Array, default: () => [] }, roundedQuality: { type: Number, default: 0 }, advertisementScore: { type: Number, default: undefined }, sentimentScore: { type: Number, default: undefined }, qualityScore: { type: Number, default: undefined }, neutralScore: { type: Number, required: true }, scoreLabel: { type: Function, required: true }, showQuality: { type: Boolean, default: false }, showAdvertisement: { type: Boolean, default: false }, showSentiment: { type: Boolean, default: false }, showWritingQuality: { type: Boolean, default: false } } };
</script>
