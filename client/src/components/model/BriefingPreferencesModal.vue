<template>
  <div class="briefing-preferences-backdrop">
    <section
      class="briefing-preferences-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-preferences-title"
      aria-describedby="briefing-preferences-description"
    >
      <header class="briefing-preferences-header">
        <div class="briefing-preferences-heading">
          <div class="briefing-preferences-heading-icon" aria-hidden="true">
            <i class="bi bi-sliders2"></i>
          </div>

          <div>
            <h2
              id="briefing-preferences-title"
              class="briefing-preferences-title"
            >
              Tune your briefing
            </h2>

            <p
              id="briefing-preferences-description"
              class="briefing-preferences-subtitle"
            >
              Choose which stories deserve a place in your daily briefing.
            </p>
          </div>
        </div>

        <button
          class="briefing-preferences-close"
          type="button"
          aria-label="Close briefing preferences"
          @click="closeModal"
        >
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </header>

      <form class="briefing-preferences-form" @submit.prevent="savePreferences">
        <div class="briefing-preferences-body">
          <p
            v-if="loadError"
            class="briefing-preferences-load-status briefing-preferences-load-status-error"
            role="alert"
          >
            Briefing preferences could not be loaded. Default values are shown.
          </p>

          <p
            v-if="saveError"
            class="briefing-preferences-load-status briefing-preferences-load-status-error"
            role="alert"
          >
            Briefing preferences could not be saved. Please try again.
          </p>

          <!-- Article selection -->
          <fieldset class="briefing-preferences-section">
            <legend class="briefing-preferences-section-title">
              Article selection
            </legend>

            <label class="briefing-preferences-option">
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <i class="bi bi-envelope-fill"></i>
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Only unread articles
                </span>

                <span class="briefing-preferences-option-description">
                  Exclude articles you have already read.
                </span>
              </span>

              <span class="briefing-switch">
                <input
                  name="includeOnlyUnreadArticles"
                  type="checkbox"
                  role="switch"
                  v-model="form.includeOnlyUnreadArticles"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>

            <label class="briefing-preferences-option">
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <i class="bi bi-graph-up-arrow"></i>
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Developing events
                </span>

                <span class="briefing-preferences-option-description">
                  Include new coverage for events you have already seen.
                </span>
              </span>

              <span class="briefing-switch">
                <input
                  name="includeDevelopingEvents"
                  type="checkbox"
                  role="switch"
                  v-model="form.includeDevelopingEvents"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>

            <label class="briefing-preferences-option">
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <i class="bi bi-stars"></i>
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Show only interest-matched articles
                </span>

                <span class="briefing-preferences-option-description">
                  Limit the briefing to articles matched to your interests.
                </span>
              </span>

              <span class="briefing-switch">
                <input
                  name="showOnlyInterestMatchedArticles"
                  type="checkbox"
                  role="switch"
                  v-model="form.showOnlyInterestMatchedArticles"
                  @change="setExclusiveArticleType('interest')"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>

            <label class="briefing-preferences-option">
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <i class="bi bi-diagram-3-fill"></i>
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Show only developing/event articles
                </span>

                <span class="briefing-preferences-option-description">
                  Limit the briefing to articles belonging to developing events.
                </span>
              </span>

              <span class="briefing-switch">
                <input
                  name="showOnlyDevelopingEventArticles"
                  type="checkbox"
                  role="switch"
                  v-model="form.showOnlyDevelopingEventArticles"
                  @change="setExclusiveArticleType('developing')"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>
          </fieldset>

          <!-- Selection period -->
          <fieldset class="briefing-preferences-section">
            <legend class="briefing-preferences-section-title">
              Selection period
            </legend>

            <div class="briefing-preferences-field-heading">
              <div>
                <div class="briefing-preferences-field-title">
                  <i class="bi bi-clock-fill" aria-hidden="true"></i>
                  Lookback period
                </div>

                <p class="briefing-preferences-field-description">
                  Choose how far back RSSMonster should look for developments.
                </p>
              </div>
            </div>

            <div
              class="briefing-period-options"
              role="radiogroup"
              aria-label="Briefing selection period"
            >
              <label class="briefing-period-option">
                <input
                  name="selectionPeriod"
                  type="radio"
                  value="24h"
                  v-model="form.selectionPeriod"
                />

                <span>
                  <strong>Last 24 hours</strong>
                  <small>More focused and current</small>
                </span>
              </label>

              <label class="briefing-period-option">
                <input
                  name="selectionPeriod"
                  type="radio"
                  value="7d"
                  v-model="form.selectionPeriod"
                />

                <span>
                  <strong>Last 7 days</strong>
                  <small>Broader weekly coverage</small>
                </span>
              </label>
            </div>
          </fieldset>

          <!-- Coverage quality -->
          <fieldset class="briefing-preferences-section">
            <legend class="briefing-preferences-section-title">
              Coverage quality
            </legend>

            <div class="briefing-preferences-select-row">
              <div class="briefing-preferences-select-heading">
                <span
                  class="briefing-preferences-option-icon"
                  aria-hidden="true"
                >
                  <i class="bi bi-diagram-3-fill"></i>
                </span>

                <div>
                  <label
                    class="briefing-preferences-option-title"
                    for="briefing-minimum-sources"
                  >
                    Minimum distinct sources
                  </label>

                  <p class="briefing-preferences-option-description">
                    Require an event to be covered by multiple feeds.
                  </p>
                </div>
              </div>

              <select
                id="briefing-minimum-sources"
                class="briefing-preferences-select"
                name="minDistinctSources"
                v-model.number="form.minDistinctSources"
              >
                <option value="1">1 source</option>
                <option value="2">2 sources</option>
                <option value="3">3 sources</option>
                <option value="4">4 sources</option>
                <option value="5">5 sources</option>
              </select>
            </div>

            <label class="briefing-preferences-option">
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <i class="bi bi-shield-fill-check"></i>
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Prioritize high-trust coverage
                </span>

                <span class="briefing-preferences-option-description">
                  Rank events from reliable feeds more prominently.
                </span>
              </span>

              <span class="briefing-switch">
                <input
                  name="prioritizeHighTrust"
                  type="checkbox"
                  role="switch"
                  v-model="form.prioritizeHighTrust"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>
          </fieldset>

        </div>

        <footer class="briefing-preferences-footer">
          <button
            class="briefing-preferences-reset"
            type="button"
          >
            Reset to defaults
          </button>

          <div class="briefing-preferences-footer-actions">
            <button
              class="briefing-preferences-button briefing-preferences-button-secondary"
              type="button"
              :disabled="isSaving"
              @click="closeModal"
            >
              Cancel
            </button>

            <button
              class="briefing-preferences-button briefing-preferences-button-primary"
              type="submit"
              :disabled="isLoading || isSaving"
            >
              {{ isSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </footer>
      </form>
    </section>
  </div>
</template>

<script>
import {
  fetchBriefingPreferences,
  saveBriefingPreferences
} from '../../api/briefing.js';

export default {
  name: 'BriefingPreferencesModal',
  data() {
    return {
      form: {
        includeOnlyUnreadArticles: false,
        includeDevelopingEvents: false,
        showOnlyInterestMatchedArticles: false,
        showOnlyDevelopingEventArticles: false,
        minDistinctSources: 1,
        prioritizeHighTrust: false,
        selectionPeriod: '7d'
      },
      isLoading: true,
      isSaving: false,
      loadError: false,
      saveError: false,
      activeRequestId: 0
    };
  },
  created() {
    this.loadPreferences();
  },
  mounted() {
    document.addEventListener('keydown', this.handleKeydown);
  },
  beforeUnmount() {
    this.activeRequestId++;
    document.removeEventListener('keydown', this.handleKeydown);
  },
  methods: {
    // This function loads the current preferences.
    async loadPreferences() {
      const requestId = ++this.activeRequestId;
      this.isLoading = true;
      this.loadError = false;

      try {
        const { data } = await fetchBriefingPreferences();
        if (requestId !== this.activeRequestId) return;

        this.form = {
          ...this.form,
          ...data.preferences
        };
        if (this.form.showOnlyInterestMatchedArticles
          && this.form.showOnlyDevelopingEventArticles) {
          this.form.showOnlyDevelopingEventArticles = false;
        }
      } catch (error) {
        if (requestId !== this.activeRequestId) return;
        console.error('Error loading Briefing Preferences:', error);
        this.loadError = true;
      } finally {
        if (requestId === this.activeRequestId) {
          this.isLoading = false;
        }
      }
    },
    // This function keeps the two article-type filters mutually exclusive.
    setExclusiveArticleType(selectedType) {
      if (selectedType === 'interest' && this.form.showOnlyInterestMatchedArticles) {
        this.form.showOnlyDevelopingEventArticles = false;
      }

      if (selectedType === 'developing' && this.form.showOnlyDevelopingEventArticles) {
        this.form.showOnlyInterestMatchedArticles = false;
      }
    },
    // This function saves a complete preference replacement.
    async savePreferences() {
      if (this.isLoading || this.isSaving) return;

      const preferences = { ...this.form };

      this.isSaving = true;
      this.saveError = false;

      try {
        const { data } = await saveBriefingPreferences(preferences);
        this.form = {
          ...this.form,
          ...data.preferences
        };
        this.$store.data.setBriefingFilters({
          selectionPeriod: data.preferences.selectionPeriod,
          includeOnlyUnreadArticles: data.preferences.includeOnlyUnreadArticles,
          prioritizeHighTrust: data.preferences.prioritizeHighTrust
        });
        this.$store.data.refreshBriefingSelection();
        void this.$store.data.refreshOverviewCounts();
        this.closeModal();
      } catch (error) {
        console.error('Error saving Briefing Preferences:', error);
        this.saveError = true;
      } finally {
        this.isSaving = false;
      }
    },
    // This function hides the modal through the existing global modal state.
    closeModal() {
      this.$store.data.setShowModal('');
    },
    // This function closes the active modal when Escape is pressed.
    handleKeydown(event) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      this.closeModal();
    }
  }
};
</script>

<style scoped>
.briefing-preferences-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1050;

  display: grid;
  place-items: center;

  padding: 1.5rem;

  background-color: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(1px);
}

.briefing-preferences-modal {
  display: flex;
  flex-direction: column;

  width: min(40rem, 100%);
  max-height: min(46rem, calc(100vh - 3rem));

  color: #111827;
  background-color: #ffffff;
  border: 1px solid #dfe3e8;
  border-radius: 0.5rem;
  box-shadow:
    0 1.5rem 3rem rgba(15, 23, 42, 0.2),
    0 0.25rem 0.75rem rgba(15, 23, 42, 0.08);

  overflow: hidden;
}

.briefing-preferences-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;

  padding: 1rem 1.125rem;

  border-bottom: 1px solid #e5e7eb;
}

.briefing-preferences-heading {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;

  min-width: 0;
}

.briefing-preferences-heading-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;

  width: 2rem;
  height: 2rem;

  color: #2563eb;
  background-color: #eff6ff;
  border-radius: 0.375rem;

  font-size: 1.1rem;
}

.briefing-preferences-title {
  margin: 0;

  color: #111827;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.3;
}

.briefing-preferences-subtitle {
  margin: 0.2rem 0 0;

  color: #6b7280;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.briefing-preferences-close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;

  width: 2rem;
  height: 2rem;
  padding: 0;

  color: #6b7280;
  background: transparent;
  border: 0;
  border-radius: 0.375rem;

  cursor: pointer;
}

.briefing-preferences-close:hover {
  color: #111827;
  background-color: #f3f4f6;
}

.briefing-preferences-form {
  display: flex;
  flex-direction: column;

  min-height: 0;
}

.briefing-preferences-body {
  padding: 0 1.125rem;

  overflow-y: auto;
  overscroll-behavior: contain;
}

.briefing-preferences-section {
  min-width: 0;
  margin: 0;
  padding: 1rem 0;

  border: 0;
  border-bottom: 1px solid #e5e7eb;
}

.briefing-preferences-section:last-child {
  border-bottom: 0;
}

.briefing-preferences-section-title {
  width: 100%;
  margin: 0 0 0.75rem;
  padding: 0;

  color: #64748b;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.briefing-preferences-option {
  display: flex;
  gap: 0.75rem;
  align-items: center;

  min-height: 3.25rem;
  padding: 0.625rem 0;

  cursor: pointer;
}

.briefing-preferences-option + .briefing-preferences-option {
  border-top: 1px solid #f1f5f9;
}

.briefing-preferences-option-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;

  width: 2rem;
  height: 2rem;

  color: #2563eb;
  background-color: #eff6ff;
  border-radius: 0.375rem;

  font-size: 0.9rem;
}

.briefing-preferences-option-content {
  display: grid;
  flex: 1 1 auto;
  gap: 0.125rem;

  min-width: 0;
}

.briefing-preferences-option-title,
.briefing-preferences-field-title {
  color: #111827;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.briefing-preferences-option-description,
.briefing-preferences-field-description {
  margin: 0;

  color: #6b7280;
  font-size: 0.75rem;
  line-height: 1.4;
}

.briefing-preferences-field-title {
  display: flex;
  gap: 0.4rem;
  align-items: center;

  margin-bottom: 0.15rem;
}

.briefing-preferences-field-title i {
  color: #2563eb;
}

.briefing-switch {
  position: relative;

  display: inline-flex;
  flex: 0 0 auto;

  width: 2.25rem;
  height: 1.25rem;
}

.briefing-switch input {
  position: absolute;

  width: 1px;
  height: 1px;

  opacity: 0;
  pointer-events: none;
}

.briefing-switch-control {
  position: relative;

  width: 100%;
  height: 100%;

  background-color: #cbd5e1;
  border-radius: 999px;

  transition:
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.briefing-switch-control::after {
  position: absolute;
  top: 0.1875rem;
  left: 0.1875rem;

  width: 0.875rem;
  height: 0.875rem;

  background-color: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);

  content: "";
  transition: transform 150ms ease;
}

.briefing-switch input:checked + .briefing-switch-control {
  background-color: #2563eb;
}

.briefing-switch input:checked + .briefing-switch-control::after {
  transform: translateX(1rem);
}

.briefing-switch input:focus-visible + .briefing-switch-control {
  box-shadow:
    0 0 0 2px #ffffff,
    0 0 0 4px rgba(37, 99, 235, 0.4);
}

.briefing-period-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem;

  margin-top: 0.75rem;
}

.briefing-period-option {
  position: relative;

  display: flex;
  gap: 0.625rem;
  align-items: flex-start;

  padding: 0.75rem;

  background-color: #ffffff;
  border: 1px solid #dbe1e8;
  border-radius: 0.375rem;

  cursor: pointer;
}

.briefing-period-option:has(input:checked) {
  background-color: #eff6ff;
  border-color: #60a5fa;
  box-shadow: inset 0 0 0 1px #60a5fa;
}

.briefing-period-option input {
  flex: 0 0 auto;

  margin: 0.15rem 0 0;

  accent-color: #2563eb;
}

.briefing-period-option span {
  display: grid;
  gap: 0.15rem;
}

.briefing-period-option strong {
  color: #111827;
  font-size: 0.8125rem;
  font-weight: 600;
}

.briefing-period-option small {
  color: #6b7280;
  font-size: 0.6875rem;
  line-height: 1.35;
}

.briefing-preferences-select-row {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;

  padding: 0.625rem 0;
}

.briefing-preferences-select-heading {
  display: flex;
  gap: 0.75rem;
  align-items: center;

  min-width: 0;
}

.briefing-preferences-select {
  flex: 0 0 auto;

  min-width: 7.5rem;
  height: 2.25rem;
  padding: 0 2rem 0 0.625rem;

  color: #111827;
  background-color: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;

  font: inherit;
  font-size: 0.8125rem;
}

.briefing-preferences-select:focus {
  border-color: #60a5fa;
  outline: 0;
  box-shadow: 0 0 0 0.1875rem rgba(37, 99, 235, 0.14);
}

.briefing-preferences-load-status {
  margin: 0 0 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.briefing-preferences-load-status-error {
  color: #991b1b;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}

.briefing-preferences-footer {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;

  padding: 0.875rem 1.125rem;

  background-color: #f8fafc;
  border-top: 1px solid #e5e7eb;
}

.briefing-preferences-reset {
  padding: 0;

  color: #2563eb;
  background: transparent;
  border: 0;

  font-size: 0.75rem;
  font-weight: 600;

  cursor: pointer;
}

.briefing-preferences-reset:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.briefing-preferences-footer-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.briefing-preferences-button {
  min-height: 2.25rem;
  padding: 0.4rem 0.875rem;

  border: 1px solid transparent;
  border-radius: 0.375rem;

  font-size: 0.8125rem;
  font-weight: 600;

  cursor: pointer;
}

.briefing-preferences-button-secondary {
  color: #374151;
  background-color: #ffffff;
  border-color: #d1d5db;
}

.briefing-preferences-button-secondary:hover {
  background-color: #f8fafc;
  border-color: #9ca3af;
}

.briefing-preferences-button-primary {
  color: #ffffff;
  background-color: #2563eb;
  border-color: #2563eb;
}

.briefing-preferences-button-primary:hover {
  background-color: #1d4ed8;
  border-color: #1d4ed8;
}

/* Mobile portrait */
@media (max-width: 575.98px) and (orientation: portrait) {
  .briefing-preferences-backdrop {
    align-items: end;

    padding: 0;
  }

  .briefing-preferences-modal {
    width: 100%;
    max-height: calc(100dvh - 1rem);

    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 0.75rem 0.75rem 0 0;
  }

  .briefing-preferences-header,
  .briefing-preferences-footer {
    padding-right: 0.875rem;
    padding-left: 0.875rem;
  }

  .briefing-preferences-body {
    padding-right: 0.875rem;
    padding-left: 0.875rem;
  }

  .briefing-period-options {
    grid-template-columns: 1fr;
  }

  .briefing-preferences-select-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .briefing-preferences-select {
    width: 100%;
  }

}

/* Dark mode */
:global(:root[data-theme='dark'] .briefing-preferences-backdrop) {
  background-color: rgba(0, 0, 0, 0.62);
}

:global(:root[data-theme='dark'] .briefing-preferences-modal) {
  color: var(--text-primary);
  background-color: var(--bg-modal);
  border-color: var(--border-color);
  box-shadow: 0 1.5rem 4rem var(--shadow-settings-dialog-dark-color);
}

:global(:root[data-theme='dark'] .briefing-preferences-header),
:global(:root[data-theme='dark'] .briefing-preferences-section),
:global(:root[data-theme='dark'] .briefing-preferences-footer) {
  border-color: var(--border-color);
}

:global(:root[data-theme='dark'] .briefing-preferences-title),
:global(:root[data-theme='dark'] .briefing-preferences-option-title),
:global(:root[data-theme='dark'] .briefing-preferences-field-title),
:global(:root[data-theme='dark'] .briefing-period-option strong) {
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .briefing-preferences-subtitle),
:global(:root[data-theme='dark'] .briefing-preferences-option-description),
:global(:root[data-theme='dark'] .briefing-preferences-field-description),
:global(:root[data-theme='dark'] .briefing-period-option small),
:global(:root[data-theme='dark'] .briefing-preferences-section-title) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .briefing-preferences-heading-icon),
:global(:root[data-theme='dark'] .briefing-preferences-option-icon) {
  color: var(--color-primary-icon-dark);
  background-color: var(--color-primary-surface-dark);
}

:global(:root[data-theme='dark'] .briefing-preferences-field-title i),
:global(:root[data-theme='dark'] .briefing-preferences-reset) {
  color: var(--color-link);
}

:global(:root[data-theme='dark'] .briefing-preferences-close) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .briefing-preferences-close:hover) {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

:global(:root[data-theme='dark'] .briefing-preferences-option + .briefing-preferences-option) {
  border-color: var(--border-color);
}

:global(:root[data-theme='dark'] .briefing-switch-control) {
  background-color: #4b5563;
}

:global(:root[data-theme='dark'] .briefing-switch-control::after) {
  background-color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

:global(:root[data-theme='dark'] .briefing-switch input:checked + .briefing-switch-control) {
  background-color: var(--color-primary);
}

:global(:root[data-theme='dark'] .briefing-switch input:focus-visible + .briefing-switch-control) {
  box-shadow:
    0 0 0 2px var(--bg-modal),
    0 0 0 4px var(--border-focus);
}

:global(:root[data-theme='dark'] .briefing-period-option),
:global(:root[data-theme='dark'] .briefing-preferences-select),
:global(:root[data-theme='dark'] .briefing-preferences-select option),
:global(:root[data-theme='dark'] .briefing-preferences-button-secondary) {
  color: var(--text-primary);
  background-color: var(--bg-control);
  border-color: var(--border-input);
}

:global(:root[data-theme='dark'] .briefing-period-option:has(input:checked)) {
  background-color: var(--color-primary-surface-dark);
  border-color: var(--color-primary-border-dark);
  box-shadow: inset 0 0 0 1px var(--color-primary-border-dark);
}

:global(:root[data-theme='dark'] .briefing-preferences-select:focus) {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
}

:global(:root[data-theme='dark'] .briefing-preferences-button-secondary:hover) {
  color: var(--text-primary);
  background-color: var(--bg-hover);
  border-color: var(--color-primary-border-dark);
}

:global(:root[data-theme='dark'] .briefing-preferences-load-status-error) {
  color: var(--color-danger-text-dark);
  background-color: var(--color-danger-surface-dark);
  border-color: var(--color-danger-border-dark);
}

:global(:root[data-theme='dark'] .briefing-preferences-footer) {
  background-color: var(--bg-secondary);
}

:global(:root[data-theme='dark'] .briefing-preferences-reset:hover) {
  color: var(--color-link-hover);
}

:global(:root[data-theme='dark'] .briefing-preferences-button-primary) {
  color: var(--text-inverted);
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

:global(:root[data-theme='dark'] .briefing-preferences-button-primary:hover) {
  background-color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}
</style>
