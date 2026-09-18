<template>
  <section class="push-settings settings-data-panel" aria-labelledby="push-settings-title" :aria-busy="loading || saving">
    <header class="push-heading">
      <span class="settings-insight-icon" aria-hidden="true"><BootstrapIcon icon="bell-fill" context="control" /></span>
      <div><h4 id="push-settings-title">Web Push notifications</h4><p>Configure optional browser notifications for new articles.</p></div>
    </header>
    <div class="push-body">
      <p v-if="loading" role="status">Loading Web Push settings…</p>
      <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
      <p v-if="message" class="app-notice app-notice--success" role="status">{{ message }}</p>
      <button v-if="!configuration && !loading" class="app-button app-button--outline-secondary" type="button" @click="load">Retry</button>
      <template v-if="configuration">
        <div class="push-status">
          <span class="app-status-badge" :class="configuration.configured ? 'app-status-badge--success' : 'app-status-badge--neutral'">
            <span aria-hidden="true">●</span> {{ configuration.configured ? 'Configured' : 'Not configured' }}
          </span>
          <p>{{ configuration.overridden ? 'Using saved server settings.' : 'Using environment defaults.' }}</p>
        </div>
        <form @submit.prevent="save">
          <label class="push-override"><input v-model="overridden" type="checkbox" :disabled="saving"> Override environment default</label>
          <p class="push-help">The override manages both keys and the subject together. Enter a matching key pair when first enabling it. Unchanged masked fields retain saved keys.</p>
          <fieldset :disabled="saving || !overridden" class="push-fields">
            <div v-for="field in keyFields" :key="field.key" class="push-row">
              <label :for="`push-${field.key}`">{{ field.label }} <code>{{ field.key }}</code></label>
              <input :id="`push-${field.key}`" v-model="values[field.input]" type="password" autocomplete="new-password" maxlength="2048" class="app-form-control settings-control" :placeholder="!edited[field.input] && configuration.fields[field.key].configured && (!overridden || configuration.overridden) ? '********' : ''" @input="edited[field.input] = true">
            </div>
            <div class="push-row">
              <label for="push-subject">Contact subject <code>VAPID_SUBJECT</code></label>
              <input id="push-subject" v-model="subject" type="text" maxlength="2048" placeholder="mailto:admin@example.com" class="app-form-control settings-control" aria-describedby="push-subject-help">
              <p id="push-subject-help" class="push-help">A contact email with mailto: or an HTTPS contact URL.</p>
            </div>
            <button type="button" class="app-button app-button--outline-secondary" @click="clearKeys">Clear keys</button>
          </fieldset>
          <p class="push-help">Clear both keys to disable Web Push. Changing the key pair may require readers to subscribe again.</p>
          <footer class="push-actions">
            <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = true">Restore environment defaults</button>
            <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save Web Push settings' }}</button>
          </footer>
        </form>
        <div v-if="confirmReset" class="app-notice app-notice--warning">
          <p>Remove all saved Web Push overrides and use the environment configuration?</p>
          <div class="push-actions">
            <button type="button" class="app-button app-button--primary" :disabled="saving" @click="persist(clearPushSettings)">Restore defaults</button>
            <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = false">Cancel</button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { fetchPushSettings, savePushSettings, clearPushSettings } from '../../api/settings';
const keyFields = [{ key: 'VAPID_PUBLIC_KEY', input: 'publicKey', label: 'Public key' }, { key: 'VAPID_PRIVATE_KEY', input: 'privateKey', label: 'Private key' }];
const configuration = ref(null);
const overridden = ref(false);
const subject = ref('');
const values = reactive({ publicKey: '', privateKey: '' });
const edited = reactive({ publicKey: false, privateKey: false });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');
const confirmReset = ref(false);
const clearKeys = () => {
  for (const { input } of keyFields) { values[input] = ''; edited[input] = true; }
};
const apply = data => {
  configuration.value = data;
  overridden.value = data.overridden;
  subject.value = data.fields.VAPID_SUBJECT.value;
  for (const { input } of keyFields) { values[input] = ''; edited[input] = false; }
};
const load = async () => {
  loading.value = true; error.value = '';
  try { apply((await fetchPushSettings()).data); } catch { error.value = 'Web Push settings could not be loaded.'; } finally { loading.value = false; }
};
const persist = async operation => {
  if (saving.value) return;
  saving.value = true; error.value = ''; message.value = '';
  try {
    apply((await operation()).data);
    confirmReset.value = false;
    message.value = 'Web Push settings saved.';
  } catch (failure) { error.value = failure.response?.data?.error || 'Web Push settings could not be saved.'; } finally { saving.value = false; }
};
const save = () => {
  const input = { overridden: overridden.value };
  if (overridden.value) {
    input.subject = subject.value;
    for (const field of keyFields) if (edited[field.input]) input[field.input] = values[field.input];
  }
  return persist(() => savePushSettings(input));
};
onMounted(load);
</script>

<style scoped>
.push-settings { container: push-settings / inline-size; min-width: 0; }
.push-heading { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-5); border-bottom: 1px solid var(--border-default); }
.push-heading h4 { margin: 0 0 var(--space-1); font-size: 1rem; font-weight: 600; }
.push-settings p { margin: 0; color: var(--text-secondary); font-size: var(--font-size-ui-default); line-height: 1.6; }
.push-body { display: grid; gap: var(--space-5); padding: var(--space-5); }
.push-status, .push-actions, .push-override { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
.push-fields { border: 0; margin: var(--space-5) 0; padding: 0; min-width: 0; }
.push-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); align-items: center; padding: var(--space-3) 0; }
.push-row + .push-row { border-top: 1px solid var(--border-subtle); }
.push-row label { font-weight: 600; font-size: var(--font-size-ui-default); }
.push-row code { display: block; font-size: .75rem; color: var(--text-secondary); font-weight: 400; overflow-wrap: anywhere; }
.push-row input { width: 100%; min-width: 0; }
.push-row .push-help { grid-column: 2; }
.push-override { margin-bottom: var(--space-2); }
.push-actions { justify-content: space-between; margin-top: var(--space-5); }
.push-settings .app-notice--danger { color: var(--settings-danger-text); }
.push-settings .app-notice--success { color: var(--settings-success-text); }
@container push-settings (max-width: 600px) {
  .push-row { grid-template-columns: minmax(0, 1fr); }
  .push-row .push-help { grid-column: 1; }
  .push-actions { align-items: stretch; flex-direction: column; }
}
</style>
