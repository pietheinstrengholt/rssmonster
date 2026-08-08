<template>
  <PreferencesDialogShell
    title="Tune your briefing"
    description="Choose which stories deserve a place in your daily briefing."
    form-id="briefing-preferences-form"
    close-label="Close briefing preferences"
    :saving="isSaving"
    :submit-disabled="isLoading || loadError"
    @close="closeModal"
  >
      <form
        id="briefing-preferences-form"
        class="briefing-preferences-form"
        @submit.prevent="savePreferences"
      >
        <div class="briefing-preferences-body">
          <p
            v-if="loadError"
            class="briefing-preferences-load-status briefing-preferences-load-status-error"
            role="alert"
          >
            Briefing preferences could not be loaded. Close and reopen this dialog to try again; saving is disabled.
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
                <BootstrapIcon icon="envelope-fill" />
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
                  :disabled="isLoading || isSaving"
                  @change="handleOnlyUnreadChange"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>

            <label
              v-if="form.includeOnlyUnreadArticles"
              class="briefing-preferences-option briefing-preferences-option-dependent"
            >
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <BootstrapIcon icon="check2-circle" />
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Mark as read while scrolling
                </span>

                <span class="briefing-preferences-option-description">
                  Automatically mark unread briefing articles as read after you scroll past them. This does not run in Headlines mode.
                </span>
              </span>

              <span class="briefing-switch">
                <input
                  name="markAsReadOnScroll"
                  type="checkbox"
                  role="switch"
                  v-model="form.markAsReadOnScroll"
                  :disabled="isLoading || isSaving || !form.includeOnlyUnreadArticles"
                />

                <span class="briefing-switch-control" aria-hidden="true"></span>
              </span>
            </label>

            <label class="briefing-preferences-option">
              <span class="briefing-preferences-option-icon" aria-hidden="true">
                <BootstrapIcon icon="graph-up-arrow" />
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Developing events
                </span>

                <span class="briefing-preferences-option-description">
                  Use new coverage for events in the morning summary.
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
                <BootstrapIcon icon="stars" />
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
                <BootstrapIcon icon="diagram-3-fill" />
              </span>

              <span class="briefing-preferences-option-content">
                <span class="briefing-preferences-option-title">
                  Show only developing stories
                </span>

                <span class="briefing-preferences-option-description">
                  Limit the briefing to unread articles selected as new event coverage.
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
                  <BootstrapIcon icon="clock-fill" aria-hidden="true" />
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
                  <BootstrapIcon icon="diagram-3-fill" />
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
                <BootstrapIcon icon="shield-fill-check" />
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

      </form>

      <template #footer-start>
          <button
            class="briefing-preferences-reset"
            type="button"
            :disabled="isLoading || isSaving || loadError"
            @click="resetPreferences"
          >
            Reset to defaults
          </button>
      </template>
  </PreferencesDialogShell>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import {
  fetchBriefingPreferences,
  saveBriefingPreferences
} from '../../api/briefing.js';
import PreferencesDialogShell from '../dialogs/PreferencesDialogShell.vue';

const BRIEFING_RESET_DEFAULTS = Object.freeze({
  includeOnlyUnreadArticles: false,
  markAsReadOnScroll: false,
  includeDevelopingEvents: false,
  showOnlyInterestMatchedArticles: false,
  showOnlyDevelopingEventArticles: false,
  minDistinctSources: 1,
  prioritizeHighTrust: false,
  selectionPeriod: '7d'
});

export default {
  computed: {
    ...mapStores(useSelectionStore, useUiStore)
  },
  name: 'BriefingPreferencesModal',
  components: {
    PreferencesDialogShell
  },
  // Initializes the independent briefing preference form and request state.
  data() {
    return {
      form: {
        includeOnlyUnreadArticles: false,
        markAsReadOnScroll: false,
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
  // Loads briefing preferences when the dialog is created.
  created() {
    this.loadPreferences();
  },
  // Invalidates pending loads when the preference dialog unmounts.
  beforeUnmount() {
    this.activeRequestId++;
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
        if (!this.form.includeOnlyUnreadArticles) {
          this.form.markAsReadOnScroll = false;
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
    // This function clears the dependent scrolling preference when unread filtering is disabled.
    handleOnlyUnreadChange() {
      if (!this.form.includeOnlyUnreadArticles) {
        this.form.markAsReadOnScroll = false;
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
    // This function restores the requested briefing defaults in the local draft.
    resetPreferences() {
      this.form = { ...BRIEFING_RESET_DEFAULTS };
      this.saveError = false;
    },
    // This function saves a complete preference replacement.
    async savePreferences() {
      if (this.isLoading || this.isSaving || this.loadError) return;

      const preferences = { ...this.form };

      this.isSaving = true;
      this.saveError = false;

      try {
        const { data } = await saveBriefingPreferences(preferences);
        this.form = {
          ...this.form,
          ...data.preferences
        };
        this.selectionStore.setBriefingFilters({
          selectionPeriod: data.preferences.selectionPeriod,
          includeOnlyUnreadArticles: data.preferences.includeOnlyUnreadArticles,
          markAsReadOnScroll: data.preferences.markAsReadOnScroll,
          prioritizeHighTrust: data.preferences.prioritizeHighTrust,
          showOnlyDevelopingEventArticles:
            data.preferences.showOnlyDevelopingEventArticles
        });
        this.selectionStore.refreshBriefingSelection();
        void this.selectionStore.refreshOverviewCounts();
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
      this.uiStore.setShowModal('');
    }
  }
};
</script>

<style scoped>
.briefing-preferences-section {
  min-width: 0;
  margin: 0;
  padding: 1rem 0;

  border: 0;
  border-bottom: 1px solid var(--briefing-preferences-section-border);
}

.briefing-preferences-section:last-child {
  border-bottom: 0;
}

.briefing-preferences-section-title {
  width: 100%;
  margin: 0 0 0.75rem;
  padding: 0;

  color: var(--briefing-preferences-section-label);
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
  border-top: 1px solid var(--briefing-preferences-option-border);
}

.briefing-preferences-option-dependent {
  padding-left: 2.75rem;
}

.briefing-preferences-option-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;

  width: 2rem;
  height: 2rem;

  color: var(--briefing-preferences-accent-icon);
  background-color: var(--briefing-preferences-accent-surface);
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
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.briefing-preferences-option-description,
.briefing-preferences-field-description {
  margin: 0;

  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.4;
}

.briefing-preferences-field-title {
  display: flex;
  gap: 0.4rem;
  align-items: center;

  margin-bottom: 0.15rem;
}

.briefing-preferences-field-title .bi {
  color: var(--briefing-preferences-field-icon);
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

  background-color: var(--briefing-preferences-switch-track);
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

  background-color: var(--briefing-preferences-switch-thumb);
  border-radius: 50%;
  box-shadow: var(--shadow-briefing-preferences-switch-thumb);

  content: "";
  transition: transform 150ms ease;
}

.briefing-switch input:checked + .briefing-switch-control {
  background-color: var(--color-primary);
}

.briefing-switch input:checked + .briefing-switch-control::after {
  transform: translateX(1rem);
}

.briefing-switch input:focus-visible + .briefing-switch-control {
  box-shadow: var(--shadow-briefing-preferences-switch-focus);
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

  background-color: var(--bg-control);
  border: 1px solid var(--briefing-preferences-period-border);
  border-radius: 0.375rem;

  cursor: pointer;
}

.briefing-period-option:has(input:checked) {
  background-color: var(--briefing-preferences-accent-surface);
  border-color: var(--briefing-preferences-accent-border);
  box-shadow: inset 0 0 0 1px var(--briefing-preferences-accent-border);
}

.briefing-period-option input {
  flex: 0 0 auto;

  margin: 0.15rem 0 0;

  accent-color: var(--color-primary);
}

.briefing-period-option span {
  display: grid;
  gap: 0.15rem;
}

.briefing-period-option strong {
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-weight: 600;
}

.briefing-period-option small {
  color: var(--text-secondary);
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

  color: var(--text-primary);
  background-color: var(--bg-control);
  border: 1px solid var(--briefing-preferences-input-border);
  border-radius: 0.375rem;

  font: inherit;
  font-size: 0.8125rem;
}

.briefing-preferences-select:focus {
  border-color: var(--briefing-preferences-input-focus-border);
  outline: 0;
  box-shadow: var(--shadow-briefing-preferences-input-focus);
}

.briefing-preferences-load-status {
  margin: 0 0 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.briefing-preferences-load-status-error {
  color: var(--briefing-preferences-error-text);
  background-color: var(--briefing-preferences-error-surface);
  border: 1px solid var(--briefing-preferences-error-border);
}

.briefing-preferences-reset {
  padding: 0;

  color: var(--color-link);
  background: var(--color-transparent);
  border: 0;

  font-size: 0.75rem;
  font-weight: 600;

  cursor: pointer;
}

.briefing-preferences-reset:hover {
  color: var(--color-link-hover);
  text-decoration: underline;
}

.briefing-preferences-reset:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* Mobile portrait */
@media (max-width: 575.98px) and (orientation: portrait) {
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
:global(:root[data-theme='dark'] .briefing-preferences-section) {
  border-color: var(--briefing-preferences-section-border);
}

:global(:root[data-theme='dark'] .briefing-preferences-option-title),
:global(:root[data-theme='dark'] .briefing-preferences-field-title),
:global(:root[data-theme='dark'] .briefing-period-option strong) {
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .briefing-preferences-option-description),
:global(:root[data-theme='dark'] .briefing-preferences-field-description),
:global(:root[data-theme='dark'] .briefing-period-option small) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .briefing-preferences-section-title) {
  color: var(--briefing-preferences-section-label);
}

:global(:root[data-theme='dark'] .briefing-preferences-option-icon) {
  color: var(--briefing-preferences-accent-icon);
  background-color: var(--briefing-preferences-accent-surface);
}

:global(:root[data-theme='dark'] .briefing-preferences-field-title .bi) {
  color: var(--briefing-preferences-field-icon);
}

:global(:root[data-theme='dark'] .briefing-preferences-reset) {
  color: var(--color-link);
}

:global(:root[data-theme='dark'] .briefing-preferences-option + .briefing-preferences-option) {
  border-color: var(--briefing-preferences-option-border);
}

:global(:root[data-theme='dark'] .briefing-switch-control) {
  background-color: var(--briefing-preferences-switch-track);
}

:global(:root[data-theme='dark'] .briefing-switch-control::after) {
  background-color: var(--briefing-preferences-switch-thumb);
  box-shadow: var(--shadow-briefing-preferences-switch-thumb);
}

:global(:root[data-theme='dark'] .briefing-switch input:checked + .briefing-switch-control) {
  background-color: var(--color-primary);
}

:global(:root[data-theme='dark'] .briefing-switch input:focus-visible + .briefing-switch-control) {
  box-shadow: var(--shadow-briefing-preferences-switch-focus);
}

:global(:root[data-theme='dark'] .briefing-period-option),
:global(:root[data-theme='dark'] .briefing-preferences-select),
:global(:root[data-theme='dark'] .briefing-preferences-select option) {
  color: var(--text-primary);
  background-color: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .briefing-period-option:has(input:checked)) {
  background-color: var(--briefing-preferences-accent-surface);
  border-color: var(--briefing-preferences-accent-border);
  box-shadow: inset 0 0 0 1px var(--briefing-preferences-accent-border);
}

:global(:root[data-theme='dark'] .briefing-preferences-select:focus) {
  border-color: var(--briefing-preferences-input-focus-border);
  box-shadow: var(--shadow-briefing-preferences-input-focus);
}

:global(:root[data-theme='dark'] .briefing-preferences-load-status-error) {
  color: var(--briefing-preferences-error-text);
  background-color: var(--briefing-preferences-error-surface);
  border-color: var(--briefing-preferences-error-border);
}

:global(:root[data-theme='dark'] .briefing-preferences-reset:hover) {
  color: var(--color-link-hover);
}

</style>
