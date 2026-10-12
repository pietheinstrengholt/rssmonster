<template>
  <ArticleExplanationPopover
    root-class="article-quality-explanation"
    panel-class="quality-explanation-panel"
    list-class="quality-explanation-list"
    :trigger-label="`Overall quality: ${overallScoreLabel}`"
    :trigger-class="['score', 'overall-score', scoreSeverityClass(overallScore)]"
    :aria-label="`Overall quality ${overallScoreLabel} out of 100. Show quality breakdown`"
    dialog-title="Overall article quality"
    summary="Overall article quality combines 50% writing quality, 25% tone, and 25% ad-free content. Overall quality filters use this same article-only score. Source trust contributes separately to Quality & source trust sorting."
    :items="qualityItems"
    :footer-label="`${overallScoreLabel}/100 overall article quality`"
  />
</template>

<script>
import ArticleExplanationPopover from './ArticleExplanationPopover.vue';
import { formatQualityPercent } from '../../services/qualityPresentation.js';

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
    toneScore: { type: Number, required: true },
    qualityScore: { type: Number, required: true }
  },
  computed: {
    overallScore() {
      return this.quality * 100;
    },
    overallScoreLabel() {
      return formatQualityPercent(this.quality);
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
          iconClass: scoreSeverityClass(this.toneScore),
          title: 'Tone',
          value: this.toneScore,
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
