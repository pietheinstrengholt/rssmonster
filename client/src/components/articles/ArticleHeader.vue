<template>
  <h5 class="article-header">
    <div class="article-header-row">
      <div class="article-header-left">
        <BootstrapIcon v-if="isBlueSkyArticle" icon="bluesky" class="article-kind-icon bluesky-icon" />
        <BootstrapIcon v-if="isRedditArticle" icon="reddit" class="article-kind-icon reddit-icon" />
        <BootstrapIcon v-if="isGitHubArticle" icon="github" class="article-kind-icon github-icon" />
        <BootstrapIcon v-if="hasVideoMedia" icon="play-btn-fill" class="article-kind-icon media-video-icon" />
        <template v-else>
          <BootstrapIcon v-if="clickedAmount > 0" icon="arrow-up-right-square-fill" class="article-kind-icon clicked-icon" />
          <BootstrapIcon v-if="favoriteInd === 1" icon="bookmark-fill" class="article-kind-icon star-icon" />
          <BootstrapIcon v-if="hotInd === 1" icon="fire" class="article-kind-icon hot-icon" />
          <BootstrapIcon v-if="hasInterestScore && !isBlueSkyArticle && !isRedditArticle && !isGitHubArticle" icon="award-fill" class="article-kind-icon recommendation-icon" />
          <BootstrapIcon v-else-if="isGroupedView && clusterCountTotal > 1 && !isBlueSkyArticle && !isRedditArticle && !isGitHubArticle" icon="megaphone-fill" class="article-kind-icon cluster-icon" />
        </template>
        <a class="article-link" target="_blank" :href="url" v-text="title" @click="$emit('article-clicked')"></a>
      </div>
      <div class="article-header-actions">
        <button v-if="isReaderMode" class="article-read-status-button" type="button" :aria-label="statusLabel" :title="statusLabel" @click.stop="$emit('toggle-read-status')">
          <BootstrapIcon :icon="statusIcon" />
        </button>
        <ArticleActionsMenu :favoriteInd="favoriteInd" @toggle-favorite="$emit('toggle-favorite')" @not-interested="$emit('not-interested')" @more-like-this="$emit('more-like-this')" @less-like-this="$emit('less-like-this')" @ignore-topic="$emit('ignore-topic')" @mute-feed="$emit('mute-feed')" />
      </div>
    </div>
  </h5>
</template>

<script>
import ArticleActionsMenu from './ArticleActionsMenu.vue';

export default {
  components: { ArticleActionsMenu },
  emits: ['article-clicked', 'toggle-favorite', 'toggle-read-status', 'not-interested', 'more-like-this', 'less-like-this', 'ignore-topic', 'mute-feed'],
  props: {
    url: { type: String, default: '' }, title: { type: String, default: '' }, clickedAmount: { type: Number, default: 0 },
    favoriteInd: { type: Number, default: 0 }, hotInd: { type: Number, default: 0 }, status: { type: String, default: '' },
    viewMode: { type: String, default: '' }, hasVideoMedia: { type: Boolean, default: false },
    hasInterestScore: { type: Boolean, default: false },
    isGroupedView: { type: Boolean, default: false }, clusterCountTotal: { type: Number, default: 0 }
  },
  computed: {
    // Returns whether the article links to a Bluesky profile post.
    isBlueSkyArticle() {
      return this.url.includes('https://bsky.app/profile/') || this.url.includes('http://bsky.app/profile/');
    },
    // Returns whether the article links to Reddit.
    isRedditArticle() {
      return /^https?:\/\/(?:[^/]+\.)?reddit\.com(?:\/|$)/i.test(this.url);
    },
    // Returns whether the article links to GitHub.
    isGitHubArticle() {
      return /^https?:\/\/(?:[^/]+\.)?github\.com(?:\/|$)/i.test(this.url);
    },
    // Returns whether the article is displayed in the reader layout.
    isReaderMode() {
      return this.viewMode === 'reader';
    },
    // Returns the status icon shown beside the article actions menu.
    statusIcon() {
      return this.status === 'read' ? 'circle-fill' : 'record-circle-fill';
    },
    // Returns the accessible label for the current read status.
    statusLabel() {
      return this.status === 'read' ? 'Article is read' : 'Article is unread';
    }
  }
};
</script>
