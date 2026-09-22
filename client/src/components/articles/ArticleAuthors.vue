<template>
  <span class="article-authors">
    <template v-for="(person, index) in people" :key="index">
      <span v-if="index" aria-hidden="true">, </span>
      <a v-if="person.url" :href="person.url" target="_blank" rel="noopener noreferrer" @click.stop>{{ person.name }}</a>
      <span v-else>{{ person.name }}</span>
    </template>
  </span>
</template>

<script>
import { usableHttpUrl } from '../../utils/content.js';

export default {
  props: {
    authors: { type: Array, default: null },
    fallback: { type: String, default: '' },
    fallbackUrl: { type: String, default: '' }
  },
  computed: {
    people() {
      if (!this.authors?.length) return this.fallback
        ? [{ name: this.fallback, url: usableHttpUrl(this.fallbackUrl) }] : [];
      return this.authors.map(person => {
        const url = usableHttpUrl(person.url);
        return { name: person.name || (url ? new URL(url).hostname : ''), url };
      }).filter(person => person.name);
    }
  }
};
</script>

<style scoped>
.article-authors { overflow-wrap: anywhere; }
.article-authors a { color: inherit; text-decoration: none; }
.article-authors a:hover { text-decoration: underline; }
</style>
