<template>
  <div class="unread-preferences-backdrop">
    <section
      class="unread-preferences-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unread-preferences-title"
      aria-describedby="unread-preferences-description"
    >
      <header class="unread-preferences-header">
        <div class="unread-preferences-heading">
          <div class="unread-preferences-heading-icon" aria-hidden="true">
            <i class="bi bi-sliders2"></i>
          </div>

          <div>
            <h2 id="unread-preferences-title" class="unread-preferences-title">
              Tune your unread selection
            </h2>
            <p id="unread-preferences-description" class="unread-preferences-subtitle">
              Choose which stories appear in your unread selection.
            </p>
          </div>
        </div>

        <button
          class="unread-preferences-close"
          type="button"
          aria-label="Close unread preferences"
          @click="closeModal"
        >
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </header>

      <form class="unread-preferences-form" @submit.prevent="savePreferences">
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
              <i class="bi bi-graph-up-arrow"></i>
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
        </div>

        <footer class="unread-preferences-footer">
          <button
            class="unread-preferences-button unread-preferences-button-secondary"
            type="button"
            :disabled="isSaving"
            @click="closeModal"
          >
            Cancel
          </button>
          <button
            class="unread-preferences-button unread-preferences-button-primary"
            type="submit"
            :disabled="isLoading || isSaving"
          >
            {{ isSaving ? 'Saving…' : 'Save changes' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script>
import {
  fetchSettings as fetchSettingsAPI,
  saveIncludeDevelopingEvents as saveIncludeDevelopingEventsAPI
} from '../../api/settings.js';

export default {
  name: 'UnreadConfigurationModal',
  data() {
    return {
      form: {
        includeDevelopingEvents: false
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
    // This function loads the current unread preference.
    async loadPreferences() {
      const requestId = ++this.activeRequestId;
      this.isLoading = true;
      this.loadError = false;

      try {
        const { data } = await fetchSettingsAPI();
        if (requestId !== this.activeRequestId) return;

        this.form.includeDevelopingEvents = Boolean(data.includeDevelopingEvents);
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
    // This function persists the unread developing-events preference.
    async savePreferences() {
      if (this.isLoading || this.isSaving) return;

      this.isSaving = true;
      this.saveError = false;

      try {
        const { data } = await saveIncludeDevelopingEventsAPI(
          this.form.includeDevelopingEvents
        );
        const includeDevelopingEvents = Boolean(data.includeDevelopingEvents);

        this.$store.data.setCurrentSelection({ includeDevelopingEvents });
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
      this.$store.data.setShowModal('');
    },
    // This function closes the modal when Escape is pressed.
    handleKeydown(event) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      this.closeModal();
    }
  }
};
</script>

<style scoped>
.unread-preferences-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background-color: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(1px);
}

.unread-preferences-modal {
  display: flex;
  flex-direction: column;
  width: min(40rem, 100%);
  color: #111827;
  background-color: #ffffff;
  border: 1px solid #dfe3e8;
  border-radius: 0.5rem;
  box-shadow:
    0 1.5rem 3rem rgba(15, 23, 42, 0.2),
    0 0.25rem 0.75rem rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.unread-preferences-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1rem 1.125rem;
  border-bottom: 1px solid #e5e7eb;
}

.unread-preferences-heading {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  min-width: 0;
}

.unread-preferences-heading-icon,
.unread-preferences-option-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  color: #2563eb;
  background-color: #eff6ff;
  border-radius: 0.375rem;
}

.unread-preferences-heading-icon {
  font-size: 1.1rem;
}

.unread-preferences-option-icon {
  font-size: 0.9rem;
}

.unread-preferences-title {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.3;
}

.unread-preferences-subtitle {
  margin: 0.2rem 0 0;
  color: #6b7280;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.unread-preferences-close {
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

.unread-preferences-close:hover {
  color: #111827;
  background-color: #f3f4f6;
}

.unread-preferences-close:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.unread-preferences-form {
  display: flex;
  flex-direction: column;
}

.unread-preferences-body {
  padding: 0 1.125rem;
}

.unread-preferences-status {
  margin: 1rem 0 0;
  padding: 0.625rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
}

.unread-preferences-status-error {
  color: #991b1b;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}

.unread-preferences-option {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-height: 4.5rem;
  padding: 1rem 0;
  cursor: pointer;
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
  color: #6b7280;
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
  background-color: #cbd5e1;
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
  background-color: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
  content: "";
  transition: transform 150ms ease;
}

.unread-switch input:checked + .unread-switch-control {
  background-color: #2563eb;
}

.unread-switch input:checked + .unread-switch-control::after {
  transform: translateX(1rem);
}

.unread-switch input:focus-visible + .unread-switch-control {
  box-shadow:
    0 0 0 2px #ffffff,
    0 0 0 4px rgba(37, 99, 235, 0.4);
}

.unread-switch input:disabled + .unread-switch-control {
  opacity: 0.6;
  cursor: wait;
}

.unread-preferences-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 0.875rem 1.125rem;
  background-color: #f8fafc;
  border-top: 1px solid #e5e7eb;
}

.unread-preferences-button {
  min-width: 5.5rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.25;
  cursor: pointer;
}

.unread-preferences-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.unread-preferences-button-secondary {
  color: #374151;
  background-color: #ffffff;
  border-color: #d1d5db;
}

.unread-preferences-button-secondary:hover:not(:disabled) {
  background-color: #f3f4f6;
}

.unread-preferences-button-primary {
  color: #ffffff;
  background-color: #2563eb;
  border-color: #2563eb;
}

.unread-preferences-button-primary:hover:not(:disabled) {
  background-color: #1d4ed8;
  border-color: #1d4ed8;
}

@media (max-width: 575.98px) {
  .unread-preferences-backdrop {
    padding: 0.75rem;
  }

  .unread-preferences-option {
    align-items: flex-start;
  }

  .unread-switch {
    margin-top: 0.375rem;
  }
}

:global(:root[data-theme='dark'] .unread-preferences-modal) {
  color: var(--text-primary, #e5e7eb);
  background-color: var(--dark-page-surface, #0b0f14);
  border-color: var(--border-color, #2a3342);
}

:global(:root[data-theme='dark'] .unread-preferences-header),
:global(:root[data-theme='dark'] .unread-preferences-footer) {
  border-color: var(--border-color, #2a3342);
}

:global(:root[data-theme='dark'] .unread-preferences-footer) {
  background-color: var(--bg-control, #222836);
}

:global(:root[data-theme='dark'] .unread-preferences-heading-icon),
:global(:root[data-theme='dark'] .unread-preferences-option-icon) {
  color: var(--color-link, #60a5fa);
  background-color: var(--bg-control, #222836);
}

:global(:root[data-theme='dark'] .unread-preferences-subtitle),
:global(:root[data-theme='dark'] .unread-preferences-option-description) {
  color: var(--text-secondary, #9ca3af);
}

:global(:root[data-theme='dark'] .unread-preferences-close) {
  color: var(--text-secondary, #9ca3af);
}

:global(:root[data-theme='dark'] .unread-preferences-close:hover),
:global(:root[data-theme='dark'] .unread-preferences-button-secondary) {
  color: var(--text-primary, #e5e7eb);
  background-color: var(--dark-page-surface, #0b0f14);
}

:global(:root[data-theme='dark'] .unread-preferences-button-secondary) {
  border-color: var(--border-color, #2a3342);
}

:global(:root[data-theme='dark'] .unread-preferences-status-error) {
  color: #fecaca;
  background-color: rgba(127, 29, 29, 0.28);
  border-color: #7f1d1d;
}
</style>
