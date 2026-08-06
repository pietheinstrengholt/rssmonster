<template>
  <div class="article-meta">
    <BootstrapIcon v-if="isMobilePortrait && quality !== undefined && roundedQuality !== neutralScore" :icon="getQualityIcon(roundedQuality)" :class="['mobile-score-icon', 'quality-icon', getQualityClass(roundedQuality)]" :title="`Overall quality: ${roundedQuality} (${scoreLabel(roundedQuality)})`" />
    <BootstrapIcon v-if="isMobilePortrait && advertisementScore !== undefined && advertisementScore < neutralScore" icon="megaphone-fill" class="mobile-score-icon ad-icon" :title="`Promotional content detected (score: ${advertisementScore})`" />
    <BootstrapIcon v-if="isMobilePortrait && sentimentScore !== undefined && sentimentScore < neutralScore" icon="arrow-down-circle-fill" :class="['mobile-score-icon', 'sentiment-icon', getSentimentClass(sentimentScore)]" :title="`Tone quality: ${sentimentScore}`" />
    <span v-if="hasProvenance" class="article-provenance">
      <span v-if="hasPublishedAt" class="article-published">{{ formatDate(publishedAt) }}</span>
      <span v-if="hasPublishedAt && hasSource" class="article-provenance-separator" aria-hidden="true">·</span>
      <span v-if="hasSource" class="article-source"><a target="_blank" :href="sourceUrl">{{ sourceLabel }}</a></span>
    </span>
    <span v-if="!isEventArticle && event && eventArticleCountTotal > 1 && grouping !== 'none' && event.sourceCount >= 2" class="source-badge" :title="`${event.sourceCount} unique sources`"><BootstrapIcon icon="people-fill" class="source-diversity-icon" />{{ event.sourceCount }} sources</span>
    <button v-if="!isEventArticle && event && eventArticleCountTotal > 1 && grouping !== 'none'" type="button" class="similar-badge" :aria-label="`${eventExpanded ? 'Hide' : 'Show'} ${eventArticleCountTotal - 1} similar article${eventArticleCountTotal - 1 === 1 ? '' : 's'}`" :aria-expanded="eventExpanded ? 'true' : 'false'" @click.stop="$emit('view-event-articles', event.id)">+{{ eventArticleCountTotal - 1 }} similar article{{ eventArticleCountTotal - 1 === 1 ? '' : 's' }}</button>
    <button v-if="duplicateCount > 0" type="button" class="duplicate-badge" :aria-label="`${duplicatesExpanded ? 'Hide' : 'Show'} ${duplicateCount} duplicate article${duplicateCount === 1 ? '' : 's'}`" :aria-expanded="duplicatesExpanded ? 'true' : 'false'" @click.stop="$emit('view-duplicate-articles')">{{ duplicateCount }} duplicate{{ duplicateCount === 1 ? '' : 's' }}</button>
  </div>
</template>

<script>
export default {
  emits: ['view-event-articles', 'view-duplicate-articles'],
  props: {
    publishedAt: { type: [String, Date], default: '' }, feed: { type: Object, default: () => ({}) }, author: { type: String, default: '' }, event: { type: Object, default: null }, eventArticleCountTotal: { type: Number, default: 0 }, duplicateCount: { type: Number, default: 0 }, grouping: { type: String, default: '' }, isEventArticle: { type: Boolean, default: false }, eventExpanded: { type: Boolean, default: false }, duplicatesExpanded: { type: Boolean, default: false }, isMobilePortrait: { type: Boolean, default: false }, quality: { type: Number, default: undefined }, roundedQuality: { type: Number, default: 0 }, advertisementScore: { type: Number, default: undefined }, sentimentScore: { type: Number, default: undefined }, neutralScore: { type: Number, required: true }, formatDate: { type: Function, required: true }, mainURL: { type: Function, required: true }, getQualityIcon: { type: Function, required: true }, getQualityClass: { type: Function, required: true }, getSentimentClass: { type: Function, required: true }, scoreLabel: { type: Function, required: true }
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
      return this.hasSource ? this.mainURL(this.feed?.url) : '';
    }
  }
};
</script>
