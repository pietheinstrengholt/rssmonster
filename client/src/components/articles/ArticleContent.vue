<template>
  <div v-if="viewMode === 'full' || viewMode === 'reader'" class="article-content-wrapper"><div v-if="hasContent" class="article-full-content" v-html="contentOriginal"></div><div v-if="shouldShowImage && imageUrl && !hasArticleContent && !isImageUrlInContent" class="media-content enclosure"><img :src="imageUrl" alt="Image" /></div></div>
  <div v-else-if="viewMode === 'summarized'" class="article-content-wrapper"><p v-if="hasContent" class="article-full-content">{{ stripHTML(contentOriginal) }}</p></div>
  <div v-else-if="viewMode === 'minimal' && showMinimalContent" class="article-content-wrapper"><div v-if="hasContent" class="article-full-content" v-html="contentOriginal"></div></div>
  <div v-else-if="viewMode === 'summaryBullets'" class="article-content-wrapper"><ul v-if="contentSummaryBullets && contentSummaryBullets.length" class="article-summary"><li v-for="(bullet, index) in contentSummaryBullets.slice(0, visibleBulletCount)" :key="index">{{ bullet }}</li></ul><p v-else class="article-full-content">No summary available.</p></div>
</template>
<script>
const NULL_CONTENT = '<html><head></head><body>null</body></html>';
export default {
  props: { viewMode: { type: String, default: '' }, contentOriginal: { type: String, default: '' }, imageUrl: { type: String, default: '' }, contentSummaryBullets: { type: Array, default: () => [] }, visibleBulletCount: { type: Number, default: Infinity }, shouldShowImage: { type: Boolean, default: true }, showMinimalContent: { type: Boolean, default: false } },
  computed: { hasContent() { return this.contentOriginal !== NULL_CONTENT; }, hasArticleContent() { const text = String(this.contentOriginal || '').replace(/<(.|\n)*?>/g, ' ').replace(/&nbsp;/gi, ' ').trim(); return text.length > 0; }, isImageUrlInContent() { const encodedUrl = this.imageUrl.replace(/&/g, '&amp;'); return this.contentOriginal.includes(this.imageUrl) || this.contentOriginal.includes(encodedUrl); } },
  methods: { stripHTML(value) { return value.replace(/<(.|\n)*?>/g, '').split(/\s+/).slice(0, 100).join(' '); } }
};
</script>
