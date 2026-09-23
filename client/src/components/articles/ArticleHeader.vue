<template>
  <header class="article-header" :class="{ 'article-reader-heading': isReaderDetail }">
    <div v-if="isReaderDetail" class="article-reader-source">
      <img v-if="feedFavicon && !faviconFailed" :src="feedFavicon" class="article-reader-favicon" alt="" @error="faviconFailed = true" />
      <BootstrapIcon v-else icon="rss-fill" context="control" class="article-reader-favicon" aria-hidden="true" />
      <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="article-reader-source-name">{{ feed.feedName || author }}</a>
      <span v-else class="article-reader-source-name">{{ feed.feedName || author }}</span>
      <span v-if="publishedAt" class="article-reader-timestamp">{{ formatRelativeDate(publishedAt) }}</span>
    </div>
    <component :is="isReaderDetail ? 'h1' : 'h5'" class="article-header-left" :class="{ 'article-reader-title': isReaderDetail }">
      <BootstrapIcon v-if="isBlueSkyArticle" icon="bluesky" class="article-kind-icon bluesky-icon" />
      <BootstrapIcon v-if="isRedditArticle" icon="reddit" class="article-kind-icon reddit-icon" />
      <BootstrapIcon v-if="isGitHubArticle" icon="github" class="article-kind-icon github-icon" />
      <BootstrapIcon v-if="isMastodonArticle" icon="mastodon" class="article-kind-icon mastodon-icon" />
      <BootstrapIcon v-if="isMediumArticle" icon="medium" class="article-kind-icon medium-icon" />
      <BootstrapIcon v-if="isPodcastArticle" icon="mic-fill" class="article-kind-icon podcast-icon" />
      <ArticleDevelopingStoryPopover
        v-if="isDeveloping"
        class="article-kind-popover"
        :article-id="articleId"
        :icon-class="['article-kind-icon', 'developing-story-icon']"
      />
      <BootstrapIcon v-if="hasVideoMedia" icon="play-btn-fill" class="article-kind-icon media-video-icon" />
      <template v-else>
        <!-- <BootstrapIcon v-if="clickedAmount > 0" icon="arrow-up-right-square-fill" class="article-kind-icon clicked-icon" /> -->
        <BootstrapIcon v-if="favoriteInd === 1 && !isReaderDetail" icon="bookmark-fill" class="article-kind-icon star-icon" />
        <BootstrapIcon v-if="hotInd === 1" icon="fire" class="article-kind-icon hot-icon" />
        <!-- <BootstrapIcon v-if="hasInterestScore && !hasSourceIcon && !isDeveloping" icon="award-fill" class="article-kind-icon recommendation-icon" /> -->
        <!-- <BootstrapIcon v-else-if="isGroupedView && eventArticleCountTotal > 1 && !hasSourceIcon && !isDeveloping" icon="megaphone-fill" class="article-kind-icon event-icon" /> -->
      </template>
      <a v-if="safeArticleUrl" ref="originalArticleLink" class="article-link" target="_blank" rel="noopener noreferrer" :href="safeArticleUrl" @click="$emit('article-clicked')"><HighlightedText :text="title" :terms="highlightTerms" /></a>
      <span v-else class="article-link"><HighlightedText :text="title" :terms="highlightTerms" /></span>
    </component>
    <div class="article-header-actions" :class="{ 'article-reader-actions': isReaderDetail }">
      <ArticleActionsMenu :clickedAmount="clickedAmount" :clickPending="clickPending" :favoriteInd="favoriteInd" :favoritePending="favoritePending" :isReaderMode="isReaderMode" :status="status" @toggle-clicked="$emit('toggle-clicked')" @toggle-favorite="$emit('toggle-favorite')" @toggle-read-status="$emit('toggle-read-status')" @not-interested="$emit('not-interested')" @more-like-this="$emit('more-like-this')" @mute-feed="$emit('mute-feed')" />
      <template v-if="isReaderDetail">
        <button type="button" class="article-reader-favorite" :class="{ 'article-reader-favorite--active': favoriteInd === 1 }" :aria-label="favoriteInd === 1 ? 'Unmark favorite' : 'Mark as favorite'" :aria-pressed="favoriteInd === 1" :disabled="favoritePending" @click="$emit('toggle-favorite')">
          <BootstrapIcon :icon="favoriteInd === 1 ? 'bookmark-fill' : 'bookmark'" aria-hidden="true" />
        </button>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact article-reader-read" @click="$emit('toggle-read-status')">
          <BootstrapIcon :icon="status === 'read' ? 'circle' : 'check2'" context="control" aria-hidden="true" />
          <span>{{ status === 'read' ? 'Mark as unread' : 'Mark as read' }}</span>
        </button>
      </template>
    </div>
  </header>
</template>

<script>
import ArticleActionsMenu from './ArticleActionsMenu.vue';
import ArticleDevelopingStoryPopover from './ArticleDevelopingStoryPopover.vue';
import HighlightedText from '../shared/HighlightedText.vue';
import { formatRelativeDate } from '../../utils/date.js';
import { usableHttpUrl } from '../../utils/content.js';

export default {
  components: { ArticleActionsMenu, ArticleDevelopingStoryPopover, HighlightedText },
  emits: ['article-clicked', 'toggle-clicked', 'toggle-favorite', 'toggle-read-status', 'not-interested', 'more-like-this', 'mute-feed'],
  props: {
    readerDetail: { type: Boolean, default: false },
    feed: { type: Object, default: () => ({}) },
    feedFavicon: { type: String, default: '' },
    author: { type: String, default: '' },
    publishedAt: { type: [String, Date], default: '' },
    articleId: { type: [Number, String], default: null },
    url: { type: String, default: '' }, title: { type: String, default: '' }, clickedAmount: { type: Number, default: 0 },
    clickPending: { type: Boolean, default: false },
    favoriteInd: { type: Number, default: 0 }, favoritePending: { type: Boolean, default: false }, hotInd: { type: Number, default: 0 }, status: { type: String, default: '' },
    viewMode: { type: String, default: '' }, hasVideoMedia: { type: Boolean, default: false },
    isDeveloping: { type: Boolean, default: false },
    hasInterestScore: { type: Boolean, default: false },
    isGroupedView: { type: Boolean, default: false }, eventArticleCountTotal: { type: Number, default: 0 },
    highlightTerms: { type: Array, default: () => [] }
  },
  data() {
    return { faviconFailed: false };
  },
  watch: {
    feedFavicon() {
      this.faviconFailed = false;
    }
  },
  computed: {
    isReaderDetail() {
      return this.readerDetail && this.isReaderMode;
    },
    sourceUrl() {
      const url = usableHttpUrl(this.feed?.url);
      return url ? `${new URL(url).origin}/` : '';
    },
    // Returns an absolute HTTP(S) destination eligible for external navigation.
    safeArticleUrl() {
      return usableHttpUrl(this.url);
    },
    // Returns whether the article links to a Bluesky profile post.
    isBlueSkyArticle() {
      try {
        const parsedUrl = new URL(this.url);
        const isHttp = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
        return isHttp && parsedUrl.hostname.toLowerCase() === 'bsky.app' && parsedUrl.pathname.startsWith('/profile/');
      } catch {
        return false;
      }
    },
    // Returns whether the article links to Reddit.
    isRedditArticle() {
      return /^https?:\/\/(?:[^/]+\.)?reddit\.com(?:\/|$)/i.test(this.url);
    },
    // Returns whether the article links to GitHub.
    isGitHubArticle() {
      return /^https?:\/\/(?:[^/]+\.)?github\.com(?:\/|$)/i.test(this.url);
    },
    // Returns whether the article links to Mastodon Social.
    isMastodonArticle() {
      return /^https?:\/\/(?:[^/]+\.)?mastodon\.social(?:\/|$)/i.test(this.url);
    },
    // Returns whether the article links to Medium.
    isMediumArticle() {
      return /^https?:\/\/(?:[^/]+\.)?medium\.com(?:\/|$)/i.test(this.url);
    },
    // Returns whether the article links to a supported podcast platform.
    isPodcastArticle() {
      const podcastHostPattern = /^https?:\/\/(?:[^/]+\.)?(?:anchor\.fm|buzzsprout\.com|podbean\.com|transistor\.fm)(?:\/|$)/i;
      const spotifyPodcastPattern = /^https?:\/\/open\.spotify\.com\/(?:episode|show)(?:\/|$)/i;
      const spotifyPodcasterPattern = /^https?:\/\/podcasters\.spotify\.com\/pod\/show(?:\/|$)/i;

      return podcastHostPattern.test(this.url) || spotifyPodcastPattern.test(this.url) || spotifyPodcasterPattern.test(this.url);
    },
    // Returns whether the article has a source-specific icon.
    hasSourceIcon() {
      return this.isBlueSkyArticle || this.isRedditArticle || this.isGitHubArticle || this.isMastodonArticle || this.isMediumArticle || this.isPodcastArticle;
    },
    // Returns whether the article is displayed in the reader layout.
    isReaderMode() {
      return this.viewMode === 'reader';
    }
  },
  methods: {
    formatRelativeDate,
    // Opens the original article through the header-owned link behavior.
    openOriginalArticle() {
      this.$refs.originalArticleLink?.click();
    }
  }
};
</script>

<style scoped src="./articleSourceIcons.css"></style>

<style scoped>
.article-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-family);
  gap: 8px;
  line-height: 1;
  margin: 0;
}

.article-header-left {
  display: flex;
  align-items: center;
  flex: 1;
  line-height: 1;
  margin: 0;
  min-width: 0;
}

.article-header-left svg {
  margin-bottom: 0 !important;
}

.article-link {
  margin: 0;
  color: var(--article-affinity-title-color, var(--text-primary));
  font-size: var(--article-title-size, 22px);
  line-height: 1.25;
  font-weight: var(--article-affinity-title-weight, 600);
  letter-spacing: -0.01em;
  text-decoration: none;
  border-bottom: none;
  /* Keeps highlighted and plain title segments in one normal wrapping text flow. */
  display: block;
  min-width: 0;
}

.article-header-actions {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.article-kind-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--article-warning-text);
  margin-right: 8px;
  flex-shrink: 0;
  line-height: 1;
  vertical-align: middle;
}

.article-kind-popover {
  flex: 0 0 auto;
  margin-right: 8px;
}

.article-kind-icon svg {
  margin-bottom: 0;
}

.star-icon {
  color: var(--article-star-icon);
}

.clicked-icon {
  color: var(--article-clicked-icon);
}

.hot-icon,
.event-icon {
  color: var(--article-hot-icon);
}

.recommendation-icon {
  color: var(--article-hot-icon);
  font-size: 0.85rem;
  opacity: 0.8;
}

.developing-story-icon {
  display: inline-flex;
  align-items: center;
  color: var(--article-developing-icon);
  font-size: 0.875rem;
  line-height: 1;
  vertical-align: middle;
}

:global(:root[data-theme='dark'] .article-card .article-header .article-link) {
  color: var(--article-affinity-title-color, var(--text-primary));
}

:global(:root[data-theme='dark'] .article-card .developing-story-icon) {
  color: var(--article-developing-icon);
}
.article-reader-heading {
  flex-wrap: wrap;
  gap: 16px 12px;
}

.article-reader-source {
  display: flex;
  align-items: center;
  flex: 1 1 200px;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.article-reader-source .article-reader-favicon {
  display: block;
  margin: 0;
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex: 0 0 auto;
}

.article-reader-source-name {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-decoration: none;
}

.article-reader-timestamp {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.article-reader-heading .article-reader-actions {
  flex-wrap: wrap;
  gap: 6px 2px;
  margin-left: auto;
  max-width: 100%;
}

.article-reader-heading .article-reader-title {
  order: 1;
  flex: 0 0 100%;
  max-width: 900px;
  align-items: baseline;
}

.article-reader-title .article-link {
  color: var(--text-primary);
  font-size: clamp(26px, 3cqi, 32px);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.article-reader-favorite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--control-height-compact);
  height: var(--control-height-compact);
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-compact);
  background: var(--color-transparent);
  color: var(--toolbar-text);
  cursor: pointer;
}

.article-reader-favorite svg {
  display: block;
  width: 16px;
  height: 16px;
  margin-bottom: 0;
}

.article-reader-favorite--active {
  color: var(--article-star-icon);
}

.article-reader-favorite:disabled {
  opacity: 0.5;
  cursor: wait;
}

.article-reader-favorite:hover:not(:disabled) {
  background: var(--surface-hover);
}

.article-reader-actions :deep(.article-actions__trigger:hover) {
  background: var(--surface-control);
}

.article-reader-favorite:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.article-reader-read {
  margin-inline-start: 4px;
  color: var(--text-primary);
  white-space: normal;
  text-align: left;
}
</style>
