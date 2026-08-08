<template>
  <PreferencesDialogShell
    title="Tune your unread selection"
    description="Choose which stories appear in your unread selection."
    form-id="unread-preferences-form"
    close-label="Close unread preferences"
    :saving="isSaving"
    :submit-disabled="isLoading"
    @close="closeModal"
  >
      <form
        id="unread-preferences-form"
        class="unread-preferences-form"
        @submit.prevent="savePreferences"
      >
        <div class="unread-preferences-body">
          <p
            v-if="loadError"
            class="unread-preferences-status unread-preferences-status-error"
            role="alert"
          >
            Unread preferences could not be loaded. The default value is shown.
          </p>

          <p
            v-if="saveError"
            class="unread-preferences-status unread-preferences-status-error"
            role="alert"
          >
            Unread preferences could not be saved. Please try again.
          </p>

          <label class="unread-preferences-option">
            <span class="unread-preferences-option-icon" aria-hidden="true">
              <BootstrapIcon icon="graph-up-arrow" />
            </span>

            <span class="unread-preferences-option-content">
              <span class="unread-preferences-option-title">
                Developing events
              </span>
              <span class="unread-preferences-option-description">
                Include new coverage for events you have already seen.
              </span>
            </span>

            <span class="unread-switch">
              <input
                v-model="form.includeDevelopingEvents"
                name="includeDevelopingEvents"
                type="checkbox"
                role="switch"
                :disabled="isLoading || isSaving"
              />
              <span class="unread-switch-control" aria-hidden="true"></span>
            </span>
          </label>

          <label class="unread-preferences-option">
            <span class="unread-preferences-option-icon" aria-hidden="true">
              <BootstrapIcon icon="shield-fill-check" />
            </span>

            <span class="unread-preferences-option-content">
              <span class="unread-preferences-option-title">
                Prioritize high-trust coverage
              </span>
              <span class="unread-preferences-option-description">
                Rank events from reliable feeds more prominently.
              </span>
            </span>

            <span class="unread-switch">
              <input
                v-model="form.prioritizeHighTrust"
                name="prioritizeHighTrust"
                type="checkbox"
                role="switch"
                :disabled="isLoading || isSaving"
              />
              <span class="unread-switch-control" aria-hidden="true"></span>
            </span>
          </label>

          <label class="unread-preferences-option">
            <span class="unread-preferences-option-icon" aria-hidden="true">
              <BootstrapIcon icon="check2-circle" />
            </span>

            <span class="unread-preferences-option-content">
              <span class="unread-preferences-option-title">
                Mark as read while scrolling
              </span>
              <span class="unread-preferences-option-description">
                Automatically mark unread articles as read after you scroll past them. This does not run in Headlines mode.
              </span>
            </span>

            <span class="unread-switch">
              <input
                v-model="form.markAsReadOnScroll"
                name="markAsReadOnScroll"
                type="checkbox"
                role="switch"
                :disabled="isLoading || isSaving"
              />
              <span class="unread-switch-control" aria-hidden="true"></span>
            </span>
          </label>

          <label class="unread-preferences-option">
            <span class="unread-preferences-option-icon" aria-hidden="true">
              <BootstrapIcon icon="house-door" />
            </span>

            <span class="unread-preferences-option-content">
              <span class="unread-preferences-option-title">
                Use default view on startup
              </span>
              <span class="unread-preferences-option-description">
                Open the default unread view after refreshing or reopening RSSMonster.
              </span>
            </span>

            <span class="unread-switch">
              <input
                v-model="form.useDefaultStartupView"
                name="useDefaultStartupView"
                type="checkbox"
                role="switch"
                :disabled="isLoading || isSaving"
              />
              <span class="unread-switch-control" aria-hidden="true"></span>
            </span>
          </label>
        </div>

      </form>
  </PreferencesDialogShell>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import {
  fetchSettings as fetchSettingsAPI,
  saveIncludeDevelopingEvents as saveIncludeDevelopingEventsAPI,
  saveMarkAsReadOnScroll as saveMarkAsReadOnScrollAPI,
  savePrioritizeHighTrust as savePrioritizeHighTrustAPI,
  saveStartupViewMode as saveStartupViewModeAPI
} from '../../api/settings.js';
import PreferencesDialogShell from './PreferencesDialogShell.vue';

export default {
  computed: {
    ...mapStores(useSelectionStore, useUiStore)
  },
  name: 'UnreadConfigurationModal',
  components: {
    PreferencesDialogShell
  },
  // Initializes unread preference form and request state.
  data() {
    return {
      form: {
        includeDevelopingEvents: false,
        markAsReadOnScroll: true,
        prioritizeHighTrust: false,
        useDefaultStartupView: false
      },
      isLoading: true,
      isSaving: false,
      loadError: false,
      saveError: false,
      activeRequestId: 0
    };
  },
  // Loads unread preferences when the dialog is created.
  created() {
    this.loadPreferences();
  },
  // Invalidates pending loads when the preference dialog unmounts.
  beforeUnmount() {
    this.activeRequestId++;
  },
  methods: {
    // This function loads the current unread preference.
    async loadPreferences() {
      const requestId = ++this.activeRequestId;
      this.isLoading = true;
      this.loadError = false;

      try {
        const { data } = await fetchSettingsAPI();
        if (requestId !== this.activeRequestId) return;

        this.form.includeDevelopingEvents = Boolean(data.includeDevelopingEvents);
        this.form.markAsReadOnScroll = data.markAsReadOnScroll !== false;
        this.form.prioritizeHighTrust = Boolean(data.prioritizeHighTrust);
        this.form.useDefaultStartupView = data.startupViewMode === 'default';
      } catch (error) {
        if (requestId !== this.activeRequestId) return;
        console.error('Error loading Unread Preferences:', error);
        this.loadError = true;
      } finally {
        if (requestId === this.activeRequestId) {
          this.isLoading = false;
        }
      }
    },
    // This function persists the unread and startup preferences.
    async savePreferences() {
      if (this.isLoading || this.isSaving) return;

      this.isSaving = true;
      this.saveError = false;

      try {
        const startupViewMode = this.form.useDefaultStartupView ? 'default' : 'last-used';
        const [
          { data: unreadData },
          { data: scrollingData }
        ] = await Promise.all([
          saveIncludeDevelopingEventsAPI(this.form.includeDevelopingEvents),
          saveMarkAsReadOnScrollAPI(this.form.markAsReadOnScroll),
          savePrioritizeHighTrustAPI(this.form.prioritizeHighTrust),
          saveStartupViewModeAPI(startupViewMode)
        ]);
        const includeDevelopingEvents = Boolean(unreadData.includeDevelopingEvents);
        const markAsReadOnScroll = Boolean(scrollingData.markAsReadOnScroll);

        this.selectionStore.setCurrentSelection({
          includeDevelopingEvents,
          markAsReadOnScroll
        });
        this.closeModal();
      } catch (error) {
        console.error('Error saving Unread Preferences:', error);
        this.saveError = true;
      } finally {
        this.isSaving = false;
      }
    },
    // This function closes the unread configuration modal.
    closeModal() {
      this.uiStore.setShowModal('');
    }
  }
};
</script>

<style scoped>
.unread-preferences-option-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
  border-radius: 0.375rem;
}

.unread-preferences-option-icon {
  font-size: 0.9rem;
}

.unread-preferences-status {
  margin: 0 0 1rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
}

.unread-preferences-status-error {
  color: var(--badge-danger-text);
  background-color: var(--badge-danger-bg);
  border: 1px solid var(--settings-danger-border);
}

.unread-preferences-option {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-height: 4.5rem;
  padding: 1rem 0;
  cursor: pointer;
}

.unread-preferences-option + .unread-preferences-option {
  border-top: 1px solid var(--border-subtle);
}

.unread-preferences-option-content {
  display: grid;
  flex: 1 1 auto;
  gap: 0.125rem;
  min-width: 0;
}

.unread-preferences-option-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.unread-preferences-option-description {
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.4;
}

.unread-switch {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  width: 2.25rem;
  height: 1.25rem;
}

.unread-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.unread-switch-control {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--preferences-switch-track);
  border-radius: 999px;
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.unread-switch-control::after {
  position: absolute;
  top: 0.1875rem;
  left: 0.1875rem;
  width: 0.875rem;
  height: 0.875rem;
  background-color: var(--text-inverted);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
  content: "";
  transition: transform 150ms ease;
}

.unread-switch input:checked + .unread-switch-control {
  background-color: var(--color-primary);
}

.unread-switch input:checked + .unread-switch-control::after {
  transform: translateX(1rem);
}

.unread-switch input:focus-visible + .unread-switch-control {
  box-shadow:
    0 0 0 2px var(--text-inverted),
    0 0 0 4px rgba(37, 99, 235, 0.4);
}

.unread-switch input:disabled + .unread-switch-control {
  opacity: 0.6;
  cursor: wait;
}

@media (max-width: 575.98px) {
  .unread-preferences-option {
    align-items: flex-start;
  }

  .unread-switch {
    margin-top: 0.375rem;
  }
}

:global(:root[data-theme='dark'] .unread-preferences-option + .unread-preferences-option) {
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .unread-preferences-option-icon) {
  color: var(--color-link, #60a5fa);
  background-color: var(--bg-control, #222836);
}

:global(:root[data-theme='dark'] .unread-preferences-option-description) {
  color: var(--text-secondary, #9ca3af);
}

:global(:root[data-theme='dark'] .unread-preferences-status-error) {
  color: var(--badge-danger-text);
  background-color: rgba(127, 29, 29, 0.28);
  border-color: var(--border-danger);
}
</style>
