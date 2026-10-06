<template>
  <nav class="reader-article-toolbar" aria-label="Reader article actions">
    <button type="button" class="reader-article-toolbar__action" :aria-label="readLabel" :title="readLabel" @click="$emit('toggle-read-status')">
      <BootstrapIcon :icon="status === 'read' ? 'circle' : 'check2'" context="control" aria-hidden="true" />
      <span>{{ readLabel }}</span>
    </button>
    <button type="button" class="reader-article-toolbar__action" :class="{ 'reader-article-toolbar__action--saved': favoriteInd === 1 }" :aria-label="saveLabel" :title="saveLabel" :aria-pressed="favoriteInd === 1" :disabled="favoritePending" @click="$emit('toggle-favorite')">
      <BootstrapIcon :icon="favoriteInd === 1 ? 'bookmark-fill' : 'bookmark'" context="control" aria-hidden="true" />
      <span>{{ favoriteInd === 1 ? 'Unsave' : 'Save' }}</span>
    </button>
    <a v-if="safeArticleUrl" class="reader-article-toolbar__action" :href="safeArticleUrl" target="_blank" rel="noopener noreferrer" title="Open original article in a new tab" @click="$emit('article-clicked')">
      <BootstrapIcon icon="box-arrow-up-right" context="control" aria-hidden="true" />
      <span>Open original</span>
    </a>
    <div class="reader-article-toolbar__secondary">
      <AppDropdown ref="textSizeDropdown" align="end" :close-key="articleId">
        <template #trigger="{ triggerProps }">
          <button v-bind="triggerProps" type="button" class="reader-article-toolbar__action" aria-label="Article text size" title="Article text size">Aa</button>
        </template>
        <template #menu="{ menuProps }">
          <ul v-bind="menuProps">
            <li v-for="size in textSizes" :key="size" role="none">
              <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': textSize === size }" role="menuitemradio" :aria-checked="textSize === size" @click="selectTextSize(size)">{{ size[0].toUpperCase() + size.slice(1) }}</button>
            </li>
          </ul>
        </template>
      </AppDropdown>
      <button v-if="speech.supported" type="button" class="reader-article-toolbar__action" :class="{ 'reader-article-toolbar__action--active': speech.speaking.value }" title="Listen to article" aria-label="Listen to article" :aria-pressed="speech.speaking.value" :aria-description="speech.paused.value ? 'Paused. Activate to resume reading.' : speech.speaking.value ? 'Reading. Activate to pause.' : undefined" @click="speech.toggle">
        <BootstrapIcon icon="headphones" context="control" aria-hidden="true" />
      </button>
      <button type="button" class="reader-article-toolbar__action" :title="expandLabel" :aria-label="expandLabel" :aria-pressed="expanded" @click="$emit('toggle-expanded')">
        <BootstrapIcon :icon="expanded ? 'arrows-angle-contract' : 'arrows-angle-expand'" context="control" aria-hidden="true" />
      </button>
      <ArticleActionsMenu :tag-editing-disabled="tagEditingDisabled" :clicked-amount="clickedAmount" :click-pending="clickPending" :favorite-ind="favoriteInd" :favorite-pending="favoritePending" is-reader-mode :status="status" @toggle-clicked="$emit('toggle-clicked')" @toggle-favorite="$emit('toggle-favorite')" @toggle-read-status="$emit('toggle-read-status')" @not-interested="$emit('not-interested')" @more-like-this="$emit('more-like-this')" @mute-feed="$emit('mute-feed')" @add-tags="$emit('add-tags')" @manage-tags="$emit('manage-tags')" />
    </div>
  </nav>
</template>

<script>
import AppDropdown from '../shared/AppDropdown.vue';
import { READER_TEXT_SIZES } from '../../services/readerTextSize.js';
import ArticleActionsMenu from './ArticleActionsMenu.vue';
import { usableHttpUrl } from '../../utils/content.js';
import { useArticleSpeech } from '../../composables/useArticleSpeech.js';

export default {
  components: { ArticleActionsMenu, AppDropdown },
  emits: ['update-text-size', 'toggle-expanded', 'article-clicked', 'toggle-clicked', 'toggle-favorite', 'toggle-read-status', 'not-interested', 'more-like-this', 'mute-feed', 'add-tags', 'manage-tags'],
  setup(props) {
    return { speech: useArticleSpeech({ articleId: () => props.articleId, getContent: () => props.getReadingContent(), language: () => props.language }) };
  },
  data() { return { textSizes: READER_TEXT_SIZES }; },
  methods: {
    selectTextSize(size) {
      this.$emit('update-text-size', size);
      this.$refs.textSizeDropdown.close(true);
    }
  },
  props: {
    textSize: { type: String, default: 'medium' },
    expanded: { type: Boolean, default: false },
    articleId: { type: [Number, String], default: null },
    getReadingContent: { type: Function, default: () => null },
    language: { type: String, default: '' },
    url: { type: String, default: '' },
    status: { type: String, default: '' },
    favoriteInd: { type: Number, default: 0 },
    favoritePending: { type: Boolean, default: false },
    clickedAmount: { type: Number, default: 0 },
    clickPending: { type: Boolean, default: false },
    tagEditingDisabled: { type: Boolean, default: false }
  },
  computed: {
    expandLabel() { return this.expanded ? 'Restore article layout' : 'Expand article'; },
    safeArticleUrl() { return usableHttpUrl(this.url); },
    readLabel() { return this.status === 'read' ? 'Mark unread' : 'Mark read'; },
    saveLabel() { return this.favoriteInd === 1 ? 'Remove from saved' : 'Save article'; }
  }
};
</script>

<style scoped>
.reader-article-toolbar {
  /* The Reader pane owns scrolling; keep actions outside the article body and its touch handlers. */
  position: sticky;
  top: 0;
  z-index: var(--layer-sticky);
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  /* Tighten spacing against the existing Reader pane container before labels would wrap. */
  gap: clamp(0px, calc(5cqi - 20px), 10px);
  min-height: 50px;
  padding: 5px clamp(6px, calc(7cqi - 24px), 20px);
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-secondary);
  font-family: var(--font-family);
  font-size: 13px;
  line-height: 1.4;
}

.reader-article-toolbar__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: clamp(2px, calc(3cqi - 11px), 7px);
  min-width: 32px;
  height: 38px;
  flex-shrink: 0;
  padding: 7px clamp(0px, calc(5cqi - 22px), 9px);
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-transparent);
  color: inherit;
  font: inherit;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
}

.reader-article-toolbar__action:hover:not(:disabled),
.reader-article-toolbar :deep(.article-actions__trigger:hover) {
  background: var(--surface-hover);
}

.reader-article-toolbar__action:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.reader-article-toolbar__action--saved {
  color: var(--article-star-icon);
}

.reader-article-toolbar__action:disabled {
  opacity: 0.5;
  cursor: wait;
}

.reader-article-toolbar__secondary {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-inline-start: auto;
  flex-shrink: 0;
}

.reader-article-toolbar__secondary .reader-article-toolbar__action {
  width: clamp(32px, calc(4cqi + 12px), 36px);
  padding-inline: 0;
}

.reader-article-toolbar__action--active {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.reader-article-toolbar :deep(.article-actions .article-actions__trigger) {
  width: clamp(32px, calc(4cqi + 12px), 36px);
  height: 38px;
  border-radius: var(--radius-control);
  color: var(--text-secondary);
  opacity: 1;
}

.reader-article-toolbar__action :deep(.app-icon),
.reader-article-toolbar :deep(.article-actions__trigger .app-icon) {
  display: block;
  width: 16px;
  height: 16px;
  margin: 0;
}

</style>
