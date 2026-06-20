<template>
  <h5 class="heading">
    <div class="heading-content">
      <div class="heading-left">
        <BootstrapIcon v-if="clickedAmount > 0" icon="bookmark-fill" class="clicked-icon" />
        <BootstrapIcon v-if="starInd === 1" icon="heart-fill" class="star-icon" />
        <BootstrapIcon v-if="hotInd === 1" icon="fire" class="hot-icon" />
        <BootstrapIcon v-if="hasInterestScore" icon="award-fill" class="recommendation-icon" />
        <BootstrapIcon v-else-if="isEventClusterView && clusterCountTotal > 1" icon="megaphone-fill" class="cluster-icon" />
        <a target="_blank" :href="url" v-text="title" @click="$emit('article-clicked')"></a>
      </div>
      <ArticleActionsMenu :starInd="starInd" @toggle-favorite="$emit('toggle-favorite')" @not-interested="$emit('not-interested')" @more-like-this="$emit('more-like-this')" @less-like-this="$emit('less-like-this')" @ignore-topic="$emit('ignore-topic')" @mute-feed="$emit('mute-feed')" />
    </div>
  </h5>
</template>

<script>
import ArticleActionsMenu from './ArticleActionsMenu.vue';

export default {
  components: { ArticleActionsMenu },
  emits: ['article-clicked', 'toggle-favorite', 'not-interested', 'more-like-this', 'less-like-this', 'ignore-topic', 'mute-feed'],
  props: {
    url: { type: String, default: '' }, title: { type: String, default: '' }, clickedAmount: { type: Number, default: 0 },
    starInd: { type: Number, default: 0 }, hotInd: { type: Number, default: 0 }, hasInterestScore: { type: Boolean, default: false },
    isEventClusterView: { type: Boolean, default: false }, clusterCountTotal: { type: Number, default: 0 }
  }
};
</script>
