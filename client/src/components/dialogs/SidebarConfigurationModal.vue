<template>
  <PreferencesDialogShell
    title="Sidebar configuration settings"
    description="Choose how counts and sections appear in the sidebar."
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
            <template v-if="!form.showTotalCount">Enable Show total count to use this option.</template>
          </span>
        </span>
        <input
          v-model="form.declutterCounts"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError || !form.showTotalCount"
          aria-labelledby="sidebar-declutter-label"
          aria-describedby="sidebar-declutter-description"
        />
      </label>

      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-hide-zero-label" class="sidebar-preferences-title">Hide zero-count items</span>
          <span id="sidebar-hide-zero-description" class="sidebar-preferences-description">
            Hide empty Smart Folders and tags, and categories and feeds with no articles in the current selection.
            Categories with matching feeds stay visible. All feeds filters remain available.
          </span>
        </span>
        <input
          v-model="form.hideZeroCountItems"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError"
          aria-labelledby="sidebar-hide-zero-label"
          aria-describedby="sidebar-hide-zero-description"
        />
      </label>

      <section class="sidebar-settings-section" aria-labelledby="sidebar-section-order-title">
        <div class="sidebar-settings-section__header">
          <span class="sidebar-settings-section__header-icon">
            <BootstrapIcon icon="collection-fill" decorative />
          </span>
          <div>
            <h3 id="sidebar-section-order-title" class="sidebar-preferences-title">Section order</h3>
            <p class="sidebar-preferences-description">
              Drag and drop to change the order of the main sections in the sidebar.
            </p>
          </div>
        </div>
        <Draggable
          v-model="form.sectionOrder"
          tag="ol"
          class="sidebar-section-order"
          aria-label="Sidebar section order"
          :item-key="sectionId => sectionId"
          :disabled="isLoading || isSaving || loadError"
          handle=".sidebar-section-order__drag-handle"
          ghost-class="sidebar-section-order__item--dragging"
          :animation="150"
        >
          <template #item="{ element: sectionId }">
            <li class="sidebar-section-order__item">
              <button
                type="button"
                class="sidebar-section-order__drag-handle"
                :aria-label="`Reorder ${sections[sectionId].label}`"
                aria-describedby="sidebar-section-order-help"
                :disabled="isLoading || isSaving || loadError"
                @keydown.up.prevent="moveSection(sectionId, -1, $event)"
                @keydown.down.prevent="moveSection(sectionId, 1, $event)"
              >
                <BootstrapIcon icon="grip-vertical" decorative />
              </button>
              <BootstrapIcon :icon="sections[sectionId].icon" decorative />
              <span class="sidebar-section-order__label">{{ sections[sectionId].label }}</span>
              <BootstrapIcon class="sidebar-section-order__indicator" icon="grip-vertical" :rotate="90" decorative />
            </li>
          </template>
        </Draggable>
        <p id="sidebar-section-order-help" class="sidebar-preferences-description sidebar-section-order__help">
          Use the drag handles or focus a handle and press the up or down arrow key.
        </p>
      </section>

      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-hide-inactive-label" class="sidebar-preferences-title">Automatically hide inactive feeds</span>
          <span id="sidebar-hide-inactive-description" class="sidebar-preferences-description">
            Move feeds that have not received new articles into a collapsed Inactive feeds group.
            Feeds that have never received an article are measured from the subscription date.
          </span>
        </span>
        <input
          v-model="form.automaticallyHideInactiveFeeds"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError"
          aria-labelledby="sidebar-hide-inactive-label"
          aria-describedby="sidebar-hide-inactive-description"
        />
      </label>
      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-inactive-after-label" class="sidebar-preferences-title">Inactive after</span>
          <span id="sidebar-inactive-after-description" class="sidebar-preferences-description">
            Feeds move to Inactive feeds after this many days without a new article.
            Checking for updates does not reset this period.
          </span>
        </span>
        <select
          v-model.number="form.inactiveFeedDays"
          aria-labelledby="sidebar-inactive-after-label"
          aria-describedby="sidebar-inactive-after-description"
          class="app-form-select app-form-control--compact sidebar-preferences-select"
          :disabled="!form.automaticallyHideInactiveFeeds || isLoading || isSaving || loadError"
        >
          <option :value="30">30 days</option>
          <option :value="60">60 days</option>
          <option :value="90">90 days</option>
        </select>
      </label>
      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-dynamic-sort-label" class="sidebar-preferences-title">Sort by current selection</span>
          <span id="sidebar-dynamic-sort-description" class="sidebar-preferences-description">
            Sort highest count first for Unread, Favorites, Hot, or the current selection.
            This overrides the sort option below while enabled.
          </span>
        </span>
        <input
          v-model="form.sortByCurrentSelection"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError"
          aria-labelledby="sidebar-dynamic-sort-label"
          aria-describedby="sidebar-dynamic-sort-description"
        />
      </label>
      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span class="sidebar-preferences-title">Sort sidebar category items by</span>
        </span>
        <select
          v-model="form.sortOrder"
          class="app-form-select app-form-control--compact sidebar-preferences-select"
          aria-label="Sort sidebar category items by"
          :disabled="form.sortByCurrentSelection || isLoading || isSaving || loadError"
        >
          <option value="manual">Manual order</option>
          <option value="name">Name</option>
          <option value="selectedCount">Selected count</option>
          <option value="totalCount">Total count</option>
          <option value="recentlyActive">Recently active</option>
          <option value="personalInterests">Personal interests</option>
        </select>
      </label>
      <label class="sidebar-preferences-option">
        <span class="sidebar-preferences-content">
          <span id="sidebar-feed-favicons-label" class="sidebar-preferences-title">Show feed favicon icons</span>
          <span id="sidebar-feed-favicons-description" class="sidebar-preferences-description">
            Show icons beside feeds in the category list, including Inactive feeds.
          </span>
        </span>
        <input
          v-model="form.showFeedFavicons"
          class="sidebar-preferences-switch"
          type="checkbox"
          role="switch"
          :disabled="isLoading || isSaving || loadError"
          aria-labelledby="sidebar-feed-favicons-label"
          aria-describedby="sidebar-feed-favicons-description"
        />
      </label>
    </form>
  </PreferencesDialogShell>
</template>

<script>
import { mapStores } from 'pinia';
import Draggable from 'vuedraggable';
import { normalizeSidebarSectionOrder } from '../../utils/sidebarSectionOrder.js';
import { useAuthStore } from '../../store/auth.js';
import { useUiStore } from '../../store/ui.js';
import { fetchSidebarSettings, saveSidebarSettings } from '../../api/sidebar.js';
import PreferencesDialogShell from './PreferencesDialogShell.vue';

const sections = {
  pinned: { label: 'Pinned', icon: 'pin-angle-fill' },
  'smart-folders': { label: 'Smart Folders', icon: 'folder-fill' },
  'all-feeds': { label: 'All feeds', icon: 'rss-fill' },
  'top-tags': { label: 'Top tags', icon: 'tag-fill' },
  categories: { label: 'Categories', icon: 'collection-fill' }
};

export default {
  name: 'SidebarConfigurationModal',
  components: { PreferencesDialogShell, Draggable },
  data() {
    return {
      sections,
      form: { sectionOrder: normalizeSidebarSectionOrder(), showTotalCount: true, declutterCounts: true, hideZeroCountItems: false, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false },
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
  watch: {
    'form.showTotalCount'(showTotalCount) {
      if (!showTotalCount) this.form.declutterCounts = false;
    }
  },
  created() {
    this.loadPreferences();
  },
  beforeUnmount() {
    this.activeRequestId++;
  },
  methods: {
    moveSection(sectionId, direction, event) {
      if (this.isLoading || this.isSaving || this.loadError) return;
      const index = this.form.sectionOrder.indexOf(sectionId);
      const target = index + direction;
      if (target < 0 || target >= this.form.sectionOrder.length) return;
      this.form.sectionOrder.splice(index, 1);
      this.form.sectionOrder.splice(target, 0, sectionId);
      const handle = event.currentTarget;
      this.$nextTick(() => handle.focus());
    },
    async loadPreferences() {
      const requestId = ++this.activeRequestId;
      const sessionId = this.authStore.sessionRequestId;
      try {
        const { data } = await fetchSidebarSettings();
        if (requestId !== this.activeRequestId || sessionId !== this.authStore.sessionRequestId) return;
        this.form = { ...data.settings, sectionOrder: normalizeSidebarSectionOrder(data.settings.sectionOrder) };
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
        const { data } = await saveSidebarSettings({ ...this.form, sectionOrder: [...this.form.sectionOrder] });
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
.sidebar-settings-section {
  padding: 1rem 0;
  border-top: 1px solid var(--border-subtle);
}

.sidebar-settings-section__header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.sidebar-settings-section__header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 2rem;
  height: 2rem;
  border-radius: var(--radius-control);
  background: var(--surface-chrome);
  color: var(--text-primary);
}

.sidebar-settings-section__header h3 {
  margin: 0 0 0.25rem;
}

.sidebar-settings-section__header p {
  margin: 0;
}

.sidebar-section-order {
  padding: 0;
  margin: 0;
  list-style: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  overflow: hidden;
  background: var(--surface-card);
  color: var(--text-primary);
}

.sidebar-section-order__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: var(--control-height-touch);
  padding: 0.375rem 0.75rem;
}

.sidebar-section-order__item + .sidebar-section-order__item {
  border-top: 1px solid var(--border-subtle);
}

.sidebar-section-order__item:hover,
.sidebar-section-order__item:focus-within {
  background: var(--surface-hover);
}

.sidebar-section-order__item--dragging {
  opacity: 0.65;
  background: var(--surface-selected);
}

.sidebar-section-order__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--control-height-compact);
  height: var(--control-height-compact);
  padding: 0;
  border: 0;
  border-radius: var(--radius-compact);
  background: var(--color-transparent);
  color: var(--text-secondary);
  cursor: grab;
  touch-action: none;
}

.sidebar-section-order__drag-handle:active {
  cursor: grabbing;
}

.sidebar-section-order__drag-handle:disabled {
  opacity: 0.6;
  cursor: default;
}

.sidebar-section-order__drag-handle:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-section-order__label {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
}

.sidebar-section-order__indicator {
  color: var(--text-secondary);
}

.sidebar-section-order__help {
  margin: 0.5rem 0 0;
}

.sidebar-preferences-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 4.5rem;
  padding: 1rem 0;
  cursor: pointer;
}

.sidebar-preferences-option + .sidebar-preferences-option,
.sidebar-settings-section + .sidebar-preferences-option {
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

.sidebar-preferences-select {
  width: auto;
  flex: 0 0 auto;
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
