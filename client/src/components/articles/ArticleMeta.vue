<template>
  <div class="article-meta">
    <BootstrapIcon v-if="isMobilePortrait && quality !== undefined && roundedQuality !== neutralScore" :icon="getQualityIcon(roundedQuality)" :class="['mobile-score-icon', 'quality-icon', getQualityClass(roundedQuality)]" :title="`Overall quality: ${roundedQuality} (${scoreLabel(roundedQuality)})`" />
    <BootstrapIcon v-if="isMobilePortrait && advertisementScore !== undefined && advertisementScore < neutralScore" icon="megaphone-fill" class="mobile-score-icon ad-icon" :title="`Promotional content detected (score: ${advertisementScore})`" />
    <BootstrapIcon v-if="isMobilePortrait && sentimentScore !== undefined && sentimentScore < neutralScore" icon="arrow-down-circle-fill" :class="['mobile-score-icon', 'sentiment-icon', getSentimentClass(sentimentScore)]" :title="`Tone quality: ${sentimentScore}`" />
    <span class="article-published">{{ formatDate(publishedAt) }}</span><span class="break">·</span>
    <span class="article-source"><a target="_blank" :href="mainURL(feed.url)">{{ author || feed.feedName }}</a></span>
    <span v-if="event && eventArticleCountTotal > 1 && grouping !== 'none' && event.sourceCount >= 2" class="source-badge" :title="`${event.sourceCount} unique sources`"><BootstrapIcon icon="people-fill" class="source-diversity-icon" />{{ event.sourceCount }} sources</span>
    <span v-if="isDeveloping" class="developing-badge">Developing</span>
    <span v-if="event && eventArticleCountTotal > 1 && grouping !== 'none'" class="similar-badge" @click.stop="$emit('view-event-articles', event.id)">+{{ eventArticleCountTotal - 1 }} similar article{{ eventArticleCountTotal - 1 === 1 ? '' : 's' }}</span>
    <span v-if="duplicateCount > 0" class="duplicate-badge" @click.stop="$emit('view-duplicate-articles')">{{ duplicateCount }} duplicate{{ duplicateCount === 1 ? '' : 's' }}</span>
    <span v-for="tag in ruleTags" :key="'mobile-rule-' + tag.id" class="tag tag-rule mobile-rule-tag" @click.stop="$emit('select-tag', tag)">{{ formatTagName(tag.name) }}</span>
  </div>
</template>

<script>
import { formatTagName } from '../../utils/tags';

export default {
  emits: ['select-category', 'select-tag', 'view-event-articles', 'view-duplicate-articles'],
  props: {
    publishedAt: { type: [String, Date], default: '' }, feed: { type: Object, default: () => ({}) }, author: { type: String, default: '' }, event: { type: Object, default: null }, isDeveloping: { type: Boolean, default: false }, eventArticleCountTotal: { type: Number, default: 0 }, duplicateCount: { type: Number, default: 0 }, grouping: { type: String, default: '' }, ruleTags: { type: Array, default: () => [] }, isMobilePortrait: { type: Boolean, default: false }, quality: { type: Number, default: undefined }, roundedQuality: { type: Number, default: 0 }, advertisementScore: { type: Number, default: undefined }, sentimentScore: { type: Number, default: undefined }, neutralScore: { type: Number, required: true }, formatDate: { type: Function, required: true }, mainURL: { type: Function, required: true }, getQualityIcon: { type: Function, required: true }, getQualityClass: { type: Function, required: true }, getSentimentClass: { type: Function, required: true }, scoreLabel: { type: Function, required: true }
  },
  methods: { formatTagName }
};
</script>
