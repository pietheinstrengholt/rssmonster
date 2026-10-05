<template>
  <div class="settings-page offline-settings">
    <SettingsPageIntro
      eyebrow="Settings — Reading"
      icon="download"
      title="Offline reading"
      title-id="offline-reading-title"
    >
      Keep a selection of articles available offline on tablets and mobile devices.
    </SettingsPageIntro>

    <div
      v-if="error || offlineReadingStore.error"
      class="offline-error"
      role="alert"
    >
      <BootstrapIcon icon="exclamation-triangle-fill" decorative />
      <span>{{ error || offlineReadingStore.error }}</span>
    </div>

    <div class="offline-settings-grid">
      <section class="settings-panel offline-card offline-config-card">
        <header class="offline-card-header">
          <div>
            <h4>Offline reading settings</h4>
            <p>Configure how RSSMonster stores content for offline reading.</p>
          </div>
        </header>

        <label class="offline-setting-row">
          <span class="offline-setting-icon">
            <BootstrapIcon icon="download" decorative />
          </span>

          <span class="offline-setting-content">
            <strong>Enable offline reading</strong>
            <small>
              Download and store articles on this device for offline access.
            </small>
          </span>

          <span class="offline-switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="Enable offline reading"
              :checked="profile.enabled"
              :disabled="saving"
              @change="configure({ enabled: $event.target.checked })"
            >
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="offline-setting-divider">
          <fieldset class="offline-setting-row offline-limit-setting" :disabled="saving">
            <legend class="offline-setting-heading">
              <span class="offline-setting-icon">
                <BootstrapIcon icon="database" decorative />
              </span>
              <span class="offline-setting-content">
                <strong>Articles to keep offline</strong>
                <small>Choose how many of your most recent articles to store.</small>
              </span>
            </legend>

            <div
              class="offline-limit-options"
              role="radiogroup"
              aria-label="Articles to keep offline"
            >
              <label
                v-for="limit in limits"
                :key="limit"
                class="offline-limit-option"
                :class="{ 'is-selected': profile.articleLimit === limit }"
              >
                <input
                  type="radio"
                  name="offline-limit"
                  :value="limit"
                  :checked="profile.articleLimit === limit"
                  @change="configure({ articleLimit: limit })"
                >
                <span>{{ limit }}</span>
              </label>
            </div>
          </fieldset>
        </div>

        <div v-if="!profile.enabled" class="offline-disabled-note">
          <BootstrapIcon icon="info-circle" decorative />
          <span>
            Offline reading is disabled. Existing downloads are retained until
            you clear offline data.
          </span>
        </div>
      </section>

      <div class="offline-settings-side">
        <section
          class="settings-panel offline-card offline-status-card"
          aria-live="polite"
        >
          <header class="offline-card-header">
            <div>
              <h4>Offline library status</h4>
              <p>Current offline content and storage usage.</p>
            </div>
          </header>

          <div class="offline-status-body">
            <template v-if="offlineReadingStore.progress">
              <div class="offline-progress">
                <progress
                  class="offline-progress-track"
                  :value="offlineReadingStore.progress.prepared"
                  :max="offlineReadingStore.progress.total"
                  aria-label="Offline preparation progress"
                ></progress>

                <p>
                  {{ offlineReadingStore.progress.prepared }}
                  of
                  {{ offlineReadingStore.progress.total }}
                  articles prepared
                </p>
              </div>
            </template>

            <div v-else-if="profile.activeGeneration" class="offline-ready-state">
              <div class="offline-ready-icon">
                <BootstrapIcon icon="check-circle-fill" decorative />
              </div>

              <div>
                <strong>Offline library ready</strong>
                <p>
                  {{ profile.preparedArticleCount }}
                  of
                  {{ profile.articleLimit }}
                  articles available offline
                </p>
              </div>
            </div>

            <div v-else class="offline-empty-state">
              <div class="offline-empty-icon">
                <BootstrapIcon icon="cloud-download" decorative />
              </div>

              <div>
                <strong>No articles downloaded yet.</strong>
                <p>
                  Enable offline reading or refresh the library to prepare
                  articles.
                </p>
              </div>
            </div>

            <dl class="offline-status-list">
              <div>
                <dt>
                  <BootstrapIcon icon="clock" decorative />
                  Last refreshed
                </dt>
                <dd>{{ lastRefresh }}</dd>
              </div>

              <div>
                <dt>
                  <BootstrapIcon icon="database" decorative />
                  Articles stored
                </dt>
                <dd>{{ profile.preparedArticleCount || 0 }}</dd>
              </div>
            </dl>

            <div class="offline-status-actions">
              <button
                class="app-button app-button--primary"
                type="button"
                :disabled="
                  !profile.enabled ||
                  preparing ||
                  saving ||
                  offlineReadingStore.readOnly
                "
                @click="offlineReadingStore.refreshSnapshot()"
              >
                <BootstrapIcon icon="arrow-clockwise" decorative />
                Refresh now
              </button>

              <button
                class="app-button app-button--outline-danger"
                type="button"
                :disabled="saving"
                @click="confirmClear = true"
              >
                <BootstrapIcon icon="trash" decorative />
                Clear offline data
              </button>
            </div>
          </div>
        </section>

        <section class="settings-panel offline-card offline-availability-card">
          <header class="offline-card-header">
            <div>
              <h4>What is available offline</h4>
              <p>The following content is stored locally on this device.</p>
            </div>
          </header>

          <div class="offline-capabilities">
            <ul class="offline-capability-list">
              <li v-for="item in available" :key="item" class="is-available">
                <BootstrapIcon icon="check-circle-fill" decorative />
                <span>{{ item }}</span>
              </li>
            </ul>

            <div class="offline-unavailable-label">
              Not available offline
            </div>

            <ul class="offline-capability-list">
              <li
                v-for="item in unavailable"
                :key="item"
                class="is-unavailable"
              >
                <BootstrapIcon icon="dash-circle-fill" decorative />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <aside class="settings-insight-card offline-info-card">
      <BootstrapIcon icon="info-circle-fill" decorative />

      <div>
        <strong>Offline articles are stored locally on this device.</strong>
        <p>
          Refresh the offline library while connected to download the latest
          articles.
        </p>
      </div>
    </aside>

    <ConfirmDialog
      v-if="confirmClear"
      title="Clear offline data?"
      confirm-label="Clear offline data"
      :busy="saving"
      @confirm="clear"
      @cancel="confirmClear = false"
      @close="confirmClear = false"
    >
      Remove this account's downloaded articles and offline reading
      configuration from this device?
    </ConfirmDialog>
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { useAuthStore } from '../../store/auth.js';
import { useOfflineReadingStore } from '../../store/offlineReading.js';
import { OFFLINE_ARTICLE_LIMITS } from '../../services/offlineReading.js';
import SettingsPageIntro from './SettingsPageIntro.vue';
import ConfirmDialog from '../dialogs/ConfirmDialog.vue';

export default {
  name: 'SettingsOfflineReading',
  components: { SettingsPageIntro, ConfirmDialog },
  data: () => ({
    saving: false, error: '', confirmClear: false, limits: OFFLINE_ARTICLE_LIMITS,
    available: ['Full article text', 'Basic article metadata', 'Existing tags included in article DTOs', 'Current read/saved state from the downloaded snapshot'],
    unavailable: ['External embeds', 'Video/audio streams', 'Live recommendations/ranking changes', 'Server-wide search/results', 'New read/saved changes made while offline']
  }),
  computed: {
    ...mapStores(useAuthStore, useOfflineReadingStore),
    profile() { return this.offlineReadingStore.profile || { enabled: false, articleLimit: 100 }; },
    preparing() { return this.offlineReadingStore.progress?.status === 'preparing'; },
    lastRefresh() { return this.profile.lastRefresh ? new Date(this.profile.lastRefresh).toLocaleString() : 'Never'; }
  },
  async mounted() {
    if (!this.offlineReadingStore.account) await this.offlineReadingStore.initialize(this.authStore.userId);
  },
  methods: {
    async configure(changes) {
      this.saving = true;
      this.error = '';
      try { await this.offlineReadingStore.updateConfiguration(changes); } catch (error) { this.error = error.message; } finally { this.saving = false; }
    },
    async clear() {
      this.saving = true;
      try { await this.offlineReadingStore.clearSnapshot(); this.confirmClear = false; } catch (error) { this.error = error.message; } finally { this.saving = false; }
    }
  }
};
</script>

<style scoped>
.offline-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.offline-settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr);
  gap: var(--space-5);
  align-items: start;
}

.offline-settings-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.offline-card {
  min-width: 0;
  padding: 0;
}

.offline-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--border-default);
}

.offline-card-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
}

.offline-card-header p {
  margin: var(--space-1) 0 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.45;
}

.offline-setting-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5);
  margin: 0;
  border: 0;
}

.offline-setting-divider {
  padding-top: var(--space-5);
  border-top: 1px solid var(--border-default);
}

.offline-setting-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 2.5rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-control);
  color: var(--settings-info-text);
  background: var(--color-primary-soft);
  font-size: 1rem;
}

.offline-setting-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.offline-setting-content strong {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.35;
}

.offline-setting-content small {
  display: block;
  margin-top: var(--space-1);
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.45;
}

.offline-switch {
  position: relative;
  flex: 0 0 auto;
  width: 2.65rem;
  height: 1.5rem;
}

.offline-switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.offline-switch > span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--preferences-switch-track);
  transition:
    background 0.15s ease,
    opacity 0.15s ease;
  pointer-events: none;
}

.offline-switch > span::after {
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: var(--radius-pill);
  background: var(--text-inverted);
  box-shadow: var(--shadow-briefing-preferences-switch-thumb);
  content: '';
  transition: transform 0.15s ease;
}

.offline-switch input:checked + span {
  background: var(--color-primary);
}

.offline-switch input:checked + span::after {
  transform: translateX(1.15rem);
}

.offline-switch input:focus-visible + span {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.offline-switch input:disabled + span {
  opacity: 0.5;
}

.offline-limit-setting {
  padding-top: 0;
  display: block;
  min-width: 0;
}

.offline-setting-heading {
  float: none;
  width: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.offline-limit-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-2);
  margin-left: calc(2.5rem + var(--space-3));
  margin-top: var(--space-3);
}

.offline-limit-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  background: var(--surface-card);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.offline-limit-option:hover {
  border-color: var(--color-primary);
  background: var(--surface-hover);
}

.offline-limit-option input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.offline-limit-option.is-selected {
  border-color: var(--color-primary);
  color: var(--settings-info-text);
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.offline-disabled-note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0 var(--space-5) var(--space-5);
  padding: var(--space-3);
  border-radius: var(--radius-control);
  color: var(--text-secondary);
  background: var(--surface-page);
  font-size: 0.82rem;
  line-height: 1.45;
}

.offline-disabled-note svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: var(--text-muted);
}

.offline-status-body {
  padding: var(--space-5);
}

.offline-progress {
  margin-bottom: var(--space-5);
}

.offline-progress-track {
  display: block;
  appearance: none;
  border: 0;
  color: var(--color-primary);
  overflow: hidden;
  width: 100%;
  height: 0.6rem;
  border-radius: var(--radius-pill);
  background: var(--surface-page);
}

.offline-progress-track::-webkit-progress-bar { border-radius: inherit; background: var(--surface-page); }
.offline-progress-track::-webkit-progress-value { border-radius: inherit; background: var(--color-primary); }
.offline-progress-track::-moz-progress-bar { border-radius: inherit; background: var(--color-primary); }

.offline-progress p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.offline-ready-state,
.offline-empty-state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  margin-bottom: var(--space-3);
  border-radius: var(--radius-control);
  background: var(--surface-page);
}

.offline-ready-icon,
.offline-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 2.4rem;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: var(--radius-control);
  background: var(--surface-card);
}

.offline-ready-icon {
  color: var(--color-success);
}

.offline-empty-icon {
  color: var(--color-primary);
}

.offline-ready-state strong,
.offline-empty-state strong {
  display: block;
  color: var(--text-primary);
  font-size: 0.875rem;
}

.offline-ready-state p,
.offline-empty-state p {
  margin: var(--space-1) 0 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.4;
}

.offline-status-list {
  margin: 0;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
}

.offline-status-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 2rem;
  flex-wrap: wrap;
}

.offline-status-list dt {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 400;
}

.offline-status-list dt svg {
  color: var(--text-muted);
}

.offline-status-list dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.82rem;
  font-weight: 600;
  text-align: right;
  margin-left: auto;
}

.offline-status-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.offline-status-actions .app-button {
  justify-content: center;
  gap: var(--space-2);
  white-space: normal;
}

.offline-capabilities {
  padding: var(--space-5);
}

.offline-capability-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.offline-capability-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: 0.84rem;
  line-height: 1.4;
}

.offline-capability-list li svg {
  flex: 0 0 auto;
  margin-top: 0.12rem;
}

.offline-capability-list .is-available svg {
  color: var(--color-success);
}

.offline-capability-list .is-unavailable svg {
  color: var(--text-muted);
}

.offline-unavailable-label {
  margin: var(--space-5) 0 var(--space-2);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 600;
}

.offline-info-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.offline-info-card > svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
}

.offline-info-card strong {
  display: block;
  margin-bottom: var(--space-1);
}

.offline-info-card p {
  margin: 0;
  color: var(--text-secondary);
}

.offline-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--settings-danger-text);
  border-radius: var(--radius-control);
  color: var(--settings-danger-text);
  background: var(--settings-danger-bg);
}

@media (max-width: 879px) {
  .offline-settings-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 639px) {
  .offline-card-header,
  .offline-setting-row,
  .offline-status-body,
  .offline-capabilities {
    padding-inline: var(--space-3);
  }

  .offline-limit-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-left: 0;
  }

  .offline-status-actions {
    grid-template-columns: 1fr;
  }

  .offline-setting-row {
    align-items: flex-start;
  }
}

.offline-settings :deep(.settings-insight-card) { margin-bottom: 0; }
.offline-card-header > div, .offline-ready-state > div:last-child, .offline-empty-state > div:last-child,
.offline-info-card > div, .offline-capability-list span, .offline-disabled-note span, .offline-error span { min-width: 0; overflow-wrap: anywhere; }
.offline-setting-content { overflow-wrap: anywhere; }
.offline-limit-option:has(input:focus-visible) { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
.offline-limit-option:has(input:disabled) { opacity: 0.5; cursor: default; }
.offline-limit-option input:disabled, .offline-switch input:disabled { cursor: default; }
.offline-info-card > svg { color: var(--settings-info-text); }
.offline-info-card.settings-insight-card { background: var(--settings-info-bg); border-color: var(--settings-info-border); }
:global(:root[data-theme='dark'] .settings-surface .offline-info-card.settings-insight-card) {
  background: var(--settings-info-bg);
  border-color: var(--settings-info-border);
}
@media (prefers-reduced-motion: reduce) {
  .offline-switch > span, .offline-switch > span::after, .offline-limit-option { transition: none; }
}
</style>
