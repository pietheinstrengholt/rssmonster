<template>
  <PreferencesDialogShell
    title="Sidebar configuration settings"
    description="Choose how article counts appear in the sidebar."
    form-id="sidebar-preferences-form"
    close-label="Close sidebar settings"
    :saving="isSaving"
    :submit-disabled="isLoading || loadError"
    @close="closeModal"
  >
    <form id="sidebar-preferences-form" @submit.prevent="savePreferences">
      <p v-if="isLoading" role="status">Loading sidebar settings…</p>
      <p v-if="loadError" role="alert">
        Sidebar settings could not be loaded. Close and reopen this dialog to try again.
      </p>
      <p v-if="saveError" role="alert">
        Sidebar settings could not be saved. Please try again.
      </p>
      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-show-total-label" class="sidebar-preferences-title">Show total count</span>
          <span id="sidebar-show-total-description" class="sidebar-preferences-description">
            Show selection/total, such as 9/109, instead of only the selected count.
          </span>
        </span>
        <input
          v-model="form.showTotalCount"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError"
          aria-labelledby="sidebar-show-total-label"
          aria-describedby="sidebar-show-total-description"
        />
      </label>

      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-declutter-label" class="sidebar-preferences-title">Declutter counts</span>
          <span id="sidebar-declutter-description" class="sidebar-preferences-description">
            Hide the total when it adds no information: show 0 instead of 0/0 and 4 instead of 4/4.
          </span>
        </span>
        <input
          v-model="form.declutterCounts"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError"
          aria-labelledby="sidebar-declutter-label"
          aria-describedby="sidebar-declutter-description"
        />
      </label>
    </form>
  </PreferencesDialogShell>
</template>

<script>
import { mapStores } from 'pinia';
import { useAuthStore } from '../../store/auth.js';
import { useUiStore } from '../../store/ui.js';
import { fetchSidebarSettings, saveSidebarSettings } from '../../api/sidebar.js';
import PreferencesDialogShell from './PreferencesDialogShell.vue';

export default {
  name: 'SidebarConfigurationModal',
  components: { PreferencesDialogShell },
  data() {
    return {
      form: { showTotalCount: true, declutterCounts: true },
      isLoading: true,
      isSaving: false,
      loadError: false,
      saveError: false,
      activeRequestId: 0
    };
  },
  computed: {
    ...mapStores(useUiStore, useAuthStore)
  },
  created() {
    this.loadPreferences();
  },
  beforeUnmount() {
    this.activeRequestId++;
  },
  methods: {
    async loadPreferences() {
      const requestId = ++this.activeRequestId;
      const sessionId = this.authStore.sessionRequestId;
      try {
        const { data } = await fetchSidebarSettings();
        if (requestId !== this.activeRequestId || sessionId !== this.authStore.sessionRequestId) return;
        this.form = { ...data.settings };
        this.uiStore.setSidebarSettings(data.settings);
      } catch {
        if (requestId === this.activeRequestId) this.loadError = true;
      } finally {
        if (requestId === this.activeRequestId) this.isLoading = false;
      }
    },
    async savePreferences() {
      if (this.isLoading || this.isSaving || this.loadError) return;
      const requestId = ++this.activeRequestId;
      const sessionId = this.authStore.sessionRequestId;
      this.isSaving = true;
      this.saveError = false;
      try {
        const { data } = await saveSidebarSettings({ ...this.form });
        if (requestId !== this.activeRequestId || sessionId !== this.authStore.sessionRequestId) return;
        this.uiStore.setSidebarSettings(data.settings);
        this.uiStore.setShowModal('');
      } catch {
        if (requestId === this.activeRequestId) this.saveError = true;
      } finally {
        if (requestId === this.activeRequestId) this.isSaving = false;
      }
    },
    closeModal() {
      if (!this.isSaving) this.uiStore.setShowModal('');
    }
  }
};
</script>

<style scoped>
.sidebar-preferences-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 4.5rem;
  padding: 1rem 0;
  cursor: pointer;
}

.sidebar-preferences-option + .sidebar-preferences-option {
  border-top: 1px solid var(--border-subtle);
}

.sidebar-preferences-content {
  display: grid;
  flex: 1 1 auto;
  gap: 0.125rem;
  min-width: 0;
}

.sidebar-preferences-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.sidebar-preferences-description {
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.4;
}

.sidebar-preferences-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.25rem;
  height: 1.25rem;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: var(--preferences-switch-track);
  cursor: pointer;
  transition: background-color 150ms ease;
}

.sidebar-preferences-switch::after {
  position: absolute;
  top: 0.1875rem;
  left: 0.1875rem;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  background: var(--text-inverted);
  content: '';
  transition: transform 150ms ease;
}

.sidebar-preferences-switch:checked {
  background: var(--color-primary);
}

.sidebar-preferences-switch:checked::after {
  transform: translateX(1rem);
}

.sidebar-preferences-switch:disabled {
  opacity: 0.6;
  cursor: default;
}

.sidebar-preferences-switch:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
</style>
