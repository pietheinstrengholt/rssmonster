<template>
  <section class="settings-data-panel inference-runtime" aria-labelledby="inference-runtime-title" :aria-busy="loading || saving">
    <header>
      <h4 id="inference-runtime-title">Runtime configuration</h4>
      <p>Configure inference timeouts, recovery, permissions, and optional processing.</p>
    </header>
    <p v-if="loading" role="status">Loading runtime settings…</p>
    <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
    <p v-if="message" class="app-notice app-notice--success" role="status">{{ message }}</p>
    <button v-if="!configuration && !loading" type="button" class="app-button app-button--outline-secondary" @click="load">Retry runtime settings</button>
    <template v-if="configuration">
      <p>{{ configuration.overridden ? 'Using saved inference settings.' : 'Using environment defaults.' }} Changes apply to new requests and processing batches.</p>
      <form @submit.prevent="save">
        <label class="runtime-override"><input v-model="overridden" type="checkbox" :disabled="saving"> Override environment default</label>
        <p>All values below are saved together. Connection settings are managed separately.</p>
        <fieldset v-for="group in groups" :key="group" :disabled="saving || !overridden">
          <legend>{{ group }}</legend>
          <div v-for="field in configuration.fields.filter(field => field.group === group)" :key="field.key" class="runtime-row">
            <div>
              <label :for="field.key">{{ field.label }} <code>{{ field.key }}</code></label>
              <p v-if="field.help" :id="`${field.key}-help`">{{ field.help }}</p>
            </div>
            <div class="runtime-control">
              <input v-if="field.type === 'number'" :id="field.key" v-model.number="values[field.key]" type="number" required step="1" :min="field.min" :max="field.max" class="app-form-control settings-control" :aria-describedby="field.help ? `${field.key}-help` : undefined">
              <select v-else :id="field.key" v-model="values[field.key]" class="app-form-select settings-control" :aria-describedby="`${field.key}-help`">
                <option v-if="field.type === 'permission'" :value="null">Automatic</option>
                <option :value="true">{{ field.type === 'permission' ? 'Enabled' : 'Yes' }}</option>
                <option :value="false">{{ field.type === 'permission' ? 'Disabled' : 'No' }}</option>
              </select>
              <small v-if="field.unit">{{ field.unit }}</small>
            </div>
          </div>
        </fieldset>
        <footer class="runtime-actions">
          <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = true">Restore environment defaults</button>
          <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save runtime settings' }}</button>
        </footer>
      </form>
      <div v-if="confirmReset" class="app-notice app-notice--warning">
        <p>Remove the saved runtime overrides and use environment defaults?</p>
        <div class="runtime-actions">
          <button type="button" class="app-button app-button--primary" :disabled="saving" @click="persist(clearInferenceRuntimeSettings)">Restore defaults</button>
          <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = false">Cancel</button>
        </div>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import { fetchInferenceRuntimeSettings, saveInferenceRuntimeSettings, clearInferenceRuntimeSettings } from '../../api/settings';
const emit = defineEmits(['saved']);
const configuration = ref(null);
const overridden = ref(false);
const values = ref({});
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');
const confirmReset = ref(false);
const groups = computed(() => [...new Set(configuration.value?.fields.map(field => field.group) || [])]);
const apply = data => {
  configuration.value = data;
  overridden.value = data.overridden;
  values.value = Object.fromEntries(data.fields.map(field => [field.key, field.value]));
};
const load = async () => {
  loading.value = true; error.value = '';
  try { apply((await fetchInferenceRuntimeSettings()).data); } catch { error.value = 'Runtime settings could not be loaded.'; } finally { loading.value = false; }
};
const persist = async operation => {
  if (saving.value) return;
  saving.value = true; error.value = ''; message.value = '';
  try {
    apply((await operation()).data);
    confirmReset.value = false; message.value = 'Runtime settings saved.';
    emit('saved');
  } catch (failure) { error.value = failure.response?.data?.error || 'Runtime settings could not be saved.'; } finally { saving.value = false; }
};
const save = () => persist(() => saveInferenceRuntimeSettings({ overridden: overridden.value, ...(overridden.value ? { values: { ...values.value } } : {}) }));
onMounted(load);
</script>
<style scoped>
.inference-runtime { container: inference-runtime / inline-size; display: grid; gap: 1rem; padding: 1rem; min-width: 0; }
.inference-runtime h4 { margin: 0; font-size: 1rem; font-weight: 700; }
.inference-runtime p, .inference-runtime small { margin: 0; color: var(--text-muted); font-size: .8125rem; line-height: 1.5; }
.inference-runtime header p { margin-top: .375rem; }
.runtime-override { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; }
.inference-runtime fieldset { min-width: 0; margin: 1rem 0; padding: .75rem; border: 1px solid var(--border-default); border-radius: var(--radius-panel); }
.inference-runtime legend { padding: 0 .5rem; font-size: .875rem; font-weight: 600; }
.runtime-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: center; gap: 1.25rem; padding: .75rem 0; }
.runtime-row + .runtime-row { border-top: 1px solid var(--border-subtle); }
.runtime-row label { display: block; font-size: .875rem; font-weight: 600; }
.runtime-row code { display: block; color: var(--text-muted); font-size: .75rem; font-weight: 400; overflow-wrap: anywhere; }
.runtime-control { display: grid; gap: .25rem; min-width: 0; }
.runtime-control .settings-control { width: 100%; min-width: 0; }
.runtime-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; margin-top: 1rem; }
.inference-runtime .app-notice--danger { color: var(--settings-danger-text); }
.inference-runtime .app-notice--success { color: var(--settings-success-text); }
@container inference-runtime (max-width: 600px) {
  .runtime-row { grid-template-columns: minmax(0, 1fr); gap: .75rem; }
  .runtime-actions { flex-direction: column; align-items: stretch; }
}
</style>
