<template>
  <ArticleExplanationPopover
    ref="popover"
    root-class="article-recommendation-explanation"
    panel-class="recommendation-explanation-panel"
    list-class="recommendation-explanation-list"
    :trigger-label="triggerLabel"
    trigger-class="recommended-badge"
    :aria-label="`${triggerLabel}. Explain this article’s ranking`"
    dialog-title="Why this article was ranked"
    :summary="preferenceSummary"
    :items="explanation.items"
    :footer-label="explanation.scoreLabel"
  >
    <template #item-text="{ item }">
      <template v-if="item.code === 'interest_match' && item.islandId != null">
        Matches your <button type="button" class="interest-island-link"
          :aria-label="`Inspect ${item.islandName} interest in Settings`"
          @click="inspectInterest(item.islandId)">“{{ item.islandName }}”</button> interest.
      </template>
      <template v-else>{{ item.text }}</template>
    </template>
  </ArticleExplanationPopover>
</template>

<script>
import ArticleExplanationPopover from './ArticleExplanationPopover.vue';
import { buildArticleRecommendationExplanation } from '../../services/articleRecommendationPresentation.js';

export default {
  components: { ArticleExplanationPopover },
  emits: ['inspect-interest'],
  props: {
    interestScore: { type: [Number, String], default: 0 },
    recommendation: {
      type: Object,
      required: true
    },
    triggerLabel: {
      type: String,
      required: true
    }
  },
  computed: {
    preferenceSummary() {
      const score = Number(this.interestScore);
      return Number.isFinite(score) && score !== 0
        ? `This article has a ${score < 0 ? 'negative' : 'positive'} learned preference. ${this.explanation.summary}`
        : this.explanation.summary;
    },
    explanation() {
      return buildArticleRecommendationExplanation(this.recommendation);
    }
  },
  methods: {
    inspectInterest(islandId) {
      this.$refs.popover.close();
      this.$refs.popover.$refs.trigger?.focus();
      this.$emit('inspect-interest', islandId);
    }
  }
};
</script>

<style scoped>
.interest-island-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-primary);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.interest-island-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
</style>
