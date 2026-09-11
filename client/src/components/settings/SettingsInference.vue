<template>
  <div class="settings-page inference-settings">
    <SettingsPageIntro eyebrow="Settings — AI / Inference" icon="cpu-fill" title="Inference service" title-id="inference-title">
      Connect RSSMonster to an inference service to use supported intelligent features.
      <a href="https://pietheinstrengholt.github.io/rssmonster/inference.html" target="_blank" rel="noopener noreferrer">Inference documentation</a>
    </SettingsPageIntro>

    <div class="app-notice inference-notice" :class="error || ['unauthorized', 'unreachable', 'incompatible', 'invalid_contract', 'configuration_error'].includes(status?.state)
      ? 'app-notice--danger'
      : loading || checking ? 'app-notice--info'
        : configuration?.configurationSource === 'none' ? 'app-notice--warning'
          : configuration?.configurable && status?.ready ? 'app-notice--success' : 'app-notice--info'" :role="error ? 'alert' : 'status'" aria-live="polite">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">Loading inference settings…</template>
      <template v-else>
        <span v-if="configuration && !configuration.configurable">Inference is configured by the deployment. </span>
        {{ checking ? 'Checking the inference service…' : statusMessage }}
      </template>
    </div>
    <button v-if="!configuration && !loading" type="button" class="app-button app-button--outline-secondary" @click="load">Retry</button>

    <template v-if="configuration">
      <form v-if="configuration.configurable" class="settings-data-panel inference-card" aria-labelledby="inference-configuration-title" @submit.prevent="save">
        <header>
          <h4 id="inference-configuration-title">Configuration</h4>
          <p class="inference-muted">Set the endpoint and optional authentication details for your inference service.</p>
        </header>
        <div class="inference-fields">
          <div class="inference-field">
            <label for="inference-endpoint">Endpoint</label>
            <input class="app-form-control settings-control" id="inference-endpoint" v-model="baseUrl" type="url" required placeholder="https://inference.example.internal" :disabled="busy" aria-describedby="inference-endpoint-help">
            <small id="inference-endpoint-help" class="inference-muted">Base URL of your inference service.</small>
          </div>
          <div class="inference-field">
            <label for="inference-key-action">API key</label>
            <select class="app-form-select settings-control" id="inference-key-action" v-model="apiKeyAction" :disabled="busy" aria-describedby="inference-key-help" @change="apiKey = ''">
              <option value="keep">Keep current key</option>
              <option value="replace">Replace key</option>
              <option value="remove">Remove key</option>
            </select>
            <small id="inference-key-help" class="inference-muted">{{ configuration.apiKeyConfigured ? 'An API key is stored securely.' : 'No API key is stored.' }}</small>
            <div v-if="apiKeyAction === 'replace'" class="inference-field inference-key-replacement">
              <label for="inference-api-key">New API key</label>
              <input class="app-form-control settings-control" id="inference-api-key" v-model="apiKey" type="password" autocomplete="new-password" :disabled="busy" aria-describedby="inference-new-key-help">
              <small id="inference-new-key-help" class="inference-muted">Leave blank if the service does not require an API key.</small>
            </div>
          </div>
        </div>
        <footer class="inference-actions inference-form-actions">
          <button type="submit" class="app-button app-button--primary" :disabled="busy || !baseUrl">{{ saving ? 'Saving…' : 'Save' }}</button>
          <button type="button" class="app-button app-button--outline-secondary" :disabled="busy || !baseUrl.trim()" @click="check(true)">{{ checking ? 'Checking…' : 'Test connection' }}</button>
          <button v-if="configuration.configurationSource === 'database'" type="button" class="app-button app-button--outline-danger inference-remove" :disabled="busy" @click="confirmRemove = true">Remove connection</button>
        </footer>
        <small class="inference-muted">Test connection checks this form without saving. Refresh checks the saved connection.</small>
        <div v-if="confirmRemove" class="app-notice app-notice--warning inference-confirmation">
          <p>Remove the saved connection and API key? Existing articles and semantic data will remain.</p>
          <div class="inference-actions">
            <button type="button" class="app-button app-button--danger" :disabled="busy" @click="remove">Confirm removal</button>
            <button type="button" class="app-button app-button--outline-secondary" :disabled="busy" @click="confirmRemove = false">Cancel</button>
          </div>
        </div>
      </form>

      <section class="settings-data-panel inference-card" aria-labelledby="inference-capabilities-title" :aria-busy="checking">
        <header class="inference-card-heading">
          <div>
            <h4 id="inference-capabilities-title">Capabilities</h4>
            <p class="inference-muted">Detected features provided by the inference service.</p>
          </div>
          <button type="button" class="app-button app-button--outline-secondary" :disabled="busy || configuration.configurationSource === 'none'" @click="check">
            {{ checking ? 'Checking…' : 'Refresh' }}
          </button>
        </header>
        <div class="inference-capabilities">
          <article v-for="name in capabilityNames" :key="name" class="settings-panel inference-capability">
            <h5>{{ name.charAt(0).toUpperCase() + name.slice(1) }}</h5>
            <span class="app-status-badge" :class="status?.ready && status?.capabilities?.[name]?.available ? 'app-status-badge--success' : 'app-status-badge--neutral'">
              <span aria-hidden="true">{{ status?.ready && status?.capabilities?.[name]?.available ? '●' : '○' }}</span>
              {{ status?.ready && status?.capabilities?.[name]?.available ? 'Available' : 'Unavailable' }}
            </span>
            <template v-if="status?.capabilities?.[name]?.configured">
              <p class="inference-model">{{ status.capabilities[name].model }}</p>
              <p class="inference-muted">{{ status.capabilities[name].provider }}</p>
              <p v-if="name === 'embeddings'" class="inference-muted">{{ status.capabilities[name].dimensions }} dimensions</p>
            </template>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import SettingsPageIntro from './SettingsPageIntro.vue';
import { fetchInferenceSettings, saveInferenceSettings, clearInferenceSettings, testInferenceSettings } from '../../api/settings';

const messages = {
  not_configured: 'No inference service configured.', disabled: 'Inference is disabled by the deployment.',
  ready: 'Connected and ready.', partial: 'Connected and ready. Some capabilities are unavailable.',
  not_ready: 'Connected, but the inference service is not ready yet.',
  unauthorized: 'Inference authentication failed. Check the configured API key.',
  unreachable: 'Could not reach the inference service.',
  incompatible: 'The inference service uses an unsupported or malformed API contract.',
  invalid_contract: 'The inference service did not return a valid capability contract.',
  configuration_error: 'Stored inference credentials could not be read. Replace or remove the saved key.'
};
export default {
  components: { SettingsPageIntro },
  emits: ['forceReload'],
  data: () => ({ configuration: null, status: null, baseUrl: '', apiKeyAction: 'keep', apiKey: '',
    loading: true, saving: false, checking: false, error: '', confirmRemove: false,
    capabilityNames: ['embeddings', 'generation', 'classification', 'assistant'] }),
  computed: {
    busy() { return this.loading || this.saving || this.checking; },
    statusMessage() { return messages[this.status?.state] || 'Connection status is unavailable.'; }
  },
  mounted() { this.load(); },
  beforeUnmount() { this.apiKey = ''; },
  methods: {
    applyConfiguration(data) {
      this.configuration = data; this.baseUrl = data.baseUrl || '';
      this.apiKey = ''; this.apiKeyAction = 'keep'; this.confirmRemove = false;
    },
    async load() {
      this.loading = true; this.error = '';
      try { const { data } = await fetchInferenceSettings(); this.applyConfiguration(data); this.status = data.status; } catch { this.error = 'Could not load inference settings.'; } finally { this.loading = false; }
    },
    async save() {
      this.saving = true; this.error = '';
      const input = { baseUrl: this.baseUrl, apiKeyAction: this.apiKeyAction,
        ...(this.apiKeyAction === 'replace' ? { apiKey: this.apiKey } : {}) };
      try {
        const { data } = await saveInferenceSettings(input); this.applyConfiguration(data); this.status = null;
        await this.check(); this.$emit('forceReload');
      } catch { this.error = 'Could not save inference settings. Check the endpoint and deployment configuration.'; } finally { this.apiKey = ''; this.saving = false; }
    },
    async remove() {
      this.saving = true; this.error = '';
      try {
        const { data } = await clearInferenceSettings(); this.applyConfiguration(data);
        this.status = { state: 'not_configured', capabilities: null }; this.$emit('forceReload');
      } catch { this.error = 'Could not remove the inference connection.'; } finally { this.saving = false; }
    },
    async check(draft = false) {
      const input = draft === true ? { baseUrl: this.baseUrl, apiKeyAction: this.apiKeyAction,
        ...(this.apiKeyAction === 'replace' ? { apiKey: this.apiKey } : {}) } : undefined;
      this.checking = true; this.error = ''; this.status = null;
      try { this.status = (await testInferenceSettings(input)).data; } catch { this.error = 'Could not check the inference connection.'; } finally { this.checking = false; }
    }
  }
};
</script>

<style scoped>
.inference-settings { display: grid; gap: 1rem; }
.inference-settings p, .inference-settings h4, .inference-settings h5 { margin: 0; }
.inference-notice { margin: 0; overflow-wrap: anywhere; }
.inference-card { display: grid; gap: 1rem; padding: 1rem; min-width: 0; }
.inference-card h4 { font-size: 1rem; font-weight: 700; }
.inference-card header p { margin-top: .375rem; }
.inference-muted { color: var(--text-muted); font-size: .8125rem; line-height: 1.5; }
.inference-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
.inference-field { display: flex; flex-direction: column; align-items: stretch; gap: .5rem; min-width: 0; }
.inference-field label { font-size: .875rem; font-weight: 600; }
.inference-field input, .inference-field select { width: 100%; min-width: 0; }
.inference-key-replacement { margin-top: .25rem; }
.inference-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .625rem; }
.inference-form-actions { padding-top: 1rem; border-top: 1px solid var(--border-default); }
.inference-remove { margin-left: auto; border-color: transparent; }
.inference-confirmation { display: grid; gap: .75rem; margin: 0; }
.inference-card-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem; }
.inference-card-heading button { flex-shrink: 0; }
.inference-capabilities { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; }
.inference-capability { display: flex; flex-direction: column; align-items: flex-start; gap: .5rem; padding: .875rem; min-width: 0; overflow-wrap: anywhere; }
.inference-capability h5 { font-size: .875rem; font-weight: 700; }
.inference-capability .app-status-badge { white-space: normal; }
.inference-model { font-size: .875rem; line-height: 1.5; }
@media (max-width: 879px) {
  .inference-capabilities { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .inference-fields, .inference-capabilities { grid-template-columns: minmax(0, 1fr); }
  .inference-remove { margin-left: 0; }
  .inference-card-heading { flex-wrap: wrap; }
}
</style>
