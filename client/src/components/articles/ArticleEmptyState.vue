<template>
  <section class="article-empty-state" aria-labelledby="article-empty-state-title">
    <div class="article-empty-state-illustration" aria-hidden="true">
      <div class="article-empty-state-circle">
        <BootstrapIcon icon="newspaper" />
      </div>
      <BootstrapIcon icon="send" class="article-empty-state-plane" />
    </div>

    <h2 id="article-empty-state-title" class="article-empty-state-title">
      {{ emptyTitle }}
    </h2>

    <p class="article-empty-state-text">
      <template v-if="hasTagSelection">
        The selected tag remains active so you can choose another article state or clear it.
      </template>
      <template v-else>
        There are no articles that match your current filters.<br>
        Try adjusting your filters or check back later.
      </template>
    </p>

    <div class="article-empty-state-actions">
      <button type="button" class="article-empty-state-primary" @click="handlePrimaryAction">
        <BootstrapIcon :icon="hasTagSelection ? 'x-circle' : 'search'" aria-hidden="true" />
        {{ hasTagSelection ? 'Clear tag' : 'Clear filters' }}
      </button>

      <button type="button" class="article-empty-state-secondary" @click="handleSecondaryAction">
        <BootstrapIcon :icon="hasTagSelection ? 'arrow-left-right' : 'arrow-clockwise'" aria-hidden="true" />
        {{ secondaryActionLabel }}
      </button>
    </div>

    <FeedRefreshProgress
      v-if="!hasTagSelection && refreshProgress?.visible"
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
    currentStatus: {
      type: String,
      default: 'unread'
    },
    refreshProgress: {
      type: Object,
      default: null
    }
  },
  computed: {
    // This reports whether the empty collection is specifically scoped to a tag.
    hasTagSelection() {
      return Boolean(this.selectedTag);
    },
    // This describes the empty tag-state intersection without clearing either selection.
    emptyTitle() {
      if (!this.hasTagSelection) return 'No posts found';

      const statusLabels = {
        briefing: 'Daily Briefing',
        unread: 'unread',
        read: 'read',
        favorite: 'favorite',
        hot: 'hot',
        clicked: 'clicked'
      };
      const statusLabel = statusLabels[this.currentStatus] || 'matching';
      return `No ${statusLabel} articles tagged ${formatTagName(this.selectedTag)}`;
    },
    // This chooses the complementary reading state offered for an empty tag selection.
    alternateTagStatus() {
      return this.currentStatus === 'unread' ? 'read' : 'unread';
    },
    // This labels the secondary action for tag-specific and generic empty states.
    secondaryActionLabel() {
      if (!this.hasTagSelection) return 'Refresh feeds';
      return `View ${this.alternateTagStatus} articles`;
    }
  },
  methods: {
    // This clears only the tag when tag scope caused the empty collection.
    handlePrimaryAction() {
      this.$emit(this.hasTagSelection ? 'clear-tag' : 'clear-filters');
    },
    // This changes article state while preserving a tag, or refreshes a generic empty collection.
    handleSecondaryAction() {
      if (this.hasTagSelection) {
        this.$emit('view-tag-status', this.alternateTagStatus);
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
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: calc(100vh - 96px);
  padding: 72px 24px;
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

.article-empty-state-secondary {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.article-empty-state-secondary:hover {
  background: var(--bg-selected-soft, var(--bg-selected));
  border-color: var(--color-primary-soft);
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
    padding: 48px 18px;
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

:global(:root[data-theme='dark'] .article-empty-state) {
  background: var(--dark-bg-page, var(--bg-page));
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
  background: var(--dark-bg-card, var(--bg-card));
  border-color: var(--dark-border, var(--border-color));
  color: var(--dark-text-body, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-secondary:hover) {
  background: var(--dark-bg-hover, var(--bg-hover));
  color: var(--color-link-hover);
}

:global(:root[data-theme='dark'] .article-empty-state-divider) {
  color: var(--dark-text-muted, var(--text-muted));
}

:global(:root[data-theme='dark'] .article-empty-state-divider::before),
:global(:root[data-theme='dark'] .article-empty-state-divider::after) {
  background: var(--dark-border, var(--border-color));
}

:global(:root[data-theme='dark'] .article-empty-state-link) {
  color: var(--color-link);
}

:global(:root[data-theme='dark'] .article-empty-state-link:hover) {
  color: var(--color-link-hover);
}
</style>
