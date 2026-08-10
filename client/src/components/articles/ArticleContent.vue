<template>
  <div v-if="viewMode === 'full' || viewMode === 'reader'" class="article-content-wrapper" :class="{ 'article-content-with-thumbnail': shouldShowFallbackImage && isInlineLeadImage }"><div v-if="shouldShowFallbackImage" :class="['media-content', 'enclosure', 'article-lead-image', `article-lead-image--${imageDisplayMode}`]" :style="thumbnailStyle"><img class="article-lead-image__media" :src="imageUrl" :width="leadImageDimensions.width || undefined" :height="leadImageDimensions.height || undefined" alt="" loading="lazy" decoding="async" @load="handleLeadImageLoad" @error="handleLeadImageError" /></div><div v-if="hasContent" class="article-full-content" v-html="renderedContent"></div></div>
  <div v-else-if="viewMode === 'summarized'" class="article-content-wrapper"><p v-if="hasContent" class="article-full-content">{{ summarizedContent }}</p></div>
  <div v-else-if="viewMode === 'minimal' && showMinimalContent" class="article-content-wrapper article-content-wrapper--minimal"><div v-if="hasContent" class="article-full-content" v-html="renderedContent"></div></div>
  <div v-else-if="viewMode === 'summaryBullets'" class="article-content-wrapper"><ul v-if="contentSummaryBullets && contentSummaryBullets.length" class="article-summary"><li v-for="(bullet, index) in contentSummaryBullets.slice(0, visibleBulletCount)" :key="index">{{ bullet }}</li></ul><p v-else class="article-full-content">No summary available.</p></div>
</template>
<script>
import {
  NULL_ARTICLE_CONTENT,
  classifyArticleLeadImage,
  normalizeArticleContent,
  summarizeArticleContent
} from '../../services/articleContentService.js';

export default {
  props: { viewMode: { type: String, default: '' }, content: { type: String, default: '' }, contentText: { type: String, default: '' }, imageUrl: { type: String, default: '' }, imageWidth: { type: [Number, String], default: null }, imageHeight: { type: [Number, String], default: null }, imageMimeType: { type: String, default: '' }, imageSource: { type: String, default: '' }, contentSummaryBullets: { type: Array, default: () => [] }, visibleBulletCount: { type: Number, default: Infinity }, shouldShowImage: { type: Boolean, default: true }, showMinimalContent: { type: Boolean, default: false } },
  data() {
    return {
      loadedImageUrl: '',
      failedImageUrl: '',
      runtimeImageWidth: 0,
      runtimeImageHeight: 0
    };
  },
  computed: {
    // Returns whether this article has renderable content.
    hasContent() { return this.content !== NULL_ARTICLE_CONTENT; },
    // Returns cached display HTML and image metadata from one normalization pass.
    normalizedContent() { return normalizeArticleContent(this.content, this.imageUrl); },
    // Returns article content with known compatibility markup normalized for display.
    renderedContent() { return this.normalizedContent.html; },
    // Returns whether the article body contains readable text.
    hasArticleContent() { return this.normalizedContent.hasReadableContent; },
    // Returns normalized and bounded canonical text for summarized article previews.
    summarizedContent() { return summarizeArticleContent(this.contentText); },
    // Returns the persisted dimensions, or natural dimensions discovered after loading.
    leadImageDimensions() {
      const persistedWidth = Number(this.imageWidth);
      const persistedHeight = Number(this.imageHeight);

      if (Number.isFinite(persistedWidth) && persistedWidth > 0 && Number.isFinite(persistedHeight) && persistedHeight > 0) {
        return { width: persistedWidth, height: persistedHeight };
      }

      if (this.loadedImageUrl === String(this.imageUrl || '')) {
        return { width: this.runtimeImageWidth, height: this.runtimeImageHeight };
      }

      return { width: 0, height: 0 };
    },
    // Returns the presentation mode for the separate lead image.
    imageDisplayMode() {
      const imageUrl = String(this.imageUrl || '');
      if (imageUrl && this.failedImageUrl === imageUrl) return 'hidden';
      return classifyArticleLeadImage(this.leadImageDimensions.width, this.leadImageDimensions.height);
    },
    // Returns whether the lead image uses the compact, text-wrapping layout.
    isThumbnailLeadImage() { return this.imageDisplayMode === 'thumbnail' || this.imageDisplayMode === 'pending'; },
    // Returns whether the lead image should sit beside the opening article text.
    isInlineLeadImage() { return this.isThumbnailLeadImage || this.imageDisplayMode === 'portrait'; },
    // Returns the intrinsic-width cap used by thumbnail and pending images.
    thumbnailStyle() {
      if (!this.isThumbnailLeadImage) return undefined;
      const width = this.leadImageDimensions.width || 200;
      return { '--lead-thumbnail-width': `${Math.min(width, 200)}px` };
    },
    // Returns whether the article needs its image URL rendered as a fallback lead image.
    shouldShowFallbackImage() { return this.shouldShowImage && Boolean(String(this.imageUrl || '').trim()) && this.hasArticleContent && !this.normalizedContent.containsFallbackImage && this.imageDisplayMode !== 'hidden'; }
  },
  methods: {
    // This function records natural image dimensions for runtime classification.
    handleLeadImageLoad(event) {
      this.loadedImageUrl = String(this.imageUrl || '');
      this.failedImageUrl = '';
      this.runtimeImageWidth = Number(event.target?.naturalWidth) || 0;
      this.runtimeImageHeight = Number(event.target?.naturalHeight) || 0;
    },
    // This function hides a lead image that fails to load.
    handleLeadImageError() {
      this.failedImageUrl = String(this.imageUrl || '');
    }
  }
};
</script>

<style scoped>
.article-content-wrapper {
  color: var(--text-primary);
  padding-top: 6px;
  font-size: 14px;
  line-height: 1.65;
  font-weight: 400;
  margin: 1px 0 5px;
}

.article-full-content {
  font-family: var(--font-family);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.65;
  font-weight: 400;
}

.article-content-wrapper--minimal {
  margin: 0;
  padding: 10px 16px 12px 70px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--article-border, var(--border-subtle));
}

.article-summary {
  margin: 5px 0;
  padding-left: 20px;
  list-style-type: disc;
}

.article-summary li {
  color: var(--article-content-text);
  font-family: var(--font-family);
  font-size: 14px;
  margin-bottom: 6px;
  line-height: 1.5;
}

:global(:root[data-theme='dark'] .article-card .article-content-wrapper) {
  color: var(--text-primary);
  background: var(--dark-page-surface);
  border-color: var(--dark-page-surface);
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .article-card.event-article .article-content-wrapper) {
  background-color: var(--article-event-background-dark);
}

:global(:root[data-theme='dark'] .article-card .article-summary li) {
  color: var(--article-content-text);
}

.article-lead-image {
  margin: 0 0 14px;
}

.article-content-wrapper .article-lead-image .article-lead-image__media {
  display: block;
  max-width: 100% !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0;
}

.article-lead-image--hero {
  width: 100%;
  overflow: hidden;
  border-radius: 10px;
}

.article-lead-image--hero .article-lead-image__media {
  width: 100%;
  max-height: min(540px, 62vh);
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
}

.article-lead-image--portrait {
  max-width: 34%;
}

.article-lead-image--portrait .article-lead-image__media {
  width: auto;
  max-height: 340px;
  object-fit: contain;
  object-position: left top;
  border-radius: 8px;
}

.article-content-wrapper.article-content-with-thumbnail .article-lead-image--portrait {
  float: left !important;
  width: clamp(160px, 22vw, 240px);
  margin: 0 18px 12px 0;
}

.article-content-wrapper.article-content-with-thumbnail .article-lead-image--thumbnail,
.article-content-wrapper.article-content-with-thumbnail .article-lead-image--pending {
  float: left !important;
  width: min(var(--lead-thumbnail-width), 35%);
  max-width: 35%;
  max-height: none;
  aspect-ratio: 4 / 3;
  margin: 0 16px 10px 0;
  overflow: hidden;
  border-radius: 8px;
}

.article-content-wrapper .article-lead-image--thumbnail .article-lead-image__media,
.article-content-wrapper .article-lead-image--pending .article-lead-image__media {
  width: 100%;
  height: 100% !important;
  max-height: none;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
}

.article-content-with-thumbnail::after {
  display: block;
  clear: both;
  content: '';
}

@media (max-width: 640px) {
  .article-content-wrapper.article-content-with-thumbnail .article-lead-image--portrait {
    float: none !important;
    width: min(100%, 240px);
    max-width: 100%;
    margin: 0 auto 12px;
  }

  .article-content-wrapper.article-content-with-thumbnail .article-lead-image--thumbnail,
  .article-content-wrapper.article-content-with-thumbnail .article-lead-image--pending {
    float: left !important;
    width: clamp(110px, 34vw, 140px);
    max-width: 38%;
    max-height: none;
    margin: 2px 14px 8px 0;
  }

  .article-content-wrapper .article-lead-image--thumbnail .article-lead-image__media,
  .article-content-wrapper .article-lead-image--pending .article-lead-image__media {
    height: 100% !important;
    max-height: none;
    object-fit: cover;
    object-position: center;
  }
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-content-wrapper--minimal {
    padding-left: 40px;
    padding-right: 10px;
  }
}

:global(:root[data-theme='dark'] .article-card .article-content-wrapper--minimal) {
  background: var(--dark-bg-page, var(--dark-page-surface));
  border-bottom-color: var(--border-subtle);
}
</style>
