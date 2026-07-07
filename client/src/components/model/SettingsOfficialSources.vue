<template>
  <div class="official-sources-settings">
    <section class="settings-insight-card official-sources-header" aria-labelledby="official-sources-title">
      <span class="settings-insight-icon" aria-hidden="true">
        <BootstrapIcon icon="patch-check-fill" />
      </span>
      <div>
        <p class="settings-page-eyebrow">Settings — Official Sources</p>
        <h3 id="official-sources-title">Official source domains</h3>
        <p>
          Articles from matching domains are marked as official during crawl and tagged with the organization name.
        </p>
      </div>
    </section>

    <section class="official-sources-list" aria-labelledby="official-sources-list-title">
      <header class="official-sources-list-heading">
        <div>
          <h3 id="official-sources-list-title">Sources</h3>
          <p>{{ sources.length }} configured domains</p>
        </div>
        <button type="button" class="official-sources-add-button" @click="addSource">
          <BootstrapIcon icon="plus-circle-fill" aria-hidden="true" />
          Add Source
        </button>
      </header>

      <div v-if="loading" class="official-sources-state">Loading official sources…</div>
      <div v-else-if="error" class="official-sources-message official-sources-message--error">{{ error }}</div>
      <div v-else-if="sources.length" class="official-sources-table-wrap">
        <table class="official-sources-table">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Domain</th>
              <th>Enabled</th>
              <th class="official-sources-action-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(source, index) in sources" :key="source.localId">
              <td>
                <input
                  :id="`official-source-entity-${index}`"
                  v-model="source.entity"
                  type="text"
                  class="form-control"
                  placeholder="Nintendo"
                />
              </td>
              <td>
                <input
                  v-model="source.domain"
                  type="text"
                  class="form-control"
                  placeholder="nintendo.com"
                />
              </td>
              <td>
                <label class="official-sources-toggle">
                  <input v-model="source.enabled" type="checkbox" />
                  <span>{{ source.enabled ? 'On' : 'Off' }}</span>
                </label>
              </td>
              <td class="official-sources-action-column">
                <button
                  type="button"
                  class="official-sources-delete-button"
                  :aria-label="`Remove ${source.entity || source.domain || 'source'}`"
                  @click="removeSource(index)"
                >
                  <BootstrapIcon icon="trash-fill" aria-hidden="true" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="official-sources-state">
        No official sources yet. Add an organization and domain to start marking crawled articles.
      </p>
    </section>

    <div v-if="message" class="official-sources-message official-sources-message--success">{{ message }}</div>

    <div class="official-sources-save-area">
      <button type="button" class="official-sources-save-button" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save Changes' }}
      </button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>
<style scoped>
.official-sources-settings {
  max-width: 1100px;
  color: var(--text-primary);
}

.official-sources-header,
.official-sources-list {
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

.official-sources-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 24px;
  background: var(--settings-info-bg);
  border-color: var(--settings-info-border);
}

.official-sources-header h3,
.official-sources-list-heading h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}

.official-sources-header p:not(.settings-page-eyebrow),
.official-sources-list-heading p,
.official-sources-state {
  color: var(--text-muted);
}

.official-sources-header p:not(.settings-page-eyebrow) {
  max-width: 720px;
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
}

.official-sources-list {
  margin-top: 20px;
  overflow: hidden;
}

.official-sources-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--border-subtle);
}

.official-sources-list-heading p {
  margin: 5px 0 0;
  font-size: 13px;
}

.official-sources-add-button,
.official-sources-save-button,
.official-sources-delete-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
}

.official-sources-add-button {
  height: 38px;
  gap: 8px;
  padding: 0 13px;
  background: var(--official-sources-add-bg, var(--settings-orange-text));
  border: 1px solid var(--official-sources-add-bg, var(--settings-orange-text));
  color: var(--text-inverted);
  font-size: 14px;
}

.official-sources-table-wrap {
  overflow-x: auto;
}

.official-sources-table {
  width: 100%;
  border-collapse: collapse;
}

.official-sources-table th,
.official-sources-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  vertical-align: middle;
}

.official-sources-table th {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.official-sources-table .form-control {
  min-width: 180px;
  height: 36px;
}

.official-sources-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.official-sources-delete-button {
  width: 34px;
  height: 34px;
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

.official-sources-action-column {
  width: 84px;
  text-align: right;
}

.official-sources-state {
  margin: 0;
  padding: 32px 22px;
  text-align: center;
}

.official-sources-message {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
}

.official-sources-message--success {
  background: var(--settings-success-bg);
  color: var(--settings-success-text);
}

.official-sources-message--error {
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

.official-sources-save-area {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.official-sources-save-button {
  height: 42px;
  padding: 0 16px;
  background: var(--color-primary);
  color: var(--text-inverted);
  font-size: 14px;
}

.official-sources-save-button:disabled {
  cursor: not-allowed;
  opacity: 0.90;
}

:global(:root[data-theme='dark']) .official-sources-header,
:global(:root[data-theme='dark']) .official-sources-list {
  background: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .official-sources-list-heading,
:global(:root[data-theme='dark']) .official-sources-table th,
:global(:root[data-theme='dark']) .official-sources-table td {
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .official-sources-add-button {
  --official-sources-add-bg: var(--color-primary);
  color: var(--text-inverted);
}

:global(:root[data-theme='dark']) .official-sources-add-button:hover {
  --official-sources-add-bg: var(--color-primary-hover);
}

@media (max-width: 766px) {
  .official-sources-header,
  .official-sources-list-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .official-sources-add-button {
    width: 100%;
  }
}
</style>

<script>
import { fetchOfficialSources, saveOfficialSources } from '../../api/settings';
import { setAuthToken } from '../../api/client';

export default {
  name: 'SettingsOfficialSources',
  emits: ['saved'],
  data() {
    return {
      sources: [],
      loading: false,
      saving: false,
      error: '',
      message: '',
      nextLocalId: 1
    };
  },
  async created() {
    setAuthToken(this.$store.auth.token);
    await this.loadOfficialSources();
  },
  methods: {
    // This function creates a stable local row object for editing.
    toEditableSource(source = {}) {
      const localId = this.nextLocalId;
      this.nextLocalId += 1;

      return {
        localId,
        entity: source.entity || '',
        domain: source.domain || '',
        enabled: source.enabled !== false
      };
    },

    // This function retrieves the current official source rows.
    async loadOfficialSources() {
      this.loading = true;
      this.error = '';

      try {
        const response = await fetchOfficialSources();
        const officialSources = Array.isArray(response.data?.officialSources)
          ? response.data.officialSources
          : [];

        this.sources = officialSources.map(source => this.toEditableSource(source));
      } catch (err) {
        console.error('Failed to fetch official sources:', err);
        this.error = 'Failed to load official sources.';
      } finally {
        this.loading = false;
      }
    },

    addSource() {
      this.sources.push(this.toEditableSource({ enabled: true }));
      this.$nextTick(() => {
        const index = this.sources.length - 1;
        this.$el.querySelector(`#official-source-entity-${index}`)?.focus();
      });
    },

    removeSource(index) {
      this.sources.splice(index, 1);
    },

    // This function keeps only complete rows before overwriting the server list.
    buildPayload() {
      return this.sources
        .map(source => ({
          entity: String(source.entity || '').trim(),
          domain: String(source.domain || '').trim(),
          enabled: source.enabled !== false
        }))
        .filter(source => source.entity || source.domain);
    },

    async save() {
      this.saving = true;
      this.error = '';
      this.message = '';

      try {
        const response = await saveOfficialSources(this.buildPayload());
        const officialSources = Array.isArray(response.data?.officialSources)
          ? response.data.officialSources
          : [];

        this.sources = officialSources.map(source => this.toEditableSource(source));
        this.message = 'Official sources saved.';
        this.$emit('saved');
      } catch (err) {
        console.error('Failed to save official sources:', err);
        this.error = err.response?.data?.error || 'Failed to save official sources.';
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>
