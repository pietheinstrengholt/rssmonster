<template>
  <div>
    <h5>Score Thresholds</h5>

    <!-- Score Thresholds modal -->
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Score Thresholds</h5>
                </div>
                <div class="modal-body">
                    <!-- Info text -->
                    <div class="alert alert-info mb-3">
                        <p class="mb-2">
                            <strong>How content scoring works:</strong>
                        </p>
                        <p class="mb-2">
                            When new articles are crawled, RSSMonster uses AI to analyze and score them on three dimensions:
                        </p>
                        <ul class="mb-2">
                            <li><strong>Advertisement Score (0-100):</strong> How promotional the content is. 0 = purely editorial, 100 = heavy marketing/spam.</li>
                            <li><strong>Sentiment Score (0-100):</strong> The emotional tone. 0 = positive, 50 = neutral/factual, 100 = negative/alarmist.</li>
                            <li><strong>Quality Score (0-100):</strong> Content depth and relevance. 0 = highly engaging/relevant, 100 = shallow/clickbait.</li>
                        </ul>
                        <p class="mb-2">
                            <strong>Filtering:</strong> Articles scoring <em>above</em> your threshold are automatically hidden from your feed. 
                            Set to 100 to see everything, or lower to filter out unwanted content.
                        </p>
                        <p class="mb-0">
                            <strong>Requirements:</strong> Scoring requires an OpenAI API key configured in your backend environment. 
                            Without it, all articles receive default scores of 70.
                        </p>
                    </div>

                    <!-- Advertisement Score Threshold -->
                    <div class="settings-group">
                        <label for="adScore">
                            Advertisement Score Threshold
                            <span class="info-icon" :title="'Filter out promotional content. 0 = editorial only, 100 = show all including heavy ads/spam'">
                                <BootstrapIcon icon="info-circle-fill" />
                            </span>
                        </label>
                        <select id="adScore" v-model="advertisementScore" class="form-select">
                            <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                        </select>
                    </div>
                    
                    <!-- Sentiment Score Threshold -->
                    <div class="settings-group">
                        <label for="sentimentScore">
                            Sentiment Score Threshold
                            <span class="info-icon" :title="'Filter by article tone. 0 = very positive, 50 = neutral, 100 = very negative'">
                                <BootstrapIcon icon="info-circle-fill" />
                            </span>
                        </label>
                        <select id="sentimentScore" v-model="sentimentScore" class="form-select">
                            <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                        </select>
                    </div>
                    
                    <!-- Quality Score Threshold -->
                    <div class="settings-group">
                        <label for="qualityScore">
                            Quality Score Threshold
                            <span class="info-icon" :title="'Filter by content quality. Lower scores = better depth, accuracy & writing. 0-30 = excellent, 70-100 = poor'">
                                <BootstrapIcon icon="info-circle-fill" />
                            </span>
                        </label>
                        <select id="qualityScore" v-model="qualityScore" class="form-select">
                            <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" @click="save">
                        Save
                    </button>
                    <button class="btn btn-secondary" @click="$emit('close')">Close</button>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
import { saveSettings } from '../../api/settings';

export default {
  emits: ['close', 'saved', 'forceReload'],
  data() {
    return {
        advertisementScore: 0,
        sentimentScore: 0,
        qualityScore: 0,
        scoreOptions: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    };
  },
  created() {
    // Initialize dropdowns from store currentSelection values
    const sel = this.$store.data.currentSelection || {};
    if (typeof sel.minAdvertisementScore !== 'undefined') {
        this.advertisementScore = sel.minAdvertisementScore;
    }
    if (typeof sel.minSentimentScore !== 'undefined') {
        this.sentimentScore = sel.minSentimentScore;
    }
    if (typeof sel.minQualityScore !== 'undefined') {
        this.qualityScore = sel.minQualityScore;
    }
  },
  methods: {
    async save() {
      try {
        const response = await saveSettings({
            minAdvertisementScore: this.advertisementScore,
            minSentimentScore: this.sentimentScore,
            minQualityScore: this.qualityScore
        });
        console.log('Settings saved successfully:', response.data);
        // Update store currentSelection before closing
        if (this.$store && this.$store.data) {
            if (typeof this.$store.data.setMinAdvertisementScore === 'function') {
                this.$store.data.setMinAdvertisementScore(this.advertisementScore);
            } else {
                this.$store.data.currentSelection.minAdvertisementScore = this.advertisementScore;
            }
            if (typeof this.$store.data.setMinSentimentScore === 'function') {
                this.$store.data.setMinSentimentScore(this.sentimentScore);
            } else {
                this.$store.data.currentSelection.minSentimentScore = this.sentimentScore;
            }
            if (typeof this.$store.data.setMinQualityScore === 'function') {
                this.$store.data.setMinQualityScore(this.qualityScore);
            } else {
                this.$store.data.currentSelection.minQualityScore = this.qualityScore;
            }
        }
        this.$emit('forceReload');
        this.$emit('close');
      } catch (error) {
          console.error('Error saving settings:', error);
          alert('Failed to save settings. Please try again.');
      }
    }
  }
};
</script>
