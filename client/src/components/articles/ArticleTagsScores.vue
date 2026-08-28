<template>
  <div v-if="categoryName || tags.length || hasQualityScores" class="article-tags">
    <button v-if="categoryName" type="button" class="tag-badge" :aria-label="`Filter articles by category ${categoryName}`" @click.stop="$emit('select-category')">{{ categoryName }}</button>
    <button v-for="tag in visibleTags" :key="tag.id" type="button" :class="['tag', { 'tag-rule': tag.tagType === 'rule' }]" :aria-label="`Filter articles by tag ${formatTagName(tag.name)}`" @click.stop="$emit('select-tag', tag)">{{ formatTagName(tag.name) }}</button>
    <button v-if="hasHiddenTags" type="button" class="tag-disclosure" :aria-expanded="tagsExpanded ? 'true' : 'false'" :aria-label="tagsExpanded ? 'Show fewer tags' : `Show ${hiddenTagCount} more tags`" @click.stop="tagsExpanded = !tagsExpanded">{{ tagsExpanded ? 'Show less' : `+${hiddenTagCount}` }}</button>
    <ArticleQualityExplanation
      v-if="hasQualityScores"
      :advertisement-score="advertisementScore"
      :sentiment-score="sentimentScore"
      :quality-score="qualityScore"
    />
  </div>
</template>
<script>
import { defineAsyncComponent } from 'vue';
import { formatTagName } from '../../utils/tags';

const NEUTRAL_SCORE = 70;

const ArticleQualityExplanation = defineAsyncComponent(
  () => import('./ArticleQualityExplanation.vue')
);

export default {
  components: { ArticleQualityExplanation },
  emits: ['select-category', 'select-tag'],
  props: {
    categoryName: { type: String, default: '' },
    tags: { type: Array, default: () => [] },
    isMobilePortrait: { type: Boolean, default: false },
    advertisementScore: { type: Number, default: undefined },
    sentimentScore: { type: Number, default: undefined },
    qualityScore: { type: Number, default: undefined }
  },
  data() {
    return {
      tagsExpanded: false
    };
  },
  computed: {
    // Hides the untouched ingestion defaults used when article scoring is disabled.
    hasQualityScores() {
      const scores = [this.advertisementScore, this.sentimentScore, this.qualityScore];
      return scores.every(Number.isFinite)
        && scores.some(score => score !== NEUTRAL_SCORE);
    },
    // Groups regular tags before rule tags while preserving order within each group.
    displayTags() {
      const ruleTags = this.tags.filter(tag => tag.tagType === 'rule');
      if (this.isMobilePortrait) return ruleTags;
      return [...this.tags.filter(tag => tag.tagType !== 'rule'), ...ruleTags];
    },
    // Returns the tags visible at the current disclosure level.
    visibleTags() {
      return this.tagsExpanded ? this.displayTags : this.displayTags.slice(0, 3);
    },
    // Returns the number of tags hidden by the collapsed metadata presentation.
    hiddenTagCount() {
      return Math.max(0, this.displayTags.length - 3);
    },
    // Returns whether the tag list needs an inline disclosure control.
    hasHiddenTags() {
      return this.displayTags.length > 3;
    }
  },
  methods: { formatTagName }
};
</script>

<style scoped>
.article-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.tag-badge,
.tag,
.tag-disclosure {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  vertical-align: middle;
}

.tag-badge,
.tag,
.tag-disclosure {
  appearance: none;
  font-family: inherit;
  cursor: pointer;
}

.tag-badge {
  background-color: var(--color-transparent);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.tag {
  background-color: var(--article-tag-background);
  border: 1px solid var(--color-transparent);
  color: var(--badge-tag-text);
}

.tag.tag-rule {
  background-color: var(--article-rule-tag-background);
  color: var(--article-rule-tag-text);
}

.tag-disclosure {
  background-color: var(--surface-control);
  border: 1px solid var(--border-subtle);
  color: var(--text-meta, var(--text-muted));
}

.tag-disclosure:hover {
  background-color: var(--surface-chrome);
  color: var(--text-secondary);
}

.tag-badge:focus-visible,
.tag:focus-visible,
.tag-disclosure:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-tags {
    gap: 8px;
    min-width: 0;
  }

  .tag:not(.tag-rule) {
    display: none;
  }
}

:global(:root[data-theme='dark'] .article-card .article-tags .tag-badge) {
  background-color: var(--color-transparent);
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .article-card .article-tags .tag) {
  background-color: var(--article-tag-background-dark);
  color: var(--article-tag-text-dark);
}

:global(:root[data-theme='dark'] .article-card .article-tags .tag.tag-rule) {
  background-color: var(--article-rule-tag-background-dark);
  color: var(--article-rule-tag-text-dark);
}
</style>
