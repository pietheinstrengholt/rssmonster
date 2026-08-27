<template>
  <ArticleExplanationPopover
    root-class="article-quality-explanation"
    panel-class="quality-explanation-panel"
    list-class="quality-explanation-list"
    :trigger-label="`Quality: ${averageScore}`"
    :trigger-class="['score', 'overall-score', scoreSeverityClass(averageScore)]"
    :aria-label="`Quality score ${averageScore}. Show quality breakdown`"
    dialog-title="Article quality"
    summary="The average combines the article’s writing, tone, and ad-free quality scores."
    :items="qualityItems"
    :footer-label="`${averageScore} average quality score`"
  />
</template>

<script>
import ArticleExplanationPopover from './ArticleExplanationPopover.vue';

const scoreSeverityClass = score => {
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-medium';
  return 'score-poor';
};

export default {
  components: { ArticleExplanationPopover },
  props: {
    advertisementScore: { type: Number, required: true },
    sentimentScore: { type: Number, required: true },
    qualityScore: { type: Number, required: true }
  },
  computed: {
    averageScore() {
      return Math.round(
        (this.advertisementScore + this.sentimentScore + this.qualityScore) / 3
      );
    },
    qualityItems() {
      return [
        {
          code: 'writing',
          icon: 'pencil-square',
          title: 'Writing quality',
          value: this.qualityScore,
          text: 'Clarity, structure, and substance of the article.'
        },
        {
          code: 'tone',
          icon: 'chat-left-text',
          title: 'Tone quality',
          value: this.sentimentScore,
          text: 'Neutrality and emotional balance of the writing.'
        },
        {
          code: 'ad-free',
          icon: 'megaphone',
          title: 'Ad-free quality',
          value: this.advertisementScore,
          text: 'Freedom from promotional and marketing language.'
        }
      ];
    }
  },
  methods: { scoreSeverityClass }
};
</script>
