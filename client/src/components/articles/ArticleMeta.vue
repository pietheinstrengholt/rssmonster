<template>
  <div class="article-meta">
    <BootstrapIcon v-if="isMobilePortrait && quality !== undefined && roundedQuality !== neutralScore" :icon="getQualityIcon(roundedQuality)" :class="['mobile-score-icon', 'quality-icon', getQualityClass(roundedQuality)]" :title="`Overall quality: ${roundedQuality} (${scoreLabel(roundedQuality)})`" />
    <BootstrapIcon v-if="isMobilePortrait && advertisementScore !== undefined && advertisementScore < neutralScore" icon="megaphone-fill" class="mobile-score-icon ad-icon" :title="`Promotional content detected (score: ${advertisementScore})`" />
    <BootstrapIcon v-if="isMobilePortrait && sentimentScore !== undefined && sentimentScore < neutralScore" icon="arrow-down-circle-fill" :class="['mobile-score-icon', 'sentiment-icon', getSentimentClass(sentimentScore)]" :title="`Tone quality: ${sentimentScore}`" />
    <span class="article-published">{{ formatDate(published) }}</span><span class="break">·</span>
    <span class="article-source"><a target="_blank" :href="mainURL(feed.url)">{{ author || feed.feedName }}</a></span>
    <span v-if="cluster && clusterCountTotal > 1 && grouping !== 'none' && cluster.sourceCount >= 2" class="source-badge" :title="`${cluster.sourceCount} unique sources`"><BootstrapIcon icon="people-fill" class="source-diversity-icon" />{{ cluster.sourceCount }} sources</span>
    <span v-if="cluster && clusterCountTotal > 1 && grouping !== 'none'" class="similar-badge" @click.stop="$emit('view-cluster-articles', cluster.id)">+{{ clusterCountTotal - 1 }} similar article{{ clusterCountTotal - 1 === 1 ? '' : 's' }}</span>
    <span v-for="tag in ruleTags" :key="'mobile-rule-' + tag.id" class="tag tag-rule mobile-rule-tag" @click.stop="$emit('select-tag', tag)">{{ formatTagName(tag.name) }}</span>
  </div>
</template>

<script>
import { formatTagName } from '../../utils/tags';

export default {
  emits: ['select-category', 'select-tag', 'view-cluster-articles'],
  props: {
    published: { type: [String, Date], default: '' }, feed: { type: Object, default: () => ({}) }, author: { type: String, default: '' }, cluster: { type: Object, default: null }, clusterCountTotal: { type: Number, default: 0 }, grouping: { type: String, default: '' }, ruleTags: { type: Array, default: () => [] }, isMobilePortrait: { type: Boolean, default: false }, quality: { type: Number, default: undefined }, roundedQuality: { type: Number, default: 0 }, advertisementScore: { type: Number, default: undefined }, sentimentScore: { type: Number, default: undefined }, neutralScore: { type: Number, required: true }, formatDate: { type: Function, required: true }, mainURL: { type: Function, required: true }, getQualityIcon: { type: Function, required: true }, getQualityClass: { type: Function, required: true }, getSentimentClass: { type: Function, required: true }, scoreLabel: { type: Function, required: true }
  },
  methods: { formatTagName }
};
</script>
