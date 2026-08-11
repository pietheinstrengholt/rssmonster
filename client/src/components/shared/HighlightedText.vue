<template>
  <template v-for="(segment, index) in segments" :key="index">
    <mark v-if="segment.highlighted" class="search-highlight">{{ segment.text }}</mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

<script>
import { highlightTextSegments } from '../../services/searchHighlight.js';

export default {
  props: {
    text: { type: String, default: '' },
    terms: { type: Array, default: () => [] }
  },
  computed: {
    segments() {
      return highlightTextSegments(this.text, this.terms);
    }
  }
};
</script>
