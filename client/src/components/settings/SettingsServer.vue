<template>
  <div class="settings-page">
    <SettingsPageIntro eyebrow="Settings — Server" icon="gear-fill" title="Server settings" title-id="server-settings-title">
      Configure settings that apply to everyone on this server.
    </SettingsPageIntro>
    <div class="server-settings-tabs" role="tablist" aria-label="Server settings sections" @keydown="navigateTabs">
      <button id="server-account-tab" type="button" role="tab" aria-controls="server-account-panel" :aria-selected="activeTab === 'account'" :tabindex="activeTab === 'account' ? 0 : -1" class="server-settings-tab" @click="activeTab = 'account'">Account options</button>
      <button id="server-smtp-tab" type="button" role="tab" aria-controls="server-smtp-panel" :aria-selected="activeTab === 'smtp'" :tabindex="activeTab === 'smtp' ? 0 : -1" class="server-settings-tab" @click="activeTab = 'smtp'">SMTP options</button>
      <button id="server-oidc-tab" type="button" role="tab" aria-controls="server-oidc-panel" :aria-selected="activeTab === 'oidc'" :tabindex="activeTab === 'oidc' ? 0 : -1" class="server-settings-tab" @click="activeTab = 'oidc'">OIDC options</button>
      <button id="server-push-tab" type="button" role="tab" aria-controls="server-push-panel" :aria-selected="activeTab === 'push'" :tabindex="activeTab === 'push' ? 0 : -1" class="server-settings-tab" @click="activeTab = 'push'">Web Push options</button>
      <button id="server-crawl-tab" type="button" role="tab" aria-controls="server-crawl-panel" :aria-selected="activeTab === 'crawl'" :tabindex="activeTab === 'crawl' ? 0 : -1" class="server-settings-tab" @click="activeTab = 'crawl'">Crawl options</button>
    </div>
    <div class="server-settings-content">
      <section v-show="activeTab === 'account'" id="server-account-panel" role="tabpanel" aria-labelledby="server-account-tab" class="server-settings-content">
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
            <p v-if="!configuration.localAuthEnabled" class="app-notice app-notice--warning">Local authentication is disabled by the server configuration, so local registration remains unavailable.</p>
          </div>

          <footer class="server-settings-footer">
            <p class="server-settings-muted">Changes apply to everyone on this server.</p>
            <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
          </footer>
        </form>
      </section>
      <SettingsOidc v-if="activeTab === 'oidc' || oidcVisited" v-show="activeTab === 'oidc'" id="server-oidc-panel" role="tabpanel" aria-labelledby="server-oidc-tab" @saved="load" />
      <SettingsCrawl v-if="activeTab === 'crawl' || crawlVisited" v-show="activeTab === 'crawl'" id="server-crawl-panel" role="tabpanel" aria-labelledby="server-crawl-tab" />
      <SettingsPush v-if="activeTab === 'push' || pushVisited" v-show="activeTab === 'push'" id="server-push-panel" role="tabpanel" aria-labelledby="server-push-tab" />
      <SettingsSmtp v-show="activeTab === 'smtp'" id="server-smtp-panel" role="tabpanel" aria-labelledby="server-smtp-tab" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import SettingsPageIntro from './SettingsPageIntro.vue';
import { fetchServerSettings, saveServerSettings } from '../../api/settings';
import SettingsOidc from './SettingsOidc.vue';
import SettingsCrawl from './SettingsCrawl.vue';
import SettingsPush from './SettingsPush.vue';
import SettingsSmtp from './SettingsSmtp.vue';

const activeTab = ref('account');
const oidcVisited = ref(false);
const pushVisited = ref(false);
const crawlVisited = ref(false);
watch(activeTab, tab => { if (tab === 'crawl') crawlVisited.value = true; });
watch(activeTab, tab => { if (tab === 'push') pushVisited.value = true; });
watch(activeTab, tab => { if (tab === 'oidc') oidcVisited.value = true; });
const tabs = ['account', 'smtp', 'oidc', 'push', 'crawl'];
const navigateTabs = event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  activeTab.value = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
    : tabs[(tabs.indexOf(activeTab.value) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  event.currentTarget.querySelector(`#server-${activeTab.value}-tab`).focus();
};

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
.server-settings-tabs {
  display: flex;
  overflow-x: auto;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--border-default);
}
.server-settings-tab {
  flex-shrink: 0;
  min-height: var(--control-height-default);
  padding: var(--space-3);
  border: 0;
  border-bottom: 2px solid var(--color-transparent);
  background: var(--color-transparent);
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.server-settings-tab:hover {
  color: var(--text-primary);
  background: var(--surface-control);
}
.server-settings-tab[aria-selected='true'] {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
.server-settings-tab:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-control);
}
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
