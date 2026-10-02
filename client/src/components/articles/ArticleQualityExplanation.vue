<template>
  <ArticleExplanationPopover
    root-class="article-quality-explanation"
    panel-class="quality-explanation-panel"
    list-class="quality-explanation-list"
    :trigger-label="`Quality: ${overallScore}/100`"
    :trigger-class="['score', 'overall-score', scoreSeverityClass(overallScore)]"
    :aria-label="`Quality ${overallScore} out of 100. Show quality breakdown`"
    dialog-title="Overall quality"
    summary="Overall quality combines 50% writing quality, 25% tone, and 25% ad-free content. Overall quality filters use this same score."
    :items="qualityItems"
    :footer-label="`${overallScore}/100 overall quality`"
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
    quality: { type: Number, required: true },
    advertisementScore: { type: Number, required: true },
    sentimentScore: { type: Number, required: true },
    qualityScore: { type: Number, required: true }
  },
  computed: {
    overallScore() {
      return Math.round(this.quality * 100);
    },
    qualityItems() {
      return [
        {
          code: 'writing',
          icon: 'pencil-square',
          iconClass: scoreSeverityClass(this.qualityScore),
          title: 'Writing quality',
          value: this.qualityScore,
          text: 'Clarity, structure, and substance of the article.'
        },
        {
          code: 'tone',
          icon: 'chat-square-text-fill',
          iconClass: scoreSeverityClass(this.sentimentScore),
          title: 'Tone',
          value: this.sentimentScore,
          text: 'Neutrality and emotional balance of the writing.'
        },
        {
          code: 'ad-free',
          icon: 'megaphone',
          iconClass: scoreSeverityClass(this.advertisementScore),
          title: 'Ad-free content',
          value: this.advertisementScore,
          text: 'Freedom from promotional and marketing language.'
        }
      ];
    }
  },
  methods: { scoreSeverityClass }
};
</script>
