<template>
  <ArticleExplanationPopover
    root-class="article-recommendation-explanation"
    panel-class="recommendation-explanation-panel"
    list-class="recommendation-explanation-list"
    :trigger-label="triggerLabel"
    trigger-class="recommended-badge"
    :aria-label="`${triggerLabel}. Explain why this article was recommended`"
    dialog-title="Why this article was promoted"
    :summary="explanation.summary"
    :items="explanation.items"
    :footer-label="explanation.scoreLabel"
  />
</template>

<script>
import ArticleExplanationPopover from './ArticleExplanationPopover.vue';
import { buildArticleRecommendationExplanation } from '../../services/articleRecommendationPresentation.js';

export default {
  components: { ArticleExplanationPopover },
  props: {
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
    explanation() {
      return buildArticleRecommendationExplanation(this.recommendation);
    }
  }
};
</script>
