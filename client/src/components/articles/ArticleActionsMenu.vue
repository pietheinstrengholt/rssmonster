<template>
  <AppDropdown class="article-actions">
    <template #trigger="{ triggerProps }">
      <button v-bind="triggerProps" class="article-actions__trigger" type="button" aria-label="Article actions">
        <BootstrapIcon icon="three-dots" />
      </button>
    </template>
    <template #menu="{ menuProps }">
      <ul v-bind="menuProps">
      <li role="none"><button class="app-dropdown__item" type="button" role="menuitem" :disabled="favoritePending" @click="$emit('toggle-favorite')">{{ favoriteInd ? 'Unmark favorite' : 'Mark as favorite' }}</button></li>
      <li role="none"><button class="app-dropdown__item" type="button" role="menuitem" @click="$emit('not-interested')">Not Interested</button></li>
      <li role="none"><hr class="app-dropdown__divider" /></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('more-like-this')"><BootstrapIcon icon="hand-thumbs-up-fill" class="recommendation-action-icon recommendation-positive-icon" />More like this</button></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('less-like-this')"><BootstrapIcon icon="hand-thumbs-down-fill" class="recommendation-action-icon recommendation-negative-icon" />Less like this</button></li>
      <li role="none"><button class="app-dropdown__item recommendation-action-item" type="button" role="menuitem" @click="$emit('ignore-topic')"><BootstrapIcon icon="slash-circle-fill" class="recommendation-action-icon recommendation-ignore-icon" />Ignore this topic</button></li>
      <li role="none"><button class="app-dropdown__item" type="button" role="menuitem" @click="$emit('mute-feed')">Mute Feed for 7 Days</button></li>
      </ul>
    </template>
  </AppDropdown>
</template>

<script>
import AppDropdown from '../shared/AppDropdown.vue';

export default {
  components: { AppDropdown },
  emits: ['toggle-favorite', 'not-interested', 'more-like-this', 'less-like-this', 'ignore-topic', 'mute-feed'],
  props: {
    favoriteInd: { type: Number, default: 0 },
    favoritePending: { type: Boolean, default: false }
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
  z-index: 1041;
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

.recommendation-negative-icon,
.recommendation-ignore-icon {
  color: var(--color-danger);
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
