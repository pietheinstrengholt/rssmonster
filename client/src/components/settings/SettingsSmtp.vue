<template>
  <section class="smtp-settings settings-data-panel" aria-labelledby="smtp-settings-title" :aria-busy="loading || busy">
    <header class="smtp-settings-heading">
      <div class="smtp-settings-heading__main">
        <span class="settings-insight-icon smtp-settings-heading__icon" aria-hidden="true"><BootstrapIcon icon="envelope-fill" context="control" /></span>
        <div>
          <h4 id="smtp-settings-title">Email delivery</h4>
          <p>Configure outbound email and test the saved SMTP connection.</p>
        </div>
      </div>
      <button v-if="configuration?.enabled" type="button" class="app-button app-button--secondary settings-control" :disabled="busy || !configuration.configured" @click="testConnection">
        {{ testing ? 'Testing SMTP...' : 'Test SMTP connection' }}
      </button>
    </header>
    <div class="smtp-settings-body">
      <p v-if="loading" role="status">Loading email configuration…</p>
      <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
      <p v-if="message" class="app-notice smtp-settings-success" role="status">{{ message }}</p>
      <button v-if="!configuration && !loading" type="button" class="app-button app-button--outline-secondary" @click="load">Retry email configuration</button>
      <template v-if="configuration">
        <section class="smtp-settings-summary" aria-label="Email delivery status">
          <div class="smtp-settings-statuses">
            <div class="smtp-settings-status">
              <div class="smtp-settings-status__line">
                <span>Configuration:</span>
                <strong class="app-status-badge" :class="configuration.configured ? 'app-status-badge--success' : 'app-status-badge--neutral'">
                  <BootstrapIcon :icon="configuration.configured ? 'check-circle-fill' : 'exclamation-circle-fill'" context="control" aria-hidden="true" />
                  {{ configuration.configured ? 'Configured' : 'Incomplete' }}
                </strong>
              </div>
              <p>{{ configuration.configured ? 'All required settings are configured.' : 'Required email settings are missing or invalid.' }}</p>
            </div>
            <div class="smtp-settings-status">
              <div class="smtp-settings-status__line">
                <span>Service:</span>
                <strong class="app-status-badge" :class="configuration.enabled ? 'app-status-badge--success' : 'app-status-badge--neutral'">
                  <BootstrapIcon :icon="configuration.enabled ? 'check-circle-fill' : 'pause-circle'" context="control" aria-hidden="true" />
                  {{ configuration.enabled ? 'Enabled' : 'Disabled' }}
                </strong>
              </div>
              <p>{{ configuration.enabled ? 'Email delivery is currently enabled.' : 'Email delivery is currently disabled.' }}</p>
            </div>
          </div>
          <p class="app-notice app-notice--info smtp-settings-info">Email delivery follows the server environment unless overridden below. The override replaces all SMTP settings, including credentials; environment password files are ignored. Delivery workers pick up changes on their next poll, within five minutes.</p>
        </section>
        <form @submit.prevent="save">
          <section class="smtp-settings-config" aria-labelledby="smtp-configuration-title">
            <header class="smtp-settings-config__header">
              <h5 id="smtp-configuration-title">SMTP configuration</h5>
              <p>Set the SMTP details used to send emails from RSSMonster.</p>
            </header>
            <fieldset :disabled="busy" class="smtp-settings-fields" aria-labelledby="smtp-configuration-title">
              <div v-for="field in fields" :key="field.key" class="smtp-settings-field smtp-settings-row">
                <div class="smtp-settings-row__meta">
                  <span class="smtp-settings-row__icon" aria-hidden="true"><BootstrapIcon :icon="field.type === 'boolean' ? 'check-circle-fill' : 'gear-fill'" context="control" /></span>
                  <div>
                    <label :for="`smtp-${field.key}`" class="smtp-settings-row__title">{{ field.label }} <code>{{ field.key }}</code></label>
                    <p :id="`smtp-help-${field.key}`">{{ field.help }}</p>
                  </div>
                </div>
                <div class="smtp-settings-row__control">
                  <label v-if="field.key === 'EMAIL_ENABLED'" class="smtp-settings-default">
                    <input v-model="draft[field.key].overridden" type="checkbox">
                    Override environment default
                  </label>
                  <select v-if="field.type === 'boolean'" :id="`smtp-${field.key}`" v-model="draft[field.key].value" class="app-form-select settings-control" :disabled="!draft.EMAIL_ENABLED.overridden" :aria-describedby="`smtp-help-${field.key}`">
                    <option :value="true">Yes</option>
                    <option :value="false">No</option>
                  </select>
                  <input v-else :id="`smtp-${field.key}`" v-model="draft[field.key].value" class="app-form-control settings-control" :type="field.type || 'text'" :min="field.type === 'number' ? 1 : undefined" :max="field.type === 'number' ? 65535 : undefined" :maxlength="2048" :placeholder="field.placeholder" :disabled="!draft.EMAIL_ENABLED.overridden" :aria-describedby="`smtp-help-${field.key}`">
                </div>
              </div>
              <div class="smtp-settings-field smtp-settings-row smtp-settings-password">
                <div class="smtp-settings-row__meta">
                  <span class="smtp-settings-row__icon" aria-hidden="true"><BootstrapIcon icon="shield-lock" context="control" /></span>
                  <div>
                    <label for="smtp-password" class="smtp-settings-row__title">SMTP password <code>SMTP_PASSWORD</code></label>
                  </div>
                </div>
                <div class="smtp-settings-row__control">
                  <input id="smtp-password" v-model="password" type="password" autocomplete="new-password" maxlength="4096" class="app-form-control settings-control" :placeholder="!passwordEdited && configuration.password.configured && (!draft.EMAIL_ENABLED.overridden || configuration.password.overridden) ? '********' : ''" :disabled="!draft.EMAIL_ENABLED.overridden" @input="passwordEdited = true">
                </div>
              </div>
            </fieldset>
          </section>
          <footer class="smtp-settings-actions smtp-settings-actions--footer">
            <button type="button" class="app-button app-button--outline-secondary" :disabled="busy" @click="confirmReset = true">Restore environment defaults</button>
            <button type="submit" class="app-button app-button--primary" :disabled="busy">{{ saving ? 'Saving…' : 'Save SMTP settings' }}</button>
          </footer>
        </form>
        <div v-if="confirmReset" class="app-notice app-notice--warning smtp-settings-confirmation">
          <p>Remove all saved SMTP overrides, including the password, and use the server environment?</p>
          <div class="smtp-settings-actions">
            <button type="button" class="app-button app-button--primary" :disabled="busy" @click="reset">Restore defaults</button>
            <button type="button" class="app-button app-button--outline-secondary" :disabled="busy" @click="confirmReset = false">Cancel</button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { fetchSmtpSettings, saveSmtpSettings, clearSmtpSettings } from '../../api/settings';
import { testSmtpConnectivity } from '../../api/users';

const fields = [
  { key: 'EMAIL_ENABLED', label: 'Enable email delivery', type: 'boolean', help: 'Enable or disable outbound email delivery.' },
  { key: 'PUBLIC_APP_URL', label: 'Public application URL', type: 'url', help: 'The address readers use to open RSSMonster. Used in verification and password-reset links.' },
  { key: 'SMTP_HOST', label: 'SMTP host', help: 'Hostname or IP address of the SMTP server.' },
  { key: 'SMTP_PORT', label: 'SMTP port', type: 'number', help: 'Port number of the SMTP server.' },
  { key: 'SMTP_SECURE', label: 'Use implicit TLS', type: 'boolean', help: 'Use for port 465. Leave off for STARTTLS on port 587.' },
  { key: 'SMTP_REQUIRE_TLS', label: 'Require STARTTLS', type: 'boolean', help: 'Use for port 587. Leave off when implicit TLS is enabled.' },
  { key: 'SMTP_USER', label: 'SMTP username', help: 'Username for SMTP authentication.' },
  { key: 'EMAIL_FROM', label: 'Sender', placeholder: 'RSSMonster <reader@example.com>', help: 'Use an email address or a display name followed by an address in angle brackets.' },
  { key: 'EMAIL_REPLY_TO', label: 'Reply-to address', type: 'email', help: 'Reply-to address used for outbound email.' }
];
const configuration = ref(null);
const draft = ref({});
const passwordEdited = ref(false);
const password = ref('');
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const confirmReset = ref(false);
const error = ref('');
const message = ref('');
const busy = computed(() => saving.value || testing.value);
const apply = data => {
  configuration.value = data;
  draft.value = Object.fromEntries(fields.map(({ key }) => [key, { ...data.fields[key] }]));
  password.value = '';
  passwordEdited.value = false;
};
const load = async () => {
  loading.value = true;
  error.value = '';
  try { apply((await fetchSmtpSettings()).data); } catch { error.value = 'Could not load email configuration status.'; } finally { loading.value = false; }
};
const save = async () => {
  if (busy.value) return;
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const overrides = Object.fromEntries(fields.filter(() => draft.value.EMAIL_ENABLED.overridden)
      .map(({ key, type }) => [key, type === 'number' ? Number(draft.value[key].value) : draft.value[key].value]));
    const action = !draft.value.EMAIL_ENABLED.overridden ? 'environment'
      : passwordEdited.value ? (password.value ? 'replace' : 'clear') : 'keep';
    apply((await saveSmtpSettings({ overrides, passwordAction: action,
      ...(action === 'replace' ? { password: password.value } : {}) })).data);
    message.value = 'SMTP settings saved.';
  } catch (failure) {
    error.value = failure.response?.data?.error || 'SMTP settings could not be saved.';
  } finally { saving.value = false; }
};
const reset = async () => {
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    apply((await clearSmtpSettings()).data);
    confirmReset.value = false;
    message.value = 'SMTP environment defaults restored.';
  } catch { error.value = 'SMTP defaults could not be restored.'; } finally { saving.value = false; }
};
const testConnection = async () => {
  if (busy.value || !configuration.value?.enabled || !configuration.value.configured) return;
  testing.value = true;
  error.value = '';
  message.value = '';
  try { message.value = (await testSmtpConnectivity()).data.message; } catch (failure) { error.value = failure.response?.data?.message || 'Could not connect to the configured SMTP server.'; } finally { testing.value = false; }
};
onMounted(load);
</script>

<style scoped>
.smtp-settings { container: smtp-settings / inline-size; min-width: 0; }
.smtp-settings-heading, .smtp-settings-heading__main, .smtp-settings-status__line, .smtp-settings-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.smtp-settings-heading, .smtp-settings-actions { flex-wrap: wrap; justify-content: space-between; }
.smtp-settings-heading { gap: var(--space-5); padding: var(--space-5); border-bottom: 1px solid var(--border-default); }
.smtp-settings-heading__main { flex: 1 1 20rem; min-width: 0; }
.smtp-settings-heading__icon { background: var(--settings-info-bg); }
.smtp-settings-heading h4, .smtp-settings-config__header h5 {
  margin: 0 0 var(--space-1);
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
}
.smtp-settings p { margin: 0; font-size: var(--font-size-ui-default); }
.smtp-settings p, .smtp-settings small { color: var(--text-secondary); line-height: 1.6; }
.smtp-settings-body { display: grid; gap: var(--space-5); padding: var(--space-5); }
.smtp-settings-summary { display: grid; gap: var(--space-3); }
.smtp-settings-statuses { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.smtp-settings-status { flex: 1 1 16rem; padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--surface-page); }
.smtp-settings-status__line { flex-wrap: wrap; justify-content: space-between; margin-bottom: var(--space-1); font-size: var(--font-size-ui-default); }
.smtp-settings-status__line > span { font-weight: 600; }
.smtp-settings-status .app-status-badge { display: inline-flex; align-items: center; gap: var(--space-1-5); font-size: 0.75rem; }
.smtp-settings .smtp-settings-info { margin: 0; color: var(--text-secondary); }
.smtp-settings-config { min-width: 0; background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-panel); }
.smtp-settings-config__header { padding: var(--space-5); border-bottom: 1px solid var(--border-default); }
.smtp-settings-fields { border: 0; margin: 0; padding: 0; min-width: 0; }
.smtp-settings-row { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); align-items: center; gap: var(--space-5); padding: var(--space-5); }
.smtp-settings-row + .smtp-settings-row { border-top: 1px solid var(--border-subtle); }
.smtp-settings-row__meta { display: flex; align-items: flex-start; gap: var(--space-3); min-width: 0; }
.smtp-settings-row__meta > div { min-width: 0; }
.smtp-settings-password .smtp-settings-row__meta { align-items: center; }
.smtp-settings-password .smtp-settings-row__title { margin-bottom: 0; }
.smtp-settings-row__icon { display: grid; place-items: center; flex: 0 0 auto; width: var(--control-height-compact); height: var(--control-height-compact); border-radius: var(--radius-control); background: var(--surface-page); color: var(--text-secondary); }
.smtp-settings-row__title { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-2); margin-bottom: var(--space-1); color: var(--text-primary); font-size: var(--font-size-ui-default); font-weight: 600; }
.smtp-settings-row code { color: var(--text-secondary); font-size: 0.75rem; font-weight: 400; overflow-wrap: anywhere; }
.smtp-settings-row__control { display: grid; gap: var(--space-2); min-width: 0; }
.smtp-settings-default { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-size-ui-default); }
.smtp-settings-default input { flex: 0 0 auto; }
.smtp-settings-field .settings-control { width: 100%; min-width: 0; }
.smtp-settings-field .settings-control:disabled { background: var(--surface-page); color: var(--text-secondary); border-color: var(--border-subtle); opacity: 1; }
.smtp-settings-actions { margin-top: var(--space-5); }
.smtp-settings-confirmation { margin: 0; }
.smtp-settings-confirmation > p { color: inherit; }
.smtp-settings .smtp-settings-success { color: var(--settings-success-text); background: var(--settings-success-bg); border-color: var(--border-success); }
.smtp-settings .app-notice--danger { color: var(--settings-danger-text); }
@container smtp-settings (max-width: 600px) {
  .smtp-settings-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3); }
  .smtp-settings-heading { align-items: stretch; }
  .smtp-settings-heading__main { flex-basis: 100%; }
  .smtp-settings-heading > button { width: 100%; }
  .smtp-settings-actions { flex-direction: column; align-items: stretch; }
  .smtp-settings-actions button { min-height: var(--control-height-touch); }
}
</style>
