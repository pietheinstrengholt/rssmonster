<template>
  <header class="article-header">
    <h5 class="article-header-left">
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
        <BootstrapIcon v-if="favoriteInd === 1" icon="bookmark-fill" class="article-kind-icon star-icon" />
        <BootstrapIcon v-if="hotInd === 1" icon="fire" class="article-kind-icon hot-icon" />
        <!-- <BootstrapIcon v-if="hasInterestScore && !hasSourceIcon && !isDeveloping" icon="award-fill" class="article-kind-icon recommendation-icon" /> -->
        <!-- <BootstrapIcon v-else-if="isGroupedView && eventArticleCountTotal > 1 && !hasSourceIcon && !isDeveloping" icon="megaphone-fill" class="article-kind-icon event-icon" /> -->
      </template>
      <a v-if="safeArticleUrl" ref="originalArticleLink" class="article-link" target="_blank" rel="noopener noreferrer" :href="safeArticleUrl" @click="$emit('article-clicked')"><HighlightedText :text="title" :terms="highlightTerms" /></a>
      <span v-else class="article-link"><HighlightedText :text="title" :terms="highlightTerms" /></span>
    </h5>
    <div class="article-header-actions">
      <ArticleActionsMenu :clickedAmount="clickedAmount" :clickPending="clickPending" :favoriteInd="favoriteInd" :favoritePending="favoritePending" :isReaderMode="isReaderMode" :status="status" @toggle-clicked="$emit('toggle-clicked')" @toggle-favorite="$emit('toggle-favorite')" @toggle-read-status="$emit('toggle-read-status')" @not-interested="$emit('not-interested')" @more-like-this="$emit('more-like-this')" @mute-feed="$emit('mute-feed')" />
    </div>
  </header>
</template>

<script>
import ArticleActionsMenu from './ArticleActionsMenu.vue';
import ArticleDevelopingStoryPopover from './ArticleDevelopingStoryPopover.vue';
import HighlightedText from '../shared/HighlightedText.vue';
import { usableHttpUrl } from '../../utils/content.js';

export default {
  components: { ArticleActionsMenu, ArticleDevelopingStoryPopover, HighlightedText },
  emits: ['article-clicked', 'toggle-clicked', 'toggle-favorite', 'toggle-read-status', 'not-interested', 'more-like-this', 'mute-feed'],
  props: {
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
  computed: {
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
</style>
