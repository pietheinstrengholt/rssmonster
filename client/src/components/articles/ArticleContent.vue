<template>
  <div v-if="viewMode === 'full' || viewMode === 'reader'" class="article-content-wrapper" :class="{ 'article-content-with-thumbnail': shouldShowFallbackImage && isInlineLeadImage }"><div v-if="shouldShowFallbackImage" :class="['media-content', 'enclosure', 'article-lead-image', `article-lead-image--${imageDisplayMode}`]" :style="thumbnailStyle"><img class="article-lead-image__media" :src="imageUrl" :width="leadImageDimensions.width || undefined" :height="leadImageDimensions.height || undefined" alt="" loading="lazy" decoding="async" @load="handleLeadImageLoad" @error="handleLeadImageError" /></div><div v-if="hasContent" class="article-full-content" v-html="renderedContent"></div></div>
  <div v-else-if="viewMode === 'summarized'" class="article-content-wrapper"><p v-if="hasContent" class="article-full-content">{{ stripHTML(content) }}</p></div>
  <div v-else-if="viewMode === 'minimal' && showMinimalContent" class="article-content-wrapper"><div v-if="hasContent" class="article-full-content" v-html="renderedContent"></div></div>
  <div v-else-if="viewMode === 'summaryBullets'" class="article-content-wrapper"><ul v-if="contentSummaryBullets && contentSummaryBullets.length" class="article-summary"><li v-for="(bullet, index) in contentSummaryBullets.slice(0, visibleBulletCount)" :key="index">{{ bullet }}</li></ul><p v-else class="article-full-content">No summary available.</p></div>
</template>
<script>
const NULL_CONTENT = '<html><head></head><body>null</body></html>';
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// This function classifies a lead image from its known dimensions.
const classifyLeadImage = (width, height) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'pending';

  const area = width * height;
  const aspectRatio = width / height;
  const isNearSquare = aspectRatio >= 0.8 && aspectRatio <= 1.25;

  if (width <= 2 || height <= 2 || (width < 96 && height < 96) || aspectRatio > 4.5 || aspectRatio < 0.18) return 'hidden';
  if (width >= 640 && height >= 320 && area >= 300000 && aspectRatio > 1.25 && aspectRatio <= 3.2) return 'hero';
  if (width >= 500 && height >= 700 && height / width > 1.35) return 'portrait';
  if (isNearSquare || width < 640 || height < 320) return 'thumbnail';

  return 'thumbnail';
};

// This function normalizes image URLs without discarding meaningful query parameters.
const normalizeImageUrl = value => {
  const decodedUrl = String(value || '').trim().replace(/&amp;/gi, '&');
  if (!decodedUrl) return '';

  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : undefined;
    const parsedUrl = baseUrl ? new URL(decodedUrl, baseUrl) : new URL(decodedUrl);

    if (parsedUrl.pathname.length > 1) {
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    }

    return parsedUrl.href;
  } catch {
    return decodedUrl.length > 1 ? decodedUrl.replace(/\/+$/, '') : decodedUrl;
  }
};

export default {
  props: { viewMode: { type: String, default: '' }, content: { type: String, default: '' }, imageUrl: { type: String, default: '' }, imageWidth: { type: [Number, String], default: null }, imageHeight: { type: [Number, String], default: null }, imageMimeType: { type: String, default: '' }, imageSource: { type: String, default: '' }, contentSummaryBullets: { type: Array, default: () => [] }, visibleBulletCount: { type: Number, default: Infinity }, shouldShowImage: { type: Boolean, default: true }, showMinimalContent: { type: Boolean, default: false } },
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
    hasContent() { return this.content !== NULL_CONTENT; },
    // Returns article content with known embeds converted to safe native players.
    renderedContent() { return this.renderArticleEmbeds(this.content); },
    // Returns whether the article body contains readable text.
    hasArticleContent() { if (!this.hasContent) return false; const text = String(this.content || '').replace(/<(.|\n)*?>/g, ' ').replace(/&nbsp;/gi, ' ').trim(); return text.length > 0; },
    // Returns whether the rendered article body contains an image or picture element.
    hasImageInContent() {
      const html = String(this.renderedContent || '');

      if (typeof DOMParser !== 'undefined') {
        try {
          const document = new DOMParser().parseFromString(html, 'text/html');
          return Boolean(document.querySelector('img, picture'));
        } catch {
          // Fall through to the safe regex check when parsing is unavailable.
        }
      }

      return /<(?:img|picture)\b/i.test(html);
    },
    // Returns whether the fallback image is already present in the article body.
    isImageUrlInContent() {
      const imageUrl = normalizeImageUrl(this.imageUrl);
      const html = String(this.renderedContent || '');
      if (!imageUrl) return false;

      if (typeof DOMParser !== 'undefined') {
        try {
          const document = new DOMParser().parseFromString(html, 'text/html');
          const imageElements = document.querySelectorAll('img, source');

          return Array.from(imageElements).some(element => {
            const src = element.getAttribute('src');
            const srcset = String(element.getAttribute('srcset') || '').split(',').map(candidate => candidate.trim().split(/\s+/)[0]);
            return [src, ...srcset].some(candidate => normalizeImageUrl(candidate) === imageUrl);
          });
        } catch {
          // Fall through to string comparison when parsing is unavailable.
        }
      }

      const decodedHtml = html.replace(/&amp;/gi, '&');
      const rawImageUrl = String(this.imageUrl || '').trim().replace(/&amp;/gi, '&');
      return decodedHtml.includes(rawImageUrl) || decodedHtml.includes(imageUrl);
    },
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
      return classifyLeadImage(this.leadImageDimensions.width, this.leadImageDimensions.height);
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
    shouldShowFallbackImage() { return this.shouldShowImage && Boolean(String(this.imageUrl || '').trim()) && this.hasArticleContent && !this.isImageUrlInContent && this.imageDisplayMode !== 'hidden'; }
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
    },
    // This function strips HTML for summarized article previews.
    stripHTML(value) { return value.replace(/<(.|\n)*?>/g, '').split(/\s+/).slice(0, 100).join(' '); },
    // This function converts known article embed placeholders into iframe markup.
    renderArticleEmbeds(value) {
      const html = String(value || '');

      if (typeof DOMParser === 'undefined') {
        return html;
      }

      const document = new DOMParser().parseFromString(html, 'text/html');
      const embedFigures = document.querySelectorAll('figure.rssmonster-embed[data-provider="youtube"], figure.embed-youtube');

      embedFigures.forEach(figure => {
        const videoId = this.youtubeVideoIdFromFigure(figure);
        if (!videoId) return;

        figure.replaceWith(this.createYouTubeEmbed(document, videoId));
      });

      return document.body.innerHTML;
    },
    // This function extracts a validated YouTube video id from known figure formats.
    youtubeVideoIdFromFigure(figure) {
      const dataVideoId = figure.dataset?.videoId;

      if (this.isValidYouTubeVideoId(dataVideoId)) {
        return dataVideoId;
      }

      const href = figure.querySelector('a[href]')?.getAttribute('href');
      return this.youtubeVideoIdFromUrl(href);
    },
    // This function extracts a YouTube video id from a supported URL.
    youtubeVideoIdFromUrl(value = '') {
      try {
        const parsed = new URL(String(value), window.location.origin);
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        let videoId = null;

        if (hostname === 'youtu.be') {
          videoId = parsed.pathname.split('/').filter(Boolean)[0];
        } else if (hostname === 'youtube.com' && parsed.pathname === '/watch') {
          videoId = parsed.searchParams.get('v');
        } else if (hostname === 'youtube.com' && parsed.pathname.startsWith('/embed/')) {
          videoId = parsed.pathname.split('/').filter(Boolean)[1];
        } else if (hostname === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) {
          videoId = parsed.pathname.split('/').filter(Boolean)[1];
        }

        return this.isValidYouTubeVideoId(videoId) ? videoId : null;
      } catch {
        return null;
      }
    },
    // This function checks whether a value is shaped like a YouTube video id.
    isValidYouTubeVideoId(value) {
      return YOUTUBE_VIDEO_ID_PATTERN.test(String(value || ''));
    },
    // This function creates the safe iframe wrapper used for YouTube videos.
    createYouTubeEmbed(document, videoId) {
      const figure = document.createElement('figure');
      const iframe = document.createElement('iframe');

      figure.className = 'rssmonster-embed rssmonster-youtube-embed';
      figure.dataset.provider = 'youtube';
      figure.dataset.videoId = videoId;

      iframe.className = 'rssmonster-youtube-frame';
      iframe.src = `https://www.youtube.com/embed/${videoId}`;
      iframe.title = 'YouTube video player';
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;

      figure.appendChild(iframe);
      return figure;
    }
  }
};
</script>

<style scoped>
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
</style>
