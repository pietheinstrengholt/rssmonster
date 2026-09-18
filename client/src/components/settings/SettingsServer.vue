<template>
  <div class="settings-page">
    <SettingsPageIntro eyebrow="Settings — Server" icon="gear-fill" title="Server settings" title-id="server-settings-title">
      Configure settings that apply to everyone on this server.
    </SettingsPageIntro>
    <div class="server-settings-content">
      <p v-if="loading" class="app-notice app-notice--info" role="status">Loading server settings…</p>
      <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
      <p v-if="message" class="app-notice app-notice--success" role="status">{{ message }}</p>
      <button v-if="!configuration && !loading" type="button" class="app-button app-button--outline-secondary server-settings-retry" @click="load">Retry</button>

      <form v-if="configuration" class="settings-data-panel server-settings-form" aria-labelledby="server-access-title" :aria-busy="saving" @submit.prevent="save">
        <header class="server-settings-heading">
          <div>
            <h4 id="server-access-title">Account access</h4>
            <p class="server-settings-muted">Choose whether visitors can create an account.</p>
          </div>
          <p class="server-settings-status">Current registration: <strong class="app-status-badge app-status-badge--neutral">{{ configuration.localAuthEnabled && configuration.allowRegistration.effectiveValue ? 'Allowed' : 'Disabled' }}</strong></p>
        </header>

        <div class="server-settings-body">
          <div class="server-settings-row">
            <div class="server-settings-description">
              <label for="server-registration">Public registration</label>
              <p class="server-settings-muted">Control new account signups across this server. Existing accounts can still sign in.</p>
            </div>
            <div class="server-settings-field">
              <select id="server-registration" v-model="registration" class="app-form-select settings-control" :disabled="saving" aria-describedby="server-registration-help">
                <option value="environment">Use environment default ({{ configuration.allowRegistration.environmentValue ? 'allowed' : 'disabled' }})</option>
                <option value="allow">Allow registration</option>
                <option value="disable">Disable registration</option>
              </select>
              <p id="server-registration-help" class="server-settings-muted">A saved choice overrides <code>ALLOW_REGISTRATION</code> immediately. Choose the environment default to remove the override.</p>
            </div>
          </div>
          <p v-if="!configuration.localAuthEnabled" class="app-notice app-notice--warning">Local authentication is disabled by the server environment, so local registration remains unavailable.</p>
        </div>

        <footer class="server-settings-footer">
          <p class="server-settings-muted">Changes apply to everyone on this server.</p>
          <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import SettingsPageIntro from './SettingsPageIntro.vue';
import { fetchServerSettings, saveServerSettings } from '../../api/settings';

const configuration = ref(null);
const registration = ref('environment');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');

const apply = data => {
  configuration.value = data;
  registration.value = data.allowRegistration.override === null ? 'environment'
    : data.allowRegistration.override ? 'allow' : 'disable';
};
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    apply((await fetchServerSettings()).data);
  } catch {
    error.value = 'Server settings could not be loaded. Administrator access is required.';
  } finally {
    loading.value = false;
  }
};
const save = async () => {
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    apply((await saveServerSettings({
      allowRegistration: registration.value === 'environment' ? null : registration.value === 'allow'
    })).data);
    message.value = 'Server settings saved.';
  } catch {
    error.value = 'Server settings could not be saved. Please try again.';
  } finally {
    saving.value = false;
  }
};
onMounted(load);
</script>

<style scoped>
.server-settings-content {
  display: grid;
  gap: var(--space-3);
}
.server-settings-content p {
  margin: 0;
}
.server-settings-content .app-notice--success {
  color: var(--settings-success-text);
  background-color: var(--settings-success-bg);
  border-color: var(--border-success);
}
.server-settings-retry {
  justify-self: start;
}
.server-settings-form {
  min-width: 0;
}
.server-settings-heading,
.server-settings-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5);
}
.server-settings-heading {
  border-bottom: 1px solid var(--border-default);
}
.server-settings-heading h4 {
  margin: 0 0 var(--space-1);
  font-size: 1rem;
  font-weight: 600;
}
.server-settings-muted {
  color: var(--text-secondary);
  font-size: var(--font-size-ui-default);
  line-height: 1.6;
}
.server-settings-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-ui-default);
}
.server-settings-body {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
}
.server-settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-5);
}
.server-settings-description,
.server-settings-field {
  display: grid;
  gap: var(--space-2);
  flex: 1 1 16rem;
  min-width: 0;
}
.server-settings-description label {
  font-weight: 600;
}
.server-settings-field select {
  width: 100%;
  min-width: 0;
}
.server-settings-field code {
  overflow-wrap: anywhere;
}
.server-settings-footer {
  border-top: 1px solid var(--border-default);
}
.server-settings-footer button {
  margin-left: auto;
}
</style>
