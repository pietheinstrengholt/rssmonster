<template>
  <AppDropdown class="article-actions" :align="isReaderMode ? 'end' : 'start'">
    <template #trigger="{ triggerProps }">
      <button v-bind="triggerProps" class="article-actions__trigger" type="button" aria-label="Article actions">
        <BootstrapIcon icon="three-dots" />
      </button>
    </template>
    <template #menu="{ menuProps }">
      <ul v-bind="menuProps">
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" :disabled="favoritePending" @click="$emit('toggle-favorite')"><BootstrapIcon :icon="favoriteInd ? 'bookmark-fill' : 'bookmark'" context="control" class="recommendation-action-icon recommendation-favorite-icon" />{{ favoriteInd ? 'Unmark favorite' : 'Mark as favorite' }}</button></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" :disabled="clickPending" @click="$emit('toggle-clicked')"><BootstrapIcon icon="arrow-up-right-square-fill" class="recommendation-action-icon recommendation-clicked-icon" />{{ clickedAmount > 0 ? 'Unmark clicked' : 'Mark as clicked' }}</button></li>
      <li v-if="isReaderMode" role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('toggle-read-status')"><BootstrapIcon :icon="status === 'read' ? 'circle-fill' : 'record-circle-fill'" context="control" class="recommendation-action-icon recommendation-status-icon" />{{ status === 'read' ? 'Mark as unread' : 'Mark as read' }}</button></li>
      <li role="none"><hr class="app-dropdown__divider" /></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('more-like-this')"><BootstrapIcon icon="hand-thumbs-up-fill" class="recommendation-action-icon recommendation-positive-icon" />More like this</button></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('not-interested')"><BootstrapIcon icon="hand-thumbs-down-fill" class="recommendation-action-icon recommendation-negative-icon" />Not Interested</button></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('mute-feed')"><BootstrapIcon icon="slash-circle" context="control" class="recommendation-action-icon recommendation-mute-icon" />Mute Feed for 7 Days</button></li>
      </ul>
    </template>
  </AppDropdown>
</template>

<script>
import AppDropdown from '../shared/AppDropdown.vue';

export default {
  components: { AppDropdown },
  emits: ['toggle-clicked', 'toggle-favorite', 'toggle-read-status', 'not-interested', 'more-like-this', 'mute-feed'],
  props: {
    clickedAmount: { type: Number, default: 0 },
    clickPending: { type: Boolean, default: false },
    favoriteInd: { type: Number, default: 0 },
    favoritePending: { type: Boolean, default: false },
    isReaderMode: { type: Boolean, default: false },
    status: { type: String, default: '' }
  }
};
</script>

<style scoped>
.article-actions__trigger {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: var(--color-transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--article-heading-text);
  opacity: 0.7;
  transition: opacity 0.2s;
}

.article-actions__trigger:hover {
  opacity: 1;
  background-color: var(--color-transparent);
}

.article-actions__trigger:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.app-dropdown__menu {
  min-width: 120px !important;
  z-index: calc(var(--layer-dropdown) + 1);
}

.app-dropdown__item {
  color: var(--toolbar-text) !important;
  font-size: 14px !important;
  font-weight: 500;
  padding: 6px 8px !important;
}

.app-dropdown__item:hover,
.app-dropdown__item:focus-visible {
  color: var(--text-inverted) !important;
}

.recommendation-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recommendation-action-icon {
  width: 14px;
  flex: 0 0 auto;
}

.recommendation-positive-icon {
  color: var(--recommendation-positive-icon);
}

.recommendation-favorite-icon {
  color: var(--article-star-icon);
}

.recommendation-clicked-icon {
  color: var(--article-clicked-icon);
}

.recommendation-status-icon {
  color: var(--article-heading-text);
}

.recommendation-negative-icon {
  color: var(--color-danger);
}

.recommendation-mute-icon {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .article-actions__trigger) {
  color: var(--text-inverted);
  opacity: 0.9;
}

:global(:root[data-theme='dark'] .article-actions .app-dropdown__item) {
  color: var(--toolbar-text) !important;
}

:global(:root[data-theme='dark'] .article-actions .app-dropdown__item:hover),
:global(:root[data-theme='dark'] .article-actions .app-dropdown__item:focus-visible) {
  background-color: var(--bg-modal);
  color: var(--toolbar-text) !important;
}
</style>
