<template>
  <section class="oidc-settings settings-data-panel" aria-labelledby="oidc-settings-title" :aria-busy="loading || saving">
    <header class="oidc-heading">
      <span class="settings-insight-icon oidc-heading__icon" aria-hidden="true"><BootstrapIcon icon="shield-lock" context="control" /></span>
      <div>
        <h4 id="oidc-settings-title">Authentication</h4>
        <p>Manage provider sign-in and local account access for everyone on this server.</p>
      </div>
    </header>
    <div class="oidc-body">
      <p v-if="loading" class="app-notice app-notice--info" role="status">Loading authentication settings…</p>
      <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
      <p v-if="message" class="app-notice app-notice--success" role="status">{{ message }}</p>
      <button v-if="!configuration && !loading" type="button" class="app-button app-button--outline-secondary oidc-retry" @click="load">Retry</button>
      <template v-if="configuration">
        <section class="oidc-summary" aria-label="Saved sign-in status">
          <div v-for="flag in flags" :key="flag.key" class="oidc-status">
            <div class="oidc-status__line">
              <span>{{ flag.label }}</span>
              <strong class="app-status-badge" :class="configuration.fields[flag.key]?.value ? 'app-status-badge--success' : 'app-status-badge--neutral'">
                <BootstrapIcon :icon="configuration.fields[flag.key]?.value ? 'check-circle-fill' : 'pause-circle'" context="control" aria-hidden="true" />
                {{ configuration.fields[flag.key]?.value ? 'Enabled' : 'Disabled' }}
              </strong>
            </div>
            <p>{{ configuration.fields[flag.key]?.overridden ? 'Using saved server settings.' : 'Using the environment default.' }}</p>
          </div>
        </section>
        <p class="app-notice app-notice--info oidc-info">Sign-in methods follow the server environment unless overridden below. Provider options are managed together with the OIDC override. Clear that override to restore all provider environment defaults.</p>
        <form :aria-busy="saving" @submit.prevent="save">
          <section class="oidc-config" aria-labelledby="oidc-methods-title">
            <header class="oidc-config__header">
              <h5 id="oidc-methods-title">Sign-in methods</h5>
              <p>At least one sign-in method must remain enabled. Existing sessions remain valid.</p>
            </header>
            <fieldset :disabled="saving" class="oidc-controls" aria-labelledby="oidc-methods-title">
              <div v-for="flag in flags" :key="flag.key" class="oidc-field oidc-row">
                <div class="oidc-row__meta">
                  <span class="oidc-row__icon" aria-hidden="true"><BootstrapIcon icon="person-circle" context="control" /></span>
                  <div>
                    <label :for="flag.key" class="oidc-row__title">{{ flag.label }} <code>{{ flag.key }}</code></label>
                    <p :id="`${flag.key}-help`">{{ flag.key === 'OIDC_ENABLED' ? 'Allow readers to sign in through your OpenID Connect provider.' : 'Allow local account sign-in. Disabling this also disables local registration, password changes, Fever, and Google Reader access.' }}</p>
                  </div>
                </div>
                <div class="oidc-row__control">
                  <label class="oidc-override"><input v-model="overridden[flag.key]" type="checkbox"> Override environment</label>
                  <select :id="flag.key" v-model="values[flag.key]" class="app-form-select settings-control" :disabled="!overridden[flag.key]" :aria-describedby="`${flag.key}-help`">
                    <option :value="true">Enabled</option><option :value="false">Disabled</option>
                  </select>
                  <small>{{ overridden[flag.key] ? 'Server override' : 'Environment default' }}</small>
                </div>
              </div>
            </fieldset>
          </section>
          <section class="oidc-config" aria-labelledby="oidc-provider-title">
            <header class="oidc-config__header">
              <h5 id="oidc-provider-title">OpenID Connect provider</h5>
              <p>Configure the identity provider used for sign-in.</p>
            </header>
            <fieldset :disabled="saving || !overridden.OIDC_ENABLED" class="oidc-controls" aria-labelledby="oidc-provider-title">
              <div v-for="field in fields" :key="field.key" class="oidc-field oidc-row">
                <div class="oidc-row__meta">
                  <span class="oidc-row__icon" aria-hidden="true"><BootstrapIcon icon="gear-fill" context="control" /></span>
                  <div>
                    <label :for="field.key" class="oidc-row__title">{{ field.label }} <code>{{ field.key }}</code></label>
                    <p :id="`${field.key}-help`">{{ field.help || 'Choose whether first-time provider sign-ins can create an account.' }}</p>
                  </div>
                </div>
                <div class="oidc-row__control">
                  <select v-if="field.key === 'OIDC_AUTO_PROVISION'" :id="field.key" v-model="values[field.key]" class="app-form-select settings-control" :aria-describedby="`${field.key}-help`">
                    <option :value="true">Create accounts on first sign-in</option><option :value="false">Use existing linked accounts only</option>
                  </select>
                  <input v-else :id="field.key" v-model="values[field.key]" :type="field.type || 'text'" class="app-form-control settings-control" maxlength="2048" :placeholder="field.key === 'OIDC_CLIENT_ID' && !clientIdEdited && configuration.fields.OIDC_CLIENT_ID?.configured ? '********' : undefined" @input="field.key === 'OIDC_CLIENT_ID' && (clientIdEdited = true)" :aria-describedby="`${field.key}-help`">
                </div>
              </div>
              <div class="oidc-field oidc-row">
                <div class="oidc-row__meta">
                  <span class="oidc-row__icon" aria-hidden="true"><BootstrapIcon icon="shield-lock" context="control" /></span>
                  <div>
                    <label for="oidc-secret-action" class="oidc-row__title">Client secret <code>OIDC_CLIENT_SECRET</code></label>
                    <p>Manage the secret used to authenticate with your provider.</p>
                    <div class="oidc-secret-status">
                      <strong>{{ configuration.secret.configured ? 'Secret configured' : 'No secret configured' }}</strong>
                      <small>{{ configuration.secret.overridden ? 'Source: server override' : 'Source: environment default' }}</small>
                    </div>
                    <p id="oidc-secret-help">Stored secrets are never displayed. Database credentials are encrypted at rest.</p>
                  </div>
                </div>
                <div class="oidc-row__control">
                  <select id="oidc-secret-action" v-model="secretAction" class="app-form-select settings-control" aria-describedby="oidc-secret-help">
                    <option value="keep">Keep current secret</option><option value="replace">Replace secret</option><option value="environment">Use environment secret</option>
                  </select>
                  <label v-if="secretAction === 'replace'" for="oidc-secret">New client secret</label>
                  <input v-if="secretAction === 'replace'" id="oidc-secret" v-model="secret" type="password" autocomplete="new-password" maxlength="4096" required class="app-form-control settings-control" aria-describedby="oidc-secret-help">
                </div>
              </div>
            </fieldset>
          </section>
          <footer class="oidc-footer">
            <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = true">Restore environment defaults</button>
            <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save authentication settings' }}</button>
            <div v-if="confirmReset" class="app-notice app-notice--warning oidc-reset">
              <p>Remove all authentication overrides and use the environment configuration?</p>
              <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = false">Cancel</button>
              <button type="button" class="app-button app-button--primary" :disabled="saving" @click="reset">Restore defaults</button>
            </div>
          </footer>
        </form>
      </template>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { fetchOidcSettings, saveOidcSettings, clearOidcSettings } from '../../api/settings';
const emit = defineEmits(['saved']);
const flags = [{ key: 'OIDC_ENABLED', label: 'Provider sign-in (OIDC)' }, { key: 'LOCAL_AUTH_ENABLED', label: 'Local authentication' }];
const fields = [
  { key: 'OIDC_ISSUER_URL', label: 'Issuer URL', type: 'url', help: 'HTTPS issuer URL from your identity provider.' },
  { key: 'OIDC_CLIENT_ID', label: 'Client ID', type: 'password', help: 'Application identifier from your provider.' },
  { key: 'OIDC_REDIRECT_URI', label: 'Callback URL', type: 'url', help: 'Must end with /api/auth/oidc/callback.' },
  { key: 'OIDC_FRONTEND_URL', label: 'Frontend URL', type: 'url', help: 'Root URL with the same scheme and hostname as the callback. Blank uses the callback origin.' },
  { key: 'OIDC_SCOPES', label: 'Scopes', help: 'Space-separated scopes, including openid.' },
  { key: 'OIDC_AUTO_PROVISION', label: 'Account provisioning' }
];
const configuration = ref(null);
const values = reactive({});
const overridden = reactive({});
const clientIdEdited = ref(false);
const secretAction = ref('keep');
const secret = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');
const confirmReset = ref(false);
const apply = data => {
  configuration.value = data;
  for (const [key, field] of Object.entries(data.fields)) {
    values[key] = key === 'OIDC_CLIENT_ID' ? '' : field.value;
    overridden[key] = field.overridden;
  }
  clientIdEdited.value = false;
  secret.value = '';
  secretAction.value = 'keep';
};
const load = async () => {
  loading.value = true;
  error.value = '';
  try { apply((await fetchOidcSettings()).data); } catch { error.value = 'Authentication settings could not be loaded.'; } finally { loading.value = false; }
};
const persist = async operation => {
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    apply((await operation()).data);
    confirmReset.value = false;
    message.value = 'Authentication settings saved.';
    emit('saved');
  } catch (failure) { error.value = failure.response?.data?.error || 'Authentication settings could not be saved. Please try again.'; } finally { saving.value = false; }
};
const save = () => {
  const overrides = Object.fromEntries(flags.filter(flag => overridden[flag.key]).map(flag => [flag.key, values[flag.key]]));
  if (overridden.OIDC_ENABLED) for (const field of fields) {
    if (field.key !== 'OIDC_CLIENT_ID' || clientIdEdited.value) overrides[field.key] = values[field.key];
  }
  const action = overridden.OIDC_ENABLED ? secretAction.value : 'environment';
  return persist(() => saveOidcSettings({ overrides, secretAction: action, ...(action === 'replace' ? { secret: secret.value } : {}) }));
};
const reset = () => persist(clearOidcSettings);
onMounted(load);
</script>

<style scoped>
.oidc-settings { container: oidc-settings / inline-size; min-width: 0; }
.oidc-heading { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-5); border-bottom: 1px solid var(--border-default); }
.oidc-heading__icon { background: var(--settings-info-bg); }
.oidc-heading h4, .oidc-config__header h5 { margin: 0 0 var(--space-1); color: var(--text-primary); font-size: 1rem; font-weight: 600; }
.oidc-settings p { margin: 0; font-size: var(--font-size-ui-default); }
.oidc-settings p, .oidc-settings small { color: var(--text-secondary); line-height: 1.6; }
.oidc-body { display: grid; gap: var(--space-5); padding: var(--space-5); min-width: 0; }
.oidc-retry { justify-self: start; }
.oidc-summary { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.oidc-status { flex: 1 1 16rem; padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--surface-page); }
.oidc-status__line { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-1); font-size: var(--font-size-ui-default); }
.oidc-status__line > span { font-weight: 600; }
.oidc-status .app-status-badge { display: inline-flex; align-items: center; gap: var(--space-1-5); font-size: 0.75rem; }
.oidc-settings .oidc-info { margin: 0; color: var(--text-secondary); }
.oidc-config { min-width: 0; background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-panel); }
.oidc-config + .oidc-config { margin-top: var(--space-5); }
.oidc-config__header { padding: var(--space-5); border-bottom: 1px solid var(--border-default); }
.oidc-controls { border: 0; margin: 0; padding: 0; min-width: 0; }
.oidc-row { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); align-items: center; gap: var(--space-5); padding: var(--space-5); }
.oidc-row + .oidc-row { border-top: 1px solid var(--border-subtle); }
.oidc-row__meta { display: flex; align-items: flex-start; gap: var(--space-3); min-width: 0; }
.oidc-row__meta > div { min-width: 0; }
.oidc-row__icon { display: grid; place-items: center; flex: 0 0 auto; width: var(--control-height-compact); height: var(--control-height-compact); border-radius: var(--radius-control); background: var(--surface-page); color: var(--text-secondary); }
.oidc-row__title { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-2); margin-bottom: var(--space-1); color: var(--text-primary); font-size: var(--font-size-ui-default); font-weight: 600; }
.oidc-row code { color: var(--text-secondary); font-size: 0.75rem; font-weight: 400; overflow-wrap: anywhere; }
.oidc-row__control { display: grid; gap: var(--space-2); min-width: 0; }
.oidc-override { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-size-ui-default); }
.oidc-override input { flex: 0 0 auto; }
.settings-control { width: 100%; min-width: 0; }
.settings-control:disabled { background: var(--surface-page); color: var(--text-secondary); border-color: var(--border-subtle); opacity: 1; }
.oidc-secret-status { display: grid; gap: var(--space-1); margin: var(--space-2) 0; }
.oidc-secret-status strong { color: var(--text-primary); font-size: var(--font-size-ui-default); font-weight: 500; }
.oidc-settings small { font-size: 0.75rem; }
.oidc-footer { display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: space-between; margin-top: var(--space-5); }
.oidc-reset { width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.oidc-reset > p { color: inherit; }
.oidc-settings .app-notice--success { color: var(--settings-success-text); background: var(--settings-success-bg); border-color: var(--border-success); }
.oidc-settings .app-notice--danger { color: var(--settings-danger-text); }
@container oidc-settings (max-width: 600px) {
  .oidc-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3); }
  .oidc-footer { flex-direction: column; align-items: stretch; }
  .oidc-footer button { min-height: var(--control-height-touch); }
}
</style>
