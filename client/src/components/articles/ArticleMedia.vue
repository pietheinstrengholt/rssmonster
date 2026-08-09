<template>
  <div v-if="isNativeMedia && safeSources.length" class="article-media article-media-inline">
    <video
      v-if="isVideo"
      class="article-media-native"
      controls
      preload="metadata"
      :poster="thumbnailUrl || undefined"
    >
      <source v-for="source in safeSources" :key="source.url" :src="source.url" :type="source.mimeType || undefined" />
      <track
        v-for="track in safeTracks"
        :key="`${track.kind}-${track.language || ''}-${track.url}`"
        :src="track.url"
        :kind="track.kind"
        :srclang="track.language || undefined"
        :label="track.label || undefined"
        :default="track.default || undefined"
      />
      <a v-if="destinationUrl" :href="destinationUrl" target="_blank" rel="noopener noreferrer">Watch video</a>
    </video>
    <audio v-else class="article-media-native" controls preload="metadata">
      <source v-for="source in safeSources" :key="source.url" :src="source.url" :type="source.mimeType || undefined" />
      <track
        v-for="track in safeTracks"
        :key="`${track.kind}-${track.language || ''}-${track.url}`"
        :src="track.url"
        :kind="track.kind"
        :srclang="track.language || undefined"
        :label="track.label || undefined"
        :default="track.default || undefined"
      />
      <a v-if="destinationUrl" :href="destinationUrl" target="_blank" rel="noopener noreferrer">Listen to audio</a>
    </audio>
    <span v-if="metadata" class="article-media-inline-metadata">{{ metadata }}</span>
  </div>
  <div v-else-if="isVideo" class="article-media">
    <a
      v-if="destinationUrl"
      class="article-media-link"
      :href="destinationUrl"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="linkLabel"
      @click="$emit('media-clicked')"
    >
      <img
        v-if="thumbnailUrl"
        class="article-media-thumbnail"
        :src="thumbnailUrl"
        :alt="thumbnailAlt"
        loading="lazy"
        decoding="async"
      />
      <span v-else class="article-media-placeholder" aria-hidden="true"></span>
      <span class="article-media-badge">Video</span>
      <span class="article-media-play" aria-hidden="true">
        <BootstrapIcon icon="play-fill" />
      </span>
      <span v-if="metadata" class="article-media-metadata">{{ metadata }}</span>
    </a>
  </div>
  <figure v-else-if="isSingleImage && visibleImages.length" class="article-media article-media-image">
    <a :href="visibleImages[0].url" target="_blank" rel="noopener noreferrer" :aria-label="imageLinkLabel(visibleImages[0], 0)">
      <img :src="visibleImages[0].thumbnailUrl || visibleImages[0].url" :alt="imageAlt(visibleImages[0], 0)" loading="lazy" decoding="async" />
    </a>
  </figure>
  <div v-else-if="isGallery && visibleImages.length" class="article-media article-media-gallery" role="group" :aria-label="galleryLabel">
    <a
      v-for="(item, index) in visibleImages"
      :key="item.url"
      class="article-media-gallery-item"
      :href="item.url"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="imageLinkLabel(item, index)"
    >
      <img :src="item.thumbnailUrl || item.url" :alt="imageAlt(item, index)" loading="lazy" decoding="async" />
    </a>
  </div>
  <div v-else-if="fallbackUrl" class="article-media article-media-fallback">
    <a :href="fallbackUrl" target="_blank" rel="noopener noreferrer">{{ fallbackLabel }}</a>
  </div>
</template>

<script>
const PROVIDER_LABELS = {
  'nu.nl': 'NU.nl',
  youtube: 'YouTube',
  vimeo: 'Vimeo'
};

export default {
  emits: ['media-clicked'],
  props: {
    media: { type: Object, required: true },
    articleUrl: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    contentHtml: { type: String, default: '' },
    title: { type: String, default: '' }
  },
  computed: {
    // Returns whether this component can present the supplied media type.
    isVideo() {
      return this.media?.type === 'video';
    },
    // Returns whether the payload represents one image attachment.
    isSingleImage() {
      return this.media?.type === 'image';
    },
    // Returns whether the payload represents an image collection.
    isGallery() {
      return this.media?.type === 'gallery';
    },
    // Returns whether structured media should use native guarded controls.
    isNativeMedia() {
      return this.media?.type === 'audio' ||
        (this.media?.type === 'video' && (
          this.media?.provider === 'inline' ||
          String(this.media?.mimeType || '').toLowerCase().startsWith('video/') ||
          Array.isArray(this.media?.sources)
        ));
    },
    // Returns deduplicated HTTP(S) sources eligible for native playback.
    safeSources() {
      const candidates = Array.isArray(this.media?.sources) && this.media.sources.length
        ? this.media.sources
        : [{ url: this.media?.url, mimeType: this.media?.mimeType }];
      const sourcesByUrl = new Map();
      for (const source of candidates) {
        const url = this.safeHttpUrl(source?.url);
        if (url && !sourcesByUrl.has(url)) sourcesByUrl.set(url, { ...source, url });
      }
      return [...sourcesByUrl.values()];
    },
    // Returns only safe caption and subtitle tracks for native media controls.
    safeTracks() {
      return (Array.isArray(this.media?.tracks) ? this.media.tracks : [])
        .map(track => ({ ...track, url: this.safeHttpUrl(track?.url) }))
        .filter(track => track.url && ['captions', 'subtitles'].includes(track.kind));
    },
    // Returns safe image items not already represented by the hero or article body.
    visibleImages() {
      const items = this.isGallery
        ? (Array.isArray(this.media?.items) ? this.media.items : [])
        : [this.media];
      const excludedUrls = new Set([
        this.normalizedHttpUrl(this.imageUrl),
        ...this.contentImageUrls
      ].filter(Boolean));
      const imagesByUrl = new Map();

      for (const item of items) {
        const url = this.safeHttpUrl(item?.url);
        if (!url) continue;
        const normalizedUrl = this.normalizedHttpUrl(url);
        if (!normalizedUrl || excludedUrls.has(normalizedUrl) || imagesByUrl.has(normalizedUrl)) continue;

        const thumbnailUrl = this.safeHttpUrl(item?.thumbnailUrl);
        imagesByUrl.set(normalizedUrl, { ...item, url, thumbnailUrl });
      }

      return [...imagesByUrl.values()];
    },
    // Returns normalized image URLs already rendered by sanitized article HTML.
    contentImageUrls() {
      if (!this.contentHtml || typeof DOMParser === 'undefined') return [];

      try {
        const document = new DOMParser().parseFromString(this.contentHtml, 'text/html');
        const urls = [];
        document.querySelectorAll('img, picture source').forEach(element => {
          const candidates = [
            element.getAttribute('src'),
            ...String(element.getAttribute('srcset') || '')
              .split(',')
              .map(candidate => candidate.trim().split(/\s+/)[0])
          ];
          candidates.forEach(candidate => {
            const normalizedUrl = this.normalizedHttpUrl(candidate);
            if (normalizedUrl) urls.push(normalizedUrl);
          });
        });
        return urls;
      } catch {
        return [];
      }
    },
    // Returns the safe original media or article URL opened by the poster.
    destinationUrl() {
      return this.safeHttpUrl(this.media?.url) || this.safeHttpUrl(this.articleUrl);
    },
    // Returns the safe feed thumbnail, falling back to the article lead image.
    thumbnailUrl() {
      return this.safeHttpUrl(this.media?.thumbnailUrl) || this.safeHttpUrl(this.imageUrl);
    },
    // Returns optional provider and duration text.
    metadata() {
      return [this.providerLabel, this.durationLabel].filter(Boolean).join(' · ');
    },
    // Returns a display-friendly provider name.
    providerLabel() {
      const provider = String(this.media?.provider || '').trim();
      if (!provider) return '';

      return PROVIDER_LABELS[provider.toLowerCase()] ||
        provider.charAt(0).toUpperCase() + provider.slice(1);
    },
    // Returns feed duration in a compact clock format.
    durationLabel() {
      const duration = Number(this.media?.durationSeconds);
      if (!Number.isFinite(duration) || duration < 0) return '';

      const totalSeconds = Math.floor(duration);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = String(totalSeconds % 60).padStart(2, '0');

      return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
        : `${minutes}:${seconds}`;
    },
    // Returns accessible thumbnail text based on the article title.
    thumbnailAlt() {
      return this.title ? `${this.title} video thumbnail` : 'Video thumbnail';
    },
    // Returns the link label announced to assistive technology.
    linkLabel() {
      return this.title ? `Watch video: ${this.title}` : 'Watch video';
    },
    // Returns an accessible gallery label based on the article title.
    galleryLabel() {
      return this.title ? `Image gallery: ${this.title}` : 'Image gallery';
    },
    // Returns the safe destination for unsupported but downloadable media.
    fallbackUrl() {
      if (['image', 'gallery'].includes(this.media?.type)) return '';
      return this.safeHttpUrl(this.media?.url);
    },
    // Returns a neutral label for unsupported attachment types.
    fallbackLabel() {
      return this.title ? `Open media for ${this.title}` : 'Open media attachment';
    }
  },
  methods: {
    // This function accepts only HTTP(S) URLs for media navigation and images.
    safeHttpUrl(value) {
      try {
        const parsed = new URL(String(value || ''));
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
      } catch {
        return '';
      }
    },
    // This function canonicalizes a safe URL for duplicate comparisons only.
    normalizedHttpUrl(value) {
      const safeUrl = this.safeHttpUrl(value);
      if (!safeUrl) return '';

      const parsed = new URL(safeUrl);
      parsed.hash = '';
      if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      return parsed.href;
    },
    // This function returns useful publisher alt text or a stable article-based fallback.
    imageAlt(item, index) {
      const supplied = String(item?.alt || item?.title || '').trim();
      if (supplied) return supplied;
      if (this.title) return this.isGallery ? `${this.title}, image ${index + 1}` : this.title;
      return this.isGallery ? `Gallery image ${index + 1}` : 'Article image';
    },
    // This function describes the result of opening a full-size media image.
    imageLinkLabel(item, index) {
      return `Open full-size image: ${this.imageAlt(item, index)}`;
    }
  }
};
</script>

<style scoped>
.article-media {
  width: 100%;
  max-width: 760px;
  margin: 14px 0;
}

.article-media-inline {
  display: grid;
  gap: 6px;
}

.article-media-native {
  display: block;
  width: 100%;
  max-height: min(70vh, 640px);
}

audio.article-media-native {
  min-height: 40px;
}

.article-media-inline-metadata {
  color: var(--text-secondary);
  font-size: 12px;
}

.article-media-image {
  margin-inline: 0;
}

.article-media-image img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: min(70vh, 720px);
  border-radius: 8px;
}

.article-media-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 10px;
}

.article-media-gallery-item {
  overflow: hidden;
  min-height: 140px;
  border-radius: 8px;
  background: var(--article-media-surface);
}

.article-media-gallery-item img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 140px;
  max-height: 360px;
  object-fit: cover;
}

.article-media-image a:focus-visible,
.article-media-gallery-item:focus-visible,
.article-media-fallback a:focus-visible {
  outline: 3px solid var(--border-focus);
  outline-offset: 2px;
}

.article-media-fallback {
  font-size: 14px;
}

.article-media-link {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--border-media-overlay);
  border-radius: 8px;
  background: var(--article-media-surface);
  color: var(--text-inverted);
  text-decoration: none;
}

.article-media-thumbnail,
.article-media-placeholder {
  display: block;
  width: 100%;
  height: 100%;
}

.article-media-thumbnail {
  object-fit: cover;
}

.article-media-placeholder {
  background: var(--article-media-surface);
}

.article-media-badge,
.article-media-metadata {
  position: absolute;
  z-index: 1;
  left: 12px;
  border-radius: 4px;
  background: rgba(17, 24, 39, 0.88);
  color: var(--text-inverted);
  font-size: 12px;
  line-height: 1;
}

.article-media-badge {
  top: 12px;
  padding: 6px 8px;
  font-weight: 600;
}

.article-media-metadata {
  bottom: 12px;
  padding: 6px 8px;
  font-weight: 500;
}

.article-media-play {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border-radius: 50%;
  background: rgba(17, 24, 39, 0.88);
  color: var(--text-inverted);
  transform: translate(-50%, -50%);
}

.article-media-play .bi {
  margin-left: 4px;
  font-size: 34px;
  line-height: 1;
}

.article-media-link:focus-visible {
  outline: 3px solid var(--border-focus);
  outline-offset: 2px;
}

@media (max-width: 879px) {
  .article-media-play {
    width: 54px;
    height: 54px;
  }

  .article-media-play .bi {
    font-size: 30px;
  }
}

:global(:root[data-theme='dark'] .article-card .article-media-link) {
  border-color: var(--border-media-overlay);
}
</style>
