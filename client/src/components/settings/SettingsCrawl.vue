<template>
  <section class="crawl-settings settings-data-panel" aria-labelledby="crawl-settings-title" :aria-busy="loading || saving">
    <header class="crawl-heading">
      <span class="settings-insight-icon" aria-hidden="true"><BootstrapIcon icon="arrow-repeat" context="control" /></span>
      <div><h4 id="crawl-settings-title">Crawl configuration</h4><p>Configure feed scheduling, request limits, and parser resources.</p></div>
    </header>
    <div class="crawl-body">
      <p v-if="loading" role="status">Loading crawl settings…</p>
      <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
      <p v-if="message" class="app-notice app-notice--success" role="status">{{ message }}</p>
      <button v-if="!configuration && !loading" class="app-button app-button--outline-secondary" type="button" @click="load">Retry</button>
      <template v-if="configuration">
        <p>{{ configuration.overridden ? 'Using saved server settings.' : 'Using environment defaults.' }} Changes apply to new crawls; active crawls keep their current limits.</p>
        <form @submit.prevent="save">
          <label class="crawl-override"><input v-model="overridden" type="checkbox" :disabled="saving"> Override environment default</label>
          <p>Enabling the override saves all values below together. Restore defaults to return to the environment configuration.</p>
          <fieldset v-for="group in groups" :key="group" :disabled="saving || !overridden" class="crawl-fields">
            <legend>{{ group }}</legend>
            <div v-for="field in configuration.fields.filter(field => field.group === group)" :key="field.key" class="crawl-row">
              <div>
                <label :for="field.key">{{ field.label }} <code>{{ field.key }}</code></label>
                <p :id="`${field.key}-help`">{{ field.help || 'Maximum UTF-8 size accepted per entry.' }}</p>
              </div>
              <div class="crawl-control">
                <select v-if="field.key === 'CRAWL_PARALLELPROCESSFLAG'" :id="field.key" v-model="values[field.key]" class="app-form-select settings-control" :aria-describedby="`${field.key}-help`">
                  <option :value="0">Sequential</option><option :value="1">Parallel</option>
                </select>
                <input v-else :id="field.key" v-model.number="values[field.key]" type="number" required step="1" :min="field.min" :max="field.max" class="app-form-control settings-control" :aria-describedby="`${field.key}-help`">
                <small v-if="field.unit">{{ field.unit }}</small>
              </div>
            </div>
          </fieldset>
          <p>Effective saved mode: {{ configuration.effectiveParallel === 1 ? 'parallel' : 'sequential' }}. Effective saved feed lease: {{ configuration.effectiveLeaseMs }} ms.</p>
          <footer class="crawl-actions">
            <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = true">Restore environment defaults</button>
            <button type="button" class="app-button app-button--outline-secondary" :disabled="saving || !overridden" @click="useSuggestedValues">Use suggested values</button>
            <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save crawl settings' }}</button>
          </footer>
        </form>
        <div v-if="confirmReset" class="app-notice app-notice--warning">
          <p>Remove all saved crawl overrides and use the environment configuration?</p>
          <div class="crawl-actions">
            <button type="button" class="app-button app-button--primary" :disabled="saving" @click="persist(clearCrawlSettings)">Restore defaults</button>
            <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="confirmReset = false">Cancel</button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import { fetchCrawlSettings, saveCrawlSettings, clearCrawlSettings } from '../../api/settings';
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
  configuration.value = data; overridden.value = data.overridden;
  values.value = Object.fromEntries(data.fields.map(field => [field.key, field.value]));
};
const useSuggestedValues = () => { values.value = Object.fromEntries(configuration.value.fields.map(field => [field.key, field.suggestedValue ?? field.defaultValue])); };
const load = async () => {
  loading.value = true; error.value = '';
  try { apply((await fetchCrawlSettings()).data); } catch { error.value = 'Crawl settings could not be loaded.'; } finally { loading.value = false; }
};
const persist = async operation => {
  if (saving.value) return;
  saving.value = true; error.value = ''; message.value = '';
  try { apply((await operation()).data); confirmReset.value = false; message.value = 'Crawl settings saved.'; } catch (failure) { error.value = failure.response?.data?.error || 'Crawl settings could not be saved.'; } finally { saving.value = false; }
};
const save = () => persist(() => saveCrawlSettings({ overridden: overridden.value, ...(overridden.value ? { values: { ...values.value } } : {}) }));
onMounted(load);
</script>
<style scoped>
.crawl-settings { container: crawl-settings / inline-size; min-width: 0; }
.crawl-heading { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-5); border-bottom: 1px solid var(--border-default); }
.crawl-heading h4 { margin: 0 0 var(--space-1); font-size: 1rem; font-weight: 600; }
.crawl-settings p, .crawl-settings small { margin: 0; color: var(--text-secondary); font-size: var(--font-size-ui-default); line-height: 1.6; }
.crawl-body { display: grid; gap: var(--space-5); padding: var(--space-5); }
.crawl-override { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.crawl-fields { border: 1px solid var(--border-default); border-radius: var(--radius-panel); padding: var(--space-3); margin: var(--space-5) 0; min-width: 0; }
.crawl-fields legend { padding: 0 var(--space-2); font-size: var(--font-size-ui-default); font-weight: 600; }
.crawl-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: var(--space-5); align-items: center; padding: var(--space-3) 0; }
.crawl-row + .crawl-row { border-top: 1px solid var(--border-subtle); }
.crawl-row label { display: block; font-size: var(--font-size-ui-default); font-weight: 600; }
.crawl-row code { display: block; color: var(--text-secondary); font-size: .75rem; font-weight: 400; overflow-wrap: anywhere; }
.crawl-control { display: grid; gap: var(--space-1); min-width: 0; }
.crawl-control .settings-control { width: 100%; min-width: 0; }
.crawl-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-5); }
footer.crawl-actions { justify-content: flex-start; }
footer.crawl-actions > [type="submit"] { margin-inline-start: auto; }
.crawl-settings .app-notice--danger { color: var(--settings-danger-text); }
.crawl-settings .app-notice--success { color: var(--settings-success-text); }
@container crawl-settings (max-width: 600px) {
  .crawl-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
  .crawl-actions { flex-direction: column; align-items: stretch; }
  footer.crawl-actions > [type="submit"] { margin-inline-start: 0; }
}
</style>
