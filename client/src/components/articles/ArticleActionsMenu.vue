<template>
  <div class="article-actions dropdown">
    <button class="btn btn-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false">
      <BootstrapIcon icon="three-dots" />
    </button>
    <ul class="dropdown-menu">
      <li><a class="dropdown-item" href="#" @click.prevent="$emit('toggle-favorite')">{{ starInd ? 'Unmark favorite' : 'Mark as favorite' }}</a></li>
      <li><a class="dropdown-item" href="#" @click.prevent="$emit('not-interested')">Not Interested</a></li>
      <li><hr class="dropdown-divider" /></li>
      <li><h6 class="dropdown-header">Tune this recommendation</h6></li>
      <li><a class="dropdown-item recommendation-action-item" href="#" @click.prevent="$emit('more-like-this')"><BootstrapIcon icon="hand-thumbs-up-fill" class="recommendation-action-icon recommendation-positive-icon" />More like this</a></li>
      <li><a class="dropdown-item recommendation-action-item" href="#" @click.prevent="$emit('less-like-this')"><BootstrapIcon icon="hand-thumbs-down-fill" class="recommendation-action-icon recommendation-negative-icon" />Less like this</a></li>
      <li><a class="dropdown-item recommendation-action-item" href="#" @click.prevent="$emit('ignore-topic')"><BootstrapIcon icon="slash-circle-fill" class="recommendation-action-icon recommendation-ignore-icon" />Ignore this topic</a></li>
      <li><a class="dropdown-item" href="#" @click.prevent="$emit('mute-feed')">Mute Feed for 7 Days</a></li>
    </ul>
  </div>
</template>

<script>
export default {
  emits: ['toggle-favorite', 'not-interested', 'more-like-this', 'less-like-this', 'ignore-topic', 'mute-feed'],
  props: { starInd: { type: Number, default: 0 } }
};
</script>
