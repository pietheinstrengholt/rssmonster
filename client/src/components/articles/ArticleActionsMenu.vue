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
