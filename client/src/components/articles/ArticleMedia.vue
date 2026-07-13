<template>
  <div v-if="isVideo" class="article-media">
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
      />
      <span v-else class="article-media-placeholder" aria-hidden="true"></span>
      <span class="article-media-badge">Video</span>
      <span class="article-media-play" aria-hidden="true">
        <i class="bi bi-play-fill"></i>
      </span>
      <span v-if="metadata" class="article-media-metadata">{{ metadata }}</span>
    </a>
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
    title: { type: String, default: '' }
  },
  computed: {
    // Returns whether this component can present the supplied media type.
    isVideo() {
      return this.media?.type === 'video';
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

.article-media-link {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border: 1px solid rgba(17, 24, 39, 0.14);
  border-radius: 8px;
  background: #20252d;
  color: #fff;
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
  background: #20252d;
}

.article-media-badge,
.article-media-metadata {
  position: absolute;
  z-index: 1;
  left: 12px;
  border-radius: 4px;
  background: rgba(17, 24, 39, 0.88);
  color: #fff;
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
  color: #fff;
  transform: translate(-50%, -50%);
}

.article-media-play i {
  margin-left: 4px;
  font-size: 34px;
  line-height: 1;
}

.article-media-link:focus-visible {
  outline: 3px solid var(--border-focus, #2563eb);
  outline-offset: 2px;
}

@media (max-width: 766px) {
  .article-media-play {
    width: 54px;
    height: 54px;
  }

  .article-media-play i {
    font-size: 30px;
  }
}

@media (prefers-color-scheme: dark) {
  .article-media-link {
    border-color: rgba(255, 255, 255, 0.18);
    background: #11151b;
  }
}

:global(:root[data-theme='dark']) .article-media-link {
  border-color: rgba(255, 255, 255, 0.18);
  background: #11151b;
}
</style>
