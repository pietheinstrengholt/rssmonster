<template>
  <div v-if="viewMode === 'full' || viewMode === 'reader'" class="article-content-wrapper"><div v-if="hasContent" class="article-full-content" v-html="renderedContent"></div><div v-if="shouldShowImage && imageUrl && !hasArticleContent && !isImageUrlInContent" class="media-content enclosure"><img :src="imageUrl" alt="Image" /></div></div>
  <div v-else-if="viewMode === 'summarized'" class="article-content-wrapper"><p v-if="hasContent" class="article-full-content">{{ stripHTML(content) }}</p></div>
  <div v-else-if="viewMode === 'minimal' && showMinimalContent" class="article-content-wrapper"><div v-if="hasContent" class="article-full-content" v-html="renderedContent"></div></div>
  <div v-else-if="viewMode === 'summaryBullets'" class="article-content-wrapper"><ul v-if="contentSummaryBullets && contentSummaryBullets.length" class="article-summary"><li v-for="(bullet, index) in contentSummaryBullets.slice(0, visibleBulletCount)" :key="index">{{ bullet }}</li></ul><p v-else class="article-full-content">No summary available.</p></div>
</template>
<script>
const NULL_CONTENT = '<html><head></head><body>null</body></html>';
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export default {
  props: { viewMode: { type: String, default: '' }, content: { type: String, default: '' }, imageUrl: { type: String, default: '' }, contentSummaryBullets: { type: Array, default: () => [] }, visibleBulletCount: { type: Number, default: Infinity }, shouldShowImage: { type: Boolean, default: true }, showMinimalContent: { type: Boolean, default: false } },
  computed: {
    // Returns whether this article has renderable content.
    hasContent() { return this.content !== NULL_CONTENT; },
    // Returns article content with known embeds converted to safe native players.
    renderedContent() { return this.renderArticleEmbeds(this.content); },
    // Returns whether the article body contains readable text.
    hasArticleContent() { const text = String(this.content || '').replace(/<(.|\n)*?>/g, ' ').replace(/&nbsp;/gi, ' ').trim(); return text.length > 0; },
    // Returns whether the fallback image is already present in the article body.
    isImageUrlInContent() { const encodedUrl = this.imageUrl.replace(/&/g, '&amp;'); return this.content.includes(this.imageUrl) || this.content.includes(encodedUrl); }
  },
  methods: {
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
