<template>
  <div class="scores-settings settings-page">
    <!-- Info text -->
    <section class="settings-insight-card settings-insight-card--stacked scores-intro-card" aria-labelledby="scores-intro-title">
      <div class="settings-insight-header scores-intro-heading">
        <span class="settings-insight-icon" aria-hidden="true">
          <BootstrapIcon icon="bar-chart-fill" />
        </span>
        <div>
          <p class="settings-page-eyebrow">Settings — Scores</p>
          <h3 id="scores-intro-title">About AI Content Scoring</h3>
          <p>RSSMonster analyzes new articles to help you keep your reading feed useful and focused.</p>
        </div>
      </div>

      <details class="scores-intro-details">
        <summary>Learn how scores work</summary>
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

        <div class="scores-info-row scores-info-row--filtering">
          <BootstrapIcon icon="funnel" aria-hidden="true" />
          <p><strong>Filtering:</strong> Articles scoring above your threshold are automatically hidden. Set a threshold to 100 to see everything.</p>
        </div>
        <div class="scores-info-row">
          <BootstrapIcon icon="key" aria-hidden="true" />
          <p><strong>Requirements:</strong> Scoring requires an OpenAI API key configured in your backend environment. Without it, articles receive default scores of 70.</p>
        </div>
      </details>
    </section>

    <section class="scores-threshold-section settings-panel" aria-labelledby="scores-threshold-title">
      <div class="scores-threshold-heading">
        <div>
          <h3 id="scores-threshold-title">Score Thresholds</h3>
          <p>Choose the maximum score an article can have before it is hidden from your feed.</p>
        </div>
        <button type="button" class="scores-reset-button app-button app-button--outline-secondary app-button--compact settings-control settings-control--compact" @click="resetToDefaults">
          <BootstrapIcon icon="arrow-counterclockwise" aria-hidden="true" />
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
            class="scores-value-input settings-control"
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

    <div class="settings-action-footer">
      <button class="app-button app-button--primary scores-save-button" type="button" @click="save">
        Save Changes
      </button>
    </div>
  </div>
</template>

<style scoped>
.scores-intro-heading h3,
.scores-threshold-heading h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}

.scores-intro-heading p:not(.settings-page-eyebrow),
.scores-threshold-heading p,
.scores-explanation p,
.scores-threshold-details p {
  color: var(--text-muted);
}

.scores-intro-heading p:not(.settings-page-eyebrow) {
  max-width: 640px;
  margin: 6px 0 0;
  font-size: 14px;
}

.scores-intro-details {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--settings-info-border);
}

.scores-intro-details summary {
  width: fit-content;
  color: var(--settings-info-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.scores-intro-details summary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.scores-explanation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.scores-explanation {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
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
  border-radius: var(--radius-control);
  font-size: 17px;
}

.scores-icon-tile--advertisement { background: var(--settings-orange-bg); color: var(--settings-orange-text); }
.scores-icon-tile--sentiment { background: var(--badge-sentiment-bg); color: var(--badge-sentiment-text); }
.scores-icon-tile--quality { background: var(--badge-quality-bg); color: var(--badge-quality-text); }

.scores-info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--settings-info-border);
  color: var(--settings-info-text);
}

.scores-info-row p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.scores-info-row--filtering .bi {
  transform: translateY(2px);
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
  flex: 0 0 auto;
  font-weight: 600;
}

.scores-reset-button:hover {
  background: var(--settings-neutral-bg);
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
  padding: 0 9px;
  background: var(--bg-input);
  border: 1px solid var(--border-control);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.scores-value-input:focus,
.scores-reset-button:focus-visible {
  outline: 0;
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
}

.scores-save-button {
  min-height: var(--control-height-default);
}

:global(:root[data-theme='dark'] .scores-explanation),
:global(:root[data-theme='dark'] .scores-threshold-section) {
  background: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark']) .scores-threshold-heading,
:global(:root[data-theme='dark']) .scores-threshold-row + .scores-threshold-row {
  border-color: var(--border-default);
}

:global(:root[data-theme='dark']) .scores-info-row {
  border-color: var(--border-default);
}

@media (max-width: 879px) {
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

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { saveSettings } from '../../api/settings';
import { notifyActionError } from '../../services/actionNotifications.js';

export default {
  computed: {
    ...mapStores(useSelectionStore)
  },
  emits: ['close', 'saved', 'forceReload'],
  data() {
    return {
        advertisementScore: 100,
        sentimentScore: 100,
        qualityScore: 100,
        scoreOptions: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        defaultScores: {
          advertisementScore: 100,
          sentimentScore: 100,
          qualityScore: 100
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
    const sel = this.selectionStore.currentSelection || {};
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
        await saveSettings({
            minAdvertisementScore: this.advertisementScore,
            minSentimentScore: this.sentimentScore,
            minQualityScore: this.qualityScore
        });
        // Update store currentSelection before closing
        this.selectionStore.setMinAdvertisementScore(this.advertisementScore);
        this.selectionStore.setMinSentimentScore(this.sentimentScore);
        this.selectionStore.setMinQualityScore(this.qualityScore);
        this.$emit('forceReload');
        this.$emit('close');
      } catch (error) {
          console.error('Error saving article score settings:', error);
          notifyActionError('Could not save score settings. Please try again.', error);
      }
    }
  }
};
</script>
