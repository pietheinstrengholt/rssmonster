<template>
  <div class="scores-settings">
    <!-- Info text -->
    <section class="scores-intro-card" aria-labelledby="scores-intro-title">
      <div class="scores-intro-heading">
        <div>
          <p class="scores-eyebrow">RSSMonster AI</p>
          <h3 id="scores-intro-title">About AI Content Scoring</h3>
          <p>RSSMonster analyzes new articles to help you keep your reading feed useful and focused.</p>
        </div>
      </div>

      <div class="scores-explanation-grid">
        <article v-for="score in scoreTypes" :key="score.key" class="scores-explanation">
          <span class="scores-icon-tile" :class="score.iconClass" aria-hidden="true">
            <BootstrapIcon :icon="score.icon" />
          </span>
          <div>
            <h4>{{ score.title }}</h4>
            <p>{{ score.explanation }}</p>
          </div>
        </article>
      </div>

      <div class="scores-info-row">
        <i class="bi bi-funnel" aria-hidden="true"></i>
        <p><strong>Filtering:</strong> Articles scoring above your threshold are automatically hidden. Set a threshold to 100 to see everything.</p>
      </div>
      <div class="scores-info-row">
        <i class="bi bi-key" aria-hidden="true"></i>
        <p><strong>Requirements:</strong> Scoring requires an OpenAI API key configured in your backend environment. Without it, articles receive default scores of 70.</p>
      </div>
    </section>

    <section class="scores-threshold-section" aria-labelledby="scores-threshold-title">
      <div class="scores-threshold-heading">
        <div>
          <h3 id="scores-threshold-title">Score Thresholds</h3>
          <p>Choose the maximum score an article can have before it is hidden from your feed.</p>
        </div>
        <button type="button" class="scores-reset-button" @click="resetToDefaults">
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
          Reset to Defaults
        </button>
      </div>

      <!-- Advertisement Score Threshold -->
      <!-- Sentiment Score Threshold -->
      <!-- Quality Score Threshold -->
      <div class="scores-threshold-list">
        <div v-for="score in scoreTypes" :key="score.key" class="scores-threshold-row">
          <span class="scores-icon-tile" :class="score.iconClass" aria-hidden="true">
            <BootstrapIcon :icon="score.icon" />
          </span>
          <div class="scores-threshold-details">
            <label :for="score.inputId">{{ score.title }} Threshold</label>
            <p>{{ score.thresholdDescription }}</p>
          </div>
          <input
            :id="score.inputId"
            class="scores-range-input"
            type="range"
            min="0"
            max="100"
            step="1"
            :value="scoreValue(score.key)"
            @input="setScoreValue(score.key, $event.target.value)"
          />
          <input
            class="scores-value-input"
            type="number"
            min="0"
            max="100"
            step="1"
            :value="scoreValue(score.key)"
            :aria-label="`${score.title} threshold value`"
            @input="setScoreValue(score.key, $event.target.value)"
          />
        </div>
      </div>
    </section>

    <div class="scores-actions">
      <button class="btn btn-primary scores-save-button" type="button" @click="save">
        <i class="bi bi-floppy" aria-hidden="true"></i>
        Save Changes
      </button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.scores-settings {
  max-width: 1040px;
  color: var(--text-primary);
}

.scores-intro-card,
.scores-threshold-section {
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
}

.scores-intro-card {
  padding: 26px;
  background: var(--bg-info-subtle);
  border-color: var(--border-info);
}

.scores-eyebrow {
  margin: 0 0 4px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.scores-intro-heading h3,
.scores-threshold-heading h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}

.scores-intro-heading p:not(.scores-eyebrow),
.scores-threshold-heading p,
.scores-explanation p,
.scores-threshold-details p {
  color: var(--text-muted);
}

.scores-intro-heading p:not(.scores-eyebrow) {
  max-width: 640px;
  margin: 6px 0 0;
  font-size: 14px;
}

.scores-explanation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 24px;
}

.scores-explanation {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

.scores-explanation h4 {
  margin: 1px 0 5px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.scores-explanation p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.scores-icon-tile {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 17px;
}

.scores-icon-tile--advertisement { background: #fff1e8; color: #ea650d; }
.scores-icon-tile--sentiment { background: #fef3c7; color: #a16207; }
.scores-icon-tile--quality { background: #ede9fe; color: #6d28d9; }

.scores-info-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-info);
  color: var(--text-info);
}

.scores-info-row i {
  margin-top: 2px;
}

.scores-info-row p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.scores-threshold-section {
  margin-top: 24px;
  overflow: hidden;
}

.scores-threshold-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.scores-threshold-heading p {
  margin: 5px 0 0;
  font-size: 13px;
}

.scores-reset-button {
  display: inline-flex;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.scores-reset-button:hover {
  background: var(--bg-surface-muted);
  color: var(--text-primary);
}

.scores-threshold-row {
  display: grid;
  grid-template-columns: 36px minmax(190px, 1fr) minmax(180px, 1.2fr) 74px;
  align-items: center;
  gap: 18px;
  padding: 20px 24px;
}

.scores-threshold-row + .scores-threshold-row {
  border-top: 1px solid var(--border-subtle);
}

.scores-threshold-details label {
  display: block;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.scores-threshold-details p {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.4;
}

.scores-range-input {
  width: 100%;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.scores-value-input {
  width: 74px;
  height: 38px;
  padding: 0 9px;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.scores-value-input:focus,
.scores-reset-button:focus-visible,
.scores-save-button:focus-visible {
  outline: 0;
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
}

.scores-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.scores-save-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

:global(:root[data-theme='dark']) .scores-intro-card {
  background: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .scores-explanation,
:global(:root[data-theme='dark']) .scores-threshold-section {
  background: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .scores-threshold-heading,
:global(:root[data-theme='dark']) .scores-threshold-row + .scores-threshold-row {
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .scores-info-row {
  border-color: var(--border-color);
}

@media (max-width: 766px) {
  .scores-intro-card {
    padding: 20px;
  }

  .scores-explanation-grid {
    grid-template-columns: 1fr;
  }

  .scores-threshold-heading {
    align-items: flex-start;
    flex-direction: column;
    padding: 20px;
  }

  .scores-threshold-row {
    grid-template-columns: 36px 1fr;
    gap: 12px;
    padding: 18px 20px;
  }

  .scores-range-input,
  .scores-value-input {
    grid-column: 2;
  }
}
</style>

<style>
:root[data-theme="dark"] .scores-settings .scores-icon-tile--advertisement { background: #452b1e; color: #ffb37a; }
:root[data-theme="dark"] .scores-settings .scores-icon-tile--sentiment { background: #44391d; color: #f8d86b; }
:root[data-theme="dark"] .scores-settings .scores-icon-tile--quality { background: #35264d; color: #c7a7ff; }
</style>

<script>
import { saveSettings } from '../../api/settings';

export default {
  emits: ['close', 'saved', 'forceReload'],
  data() {
    return {
        advertisementScore: 0,
        sentimentScore: 0,
        qualityScore: 0,
        scoreOptions: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        defaultScores: {
          advertisementScore: 0,
          sentimentScore: 0,
          qualityScore: 0
        },
        scoreTypes: [
          {
            key: 'advertisementScore',
            inputId: 'adScore',
            title: 'Advertisement Score',
            icon: 'megaphone',
            iconClass: 'scores-icon-tile--advertisement',
            explanation: 'Measures how promotional content is, from editorial at 0 to heavy marketing or spam at 100.',
            thresholdDescription: 'Lower values hide more promotional articles.'
          },
          {
            key: 'sentimentScore',
            inputId: 'sentimentScore',
            title: 'Sentiment Score',
            icon: 'emoji-smile',
            iconClass: 'scores-icon-tile--sentiment',
            explanation: 'Measures tone, from positive at 0 through neutral at 50 to negative or alarmist at 100.',
            thresholdDescription: 'Lower values keep the feed closer to neutral or positive.'
          },
          {
            key: 'qualityScore',
            inputId: 'qualityScore',
            title: 'Quality Score',
            icon: 'gem',
            iconClass: 'scores-icon-tile--quality',
            explanation: 'Measures depth and relevance, from engaging at 0 to shallow or clickbait content at 100.',
            thresholdDescription: 'Lower values favor more in-depth, relevant articles.'
          }
        ]
    };
  },
  created() {
    // Initialize threshold controls from store currentSelection values
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
    scoreValue(key) {
      return this[key];
    },
    setScoreValue(key, value) {
      const parsedValue = Number(value);
      if (Number.isNaN(parsedValue)) return;

      this[key] = Math.max(0, Math.min(100, parsedValue));
    },
    resetToDefaults() {
      Object.assign(this, this.defaultScores);
    },
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
