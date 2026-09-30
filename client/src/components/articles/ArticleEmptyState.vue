<template>
  <section class="article-empty-state" aria-labelledby="article-empty-state-title">
    <!-- Search-specific empty state illustration -->
    <div
      v-if="hasSearch"
      class="article-empty-state-search-illustration"
      aria-hidden="true"
    >
      <div class="article-empty-state-search-document article-empty-state-search-document--back">
        <div class="article-empty-state-search-thumbnail"></div>
        <div class="article-empty-state-search-lines">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div class="article-empty-state-search-document article-empty-state-search-document--front">
        <div class="article-empty-state-search-thumbnail">
          <BootstrapIcon icon="image" />
        </div>

        <div class="article-empty-state-search-lines">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div class="article-empty-state-search-magnifier">
        <BootstrapIcon icon="search" />
      </div>

      <span class="article-empty-state-search-accent article-empty-state-search-accent--one"></span>
      <span class="article-empty-state-search-accent article-empty-state-search-accent--two"></span>
      <span class="article-empty-state-search-accent article-empty-state-search-accent--three"></span>
    </div>

    <div v-else class="article-empty-state-illustration" aria-hidden="true">
      <div class="article-empty-state-circle">
        <BootstrapIcon icon="newspaper" />
      </div>
      <BootstrapIcon icon="send" class="article-empty-state-plane" />
    </div>

    <h2 id="article-empty-state-title" class="article-empty-state-title">
      {{ emptyTitle }}
    </h2>

    <p class="article-empty-state-text">
      <template v-if="hasTagSelection && !hasSearch && !showingNewOnly">
        The selected tag remains active so you can choose another article state or clear it.
      </template>
      <template v-else>
        {{ emptyDescription }}
      </template>
    </p>

    <div class="article-empty-state-actions">
      <button type="button" class="article-empty-state-primary" @click="handlePrimaryAction">
        <BootstrapIcon :icon="primaryActionIcon" aria-hidden="true" />
        {{ primaryActionLabel }}
      </button>

      <button type="button" class="article-empty-state-secondary" @click="handleSecondaryAction">
        <BootstrapIcon :icon="secondaryActionIcon" aria-hidden="true" />
        {{ secondaryActionLabel }}
      </button>
    </div>

    <FeedRefreshProgress
      v-if="showRefreshProgress && !hasTagSelection && refreshProgress?.visible"
      class="article-empty-state-refresh-progress"
      :progress="refreshProgress"
    />

    <div v-if="!hasTagSelection" class="article-empty-state-divider" aria-hidden="true">
      <span>OR</span>
    </div>

    <button v-if="!hasTagSelection" type="button" class="article-empty-state-link" @click="$emit('open-smart-folders')">
      <BootstrapIcon icon="folder" aria-hidden="true" />
      Explore smart folders
    </button>
    <!-- Search help belongs ONLY to failed searches -->
    <div
      v-if="hasSearch"
      class="article-empty-state-search-tips"
    >
      <div class="article-empty-state-search-tips-title">
        <BootstrapIcon
          icon="lightbulb"
          aria-hidden="true"
        />
        <span>Search tips</span>
      </div>

      <ul>
        <li>Check the spelling of your search terms</li>
        <li>Try more general keywords</li>
        <li>Use fewer or different words</li>
      </ul>
    </div>
  </section>
</template>

<script>
import { formatTagName } from '../../utils/tags.js';
import FeedRefreshProgress from '../shared/FeedRefreshProgress.vue';

export default {
  components: {
    FeedRefreshProgress
  },
  emits: [
    'clear-filters',
    'clear-search',
    'clear-tag',
    'refresh-feeds',
    'open-smart-folders',
    'view-tag-status'
  ],
  props: {
    selectedTag: {
      type: String,
      default: ''
    },
    searchQuery: {
      type: String,
      default: ''
    },
    showingNewOnly: {
      type: Boolean,
      default: false
    },
    currentStatus: {
      type: String,
      default: 'unread'
    },
    refreshProgress: {
      type: Object,
      default: null
    },
    showRefreshProgress: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    // This reports whether the empty collection is specifically scoped to a tag.
    hasTagSelection() {
      return Boolean(this.selectedTag);
    },
    hasSearch() {
      return !this.showingNewOnly && this.currentStatus !== 'briefing' && Boolean(this.searchQuery?.trim());
    },
    // This describes the empty tag-state intersection without clearing either selection.
    emptyTitle() {
      if (this.showingNewOnly) return 'No new unread articles';
      if (this.hasSearch) return `No articles match “${this.searchQuery.trim()}”`;
      if (!this.hasTagSelection) {
        const statusTitles = {
          briefing: 'Your briefing is clear',
          unread: 'You’re all caught up',
          read: 'No read articles yet',
          favorite: 'No saved articles yet',
          hot: 'Nothing is trending here yet',
          clicked: 'No opened originals yet'
        };
        return statusTitles[this.currentStatus] || 'No articles found';
      }

      const statusLabels = {
        briefing: 'Daily Briefing',
        unread: 'unread',
        read: 'read',
        favorite: 'saved',
        hot: 'hot',
        clicked: 'opened original'
      };
      const statusLabel = statusLabels[this.currentStatus] || 'matching';
      return `No ${statusLabel} articles tagged ${formatTagName(this.selectedTag)}`;
    },
    // This gives each empty reading state concise, actionable guidance.
    emptyDescription() {
      if (this.showingNewOnly) return 'View the full unread list to keep reading.';
      if (this.hasSearch) return 'Try another search or clear the current filters.';
      const statusDescriptions = {
        briefing: 'There are no briefing articles in this view. Refresh your feeds or adjust the current filters.',
        unread: 'There are no unread articles in this view. Refresh your feeds or enjoy the clear queue.',
        read: 'Articles you finish will appear here. Clear the current filters to widen this view.',
        favorite: 'Save an article to find it here later, or clear the current filters to look elsewhere.',
        hot: 'No articles meet the current hot threshold. Refresh your feeds or adjust the filters.',
        clicked: 'Articles opened on their original websites appear here, separately from read status. Clear the current filters to widen this view.'
      };
      return statusDescriptions[this.currentStatus]
        || 'There are no articles that match the current filters. Try adjusting them or check back later.';
    },
    // This makes refreshing the natural primary recovery for time-sensitive empty queues.
    refreshIsPrimaryAction() {
      return !this.showingNewOnly && !this.hasSearch && !this.hasTagSelection && ['briefing', 'unread'].includes(this.currentStatus);
    },
    // This gives collection-specific empty states a useful route back into reading.
    viewUnreadIsPrimaryAction() {
      return !this.hasTagSelection && ['read', 'favorite', 'hot', 'clicked'].includes(this.currentStatus);
    },
    primaryActionLabel() {
      if (this.showingNewOnly) return 'View unread articles';
      if (this.hasSearch) return 'Clear search';
      if (this.hasTagSelection) return 'Clear tag';
      if (this.viewUnreadIsPrimaryAction) return 'View unread articles';
      return this.refreshIsPrimaryAction ? 'Refresh feeds' : 'Clear filters';
    },
    primaryActionIcon() {
      if (this.showingNewOnly) return 'arrow-left-right';
      if (this.hasSearch) return 'x-circle';
      if (this.hasTagSelection) return 'x-circle';
      if (this.viewUnreadIsPrimaryAction) return 'arrow-left-right';
      return this.refreshIsPrimaryAction ? 'arrow-clockwise' : 'search';
    },
    // This chooses the complementary reading state offered for an empty tag selection.
    alternateTagStatus() {
      return this.currentStatus === 'unread' ? 'read' : 'unread';
    },
    // This labels the secondary action for tag-specific and generic empty states.
    secondaryActionLabel() {
      if (this.showingNewOnly) return 'Refresh feeds';
      if (this.hasSearch) return 'Clear filters';
      if (!this.hasTagSelection) {
        return this.refreshIsPrimaryAction ? 'View unread articles' : 'Refresh feeds';
      }
      return `View ${this.alternateTagStatus} articles`;
    },
    secondaryActionIcon() {
      if (this.showingNewOnly) return 'arrow-clockwise';
      if (this.hasSearch) return 'x-circle';
      if (this.hasTagSelection) return 'arrow-left-right';
      return this.refreshIsPrimaryAction ? 'arrow-left-right' : 'arrow-clockwise';
    }
  },
  methods: {
    // This clears only the tag when tag scope caused the empty collection.
    handlePrimaryAction() {
      if (this.showingNewOnly) {
        this.$emit('view-tag-status', 'unread');
        return;
      }
      if (this.hasSearch) {
        this.$emit('clear-search');
        return;
      }
      if (this.hasTagSelection) {
        this.$emit('clear-tag');
        return;
      }

      if (this.viewUnreadIsPrimaryAction) {
        this.$emit('view-tag-status', 'unread');
        return;
      }

      this.$emit(this.refreshIsPrimaryAction ? 'refresh-feeds' : 'clear-filters');
    },
    // This changes article state while preserving a tag, or refreshes a generic empty collection.
    handleSecondaryAction() {
      if (this.showingNewOnly) {
        this.$emit('refresh-feeds');
        return;
      }
      if (this.hasSearch) {
        this.$emit('clear-filters');
        return;
      }
      if (this.hasTagSelection) {
        this.$emit('view-tag-status', this.alternateTagStatus);
        return;
      }

      if (this.refreshIsPrimaryAction) {
        this.$emit('view-tag-status', 'unread');
        return;
      }

      this.$emit('refresh-feeds');
    }
  }
}
</script>

<style scoped>
.article-empty-state {
  align-items: center;
  box-sizing: border-box;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 0 24px;
  text-align: center;
}

.article-empty-state-illustration {
  align-items: center;
  display: flex;
  height: 180px;
  justify-content: center;
  margin-bottom: 28px;
  position: relative;
  width: 260px;
}

.article-empty-state-circle {
  align-items: center;
  background: linear-gradient(180deg, var(--color-primary-soft) 0%, var(--overlay-primary-subtle) 100%);
  border-radius: 999px;
  color: var(--color-primary-text, var(--color-primary-hover));
  display: inline-flex;
  font-size: 72px;
  height: 180px;
  justify-content: center;
  opacity: 0.9;
  width: 180px;
}

.article-empty-state-plane {
  color: var(--color-primary);
  font-size: 32px;
  opacity: 0.55;
  position: absolute;
  right: 36px;
  top: 24px;
  transform: rotate(16deg);
}

.article-empty-state-title {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 750;
  line-height: 1.2;
  margin: 0;
}

.article-empty-state-text {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.55;
  margin: 12px 0 26px;
  max-width: 460px;
}

.article-empty-state-actions {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 10px;
}

.article-empty-state-refresh-progress {
  display: none;
}

.article-empty-state-primary,
.article-empty-state-secondary {
  align-items: center;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 700;
  gap: 8px;
  height: 42px;
  justify-content: center;
  padding: 0 18px;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.article-empty-state-primary {
  background: var(--color-primary);
  border: 0;
  box-shadow: 0 10px 22px var(--overlay-primary-subtle);
  color: var(--text-inverted);
}

.article-empty-state-primary:hover {
  background: var(--color-primary-hover);
}

.article-empty-state-primary:focus-visible,
.article-empty-state-secondary:focus-visible,
.article-empty-state-link:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 3px;
}

.article-empty-state-secondary {
  background: var(--surface-card);
  border: 1px solid var(--border-control);
  color: var(--text-primary);
}

.article-empty-state-secondary:hover {
  background: var(--surface-selected);
  border-color: var(--border-selected);
  color: var(--color-primary-text, var(--color-primary-hover));
}

.article-empty-state-divider {
  align-items: center;
  color: var(--text-meta, var(--text-muted));
  display: flex;
  font-size: 12px;
  font-weight: 700;
  gap: 16px;
  letter-spacing: 0.08em;
  margin: 28px 0 22px;
  width: min(360px, 100%);
}

.article-empty-state-divider::before,
.article-empty-state-divider::after {
  background: var(--border-subtle);
  content: "";
  flex: 1;
  height: 1px;
}

.article-empty-state-link {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  color: var(--color-primary);
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 700;
  gap: 8px;
  justify-content: center;
}

.article-empty-state-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 879px) {
  .article-empty-state {
    flex: 1;
    min-height: 0;
    padding: 0 18px;
  }

  .article-empty-state-illustration {
    height: 150px;
    margin-bottom: 22px;
    width: 220px;
  }

  .article-empty-state-circle {
    font-size: 58px;
    height: 150px;
    width: 150px;
  }

  .article-empty-state-plane {
    font-size: 26px;
    right: 26px;
    top: 20px;
  }

  .article-empty-state-title {
    font-size: 24px;
  }

  .article-empty-state-text {
    font-size: 15px;
  }

  .article-empty-state-actions {
    flex-direction: column;
    max-width: 360px;
    width: 100%;
  }

  .article-empty-state-primary,
  .article-empty-state-secondary {
    width: 100%;
  }

  .article-empty-state-refresh-progress {
    display: block;
    margin-top: 16px;
    max-width: 360px;
    width: 100%;
  }
}

/* Keeps every recovery action reachable in short landscape viewports. */
@media (max-height: 560px) and (min-width: 480px) {
  .article-empty-state {
    justify-content: flex-start;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .article-empty-state > :first-child {
    margin-top: auto;
  }

  .article-empty-state > :last-child {
    margin-bottom: auto;
  }

  .article-empty-state-illustration {
    height: 72px;
    margin-bottom: 8px;
    width: 120px;
  }

  .article-empty-state-circle {
    font-size: 32px;
    height: 72px;
    width: 72px;
  }

  .article-empty-state-plane {
    font-size: 16px;
    right: 14px;
    top: 8px;
  }

  .article-empty-state-title {
    font-size: 22px;
    margin-bottom: 4px;
  }

  .article-empty-state-text {
    font-size: 14px;
    line-height: 1.4;
    margin: 6px 0 12px;
  }

  .article-empty-state-actions {
    flex-direction: row;
    margin-top: 0;
    max-width: none;
    width: auto;
  }

  .article-empty-state-primary,
  .article-empty-state-secondary {
    height: 40px;
    width: auto;
  }

  .article-empty-state-refresh-progress {
    margin-top: 10px;
  }

  .article-empty-state-divider {
    margin: 12px 0 10px;
  }

  .article-empty-state-link {
    font-size: 14px;
  }
}

:global(:root[data-theme='dark'] .article-empty-state) {
  background: var(--surface-page);
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark'] .article-empty-state-circle) {
  background: linear-gradient(180deg, rgba(30, 58, 138, 0.72) 0%, rgba(30, 58, 138, 0.24) 100%);
  color: var(--color-link-hover);
}

:global(:root[data-theme='dark'] .article-empty-state-plane) {
  color: var(--color-link);
  opacity: 0.90;
}

:global(:root[data-theme='dark'] .article-empty-state-title) {
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark'] .article-empty-state-text) {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-secondary) {
  background: var(--surface-card);
  border-color: var(--border-default);
  color: var(--dark-text-body, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-secondary:hover) {
  background: var(--surface-hover);
  color: var(--color-link-hover);
}

:global(:root[data-theme='dark'] .article-empty-state-divider) {
  color: var(--dark-text-muted, var(--text-muted));
}

:global(:root[data-theme='dark'] .article-empty-state-divider::before),
:global(:root[data-theme='dark'] .article-empty-state-divider::after) {
  background: var(--border-subtle);
}

:global(:root[data-theme='dark'] .article-empty-state-link) {
  color: var(--color-link);
}

:global(:root[data-theme='dark'] .article-empty-state-link:hover) {
  color: var(--color-link-hover);
}

.article-empty-state-search-illustration {
  flex-shrink: 0;
  height: 178px;
  margin-bottom: 28px;
  position: relative;
  width: 270px;
}

.article-empty-state-search-document {
  align-items: center;
  box-sizing: border-box;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 8px 24px var(--shadow-card-subtle-color);
  display: flex;
  gap: 12px;
  height: 82px;
  padding: 14px 16px;
  position: absolute;
  width: 188px;
}

.article-empty-state-search-document--back {
  left: 24px;
  opacity: 0.58;
  top: 62px;
  transform: rotate(-8deg);
}

.article-empty-state-search-document--front {
  left: 47px;
  top: 46px;
  transform: rotate(-3deg);
}

.article-empty-state-search-thumbnail {
  align-items: center;
  background: var(--surface-selected);
  border-radius: 7px;
  color: var(--text-muted);
  display: flex;
  flex: 0 0 40px;
  font-size: 18px;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.article-empty-state-search-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}

.article-empty-state-search-lines span {
  background: var(--border-subtle);
  border-radius: 999px;
  display: block;
  height: 6px;
}

.article-empty-state-search-lines span:nth-child(1) {
  width: 80%;
}

.article-empty-state-search-lines span:nth-child(2) {
  width: 100%;
}

.article-empty-state-search-lines span:nth-child(3) {
  width: 62%;
}

.article-empty-state-search-magnifier {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  font-size: 92px;
  height: 108px;
  justify-content: center;
  position: absolute;
  right: 8px;
  top: 18px;
  transform: rotate(-8deg);
  width: 108px;
  z-index: 3;
}

.article-empty-state-search-accent {
  background: var(--color-brand);
  border-radius: 999px;
  display: block;
  height: 3px;
  position: absolute;
  width: 20px;
}

.article-empty-state-search-accent--one {
  right: 3px;
  top: 39px;
  transform: rotate(48deg);
}

.article-empty-state-search-accent--two {
  right: 0;
  top: 60px;
  transform: rotate(0deg);
}

.article-empty-state-search-accent--three {
  right: 22px;
  top: 24px;
  transform: rotate(98deg);
}

.article-empty-state-search-tips {
  color: var(--text-secondary);
  margin-top: 48px;
  max-width: 360px;
  text-align: left;
  width: 100%;
}

.article-empty-state-search-tips-title {
  align-items: center;
  color: var(--text-primary);
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  margin-bottom: 8px;
}

.article-empty-state-search-tips-title svg {
  color: var(--text-secondary);
  font-size: 17px;
}

.article-empty-state-search-tips ul {
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
  padding-left: 29px;
}

.article-empty-state-search-tips li {
  padding-left: 2px;
}

@media (max-width: 879px) {
  .article-empty-state-search-illustration {
    height: 145px;
    margin-bottom: 22px;
    transform: scale(0.88);
    transform-origin: center bottom;
  }

  .article-empty-state-search-tips {
    margin-top: 32px;
    max-width: 320px;
  }
}

/* Keeps the search-specific empty state usable in short landscape viewports. */
@media (max-height: 560px) and (min-width: 480px) {
  .article-empty-state-search-illustration {
    height: 74px;
    margin-bottom: 8px;
    transform: scale(0.48);
    transform-origin: center top;
  }

  .article-empty-state-search-tips {
    margin-top: 14px;
  }
}

:global(:root[data-theme='dark'] .article-empty-state-search-document) {
  background: var(--surface-card);
  border-color: var(--border-default);
  box-shadow: 0 8px 24px var(--shadow-card-subtle-color);
}

:global(:root[data-theme='dark'] .article-empty-state-search-thumbnail) {
  background: var(--surface-hover);
  color: var(--dark-text-muted, var(--text-muted));
}

:global(:root[data-theme='dark'] .article-empty-state-search-lines span) {
  background: var(--border-default);
}

:global(:root[data-theme='dark'] .article-empty-state-search-magnifier) {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-search-tips) {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-search-tips-title) {
  color: var(--dark-text-primary, var(--text-primary));
}
</style>
