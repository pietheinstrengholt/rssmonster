<template>
  <div ref="settingsPage" class="settings-islands settings-page">
    <SettingsPageIntro
      eyebrow="Settings — Island Insights"
      icon="compass-fill"
      title="Your evolving interests"
      title-id="islands-title"
    >
      Interest islands capture the interests your reading, favorites, and clicks keep reinforcing. Review the interests you have developed
      and the behavioral evidence behind them.
    </SettingsPageIntro>

    <section v-if="summary" class="interests-summary" aria-label="Interest summary">
      <article v-for="card in summaryCards" :key="card.key" class="interest-summary-card">
        <span>{{ card.label }}</span><strong>{{ summary[card.key] }}</strong><small>{{ card.help }}</small>
      </article>
    </section>

    <section class="interests-toolbar">
      <div class="interests-filters" role="group" aria-label="Filter interests">
        <button v-for="filter in filters" :key="filter.value" type="button"
          class="app-button app-button--compact interest-filter"
          :class="selectedFilter === filter.value ? 'app-button--primary' : 'app-button--secondary'"
          :aria-pressed="selectedFilter === filter.value" @click="selectFilter(filter.value)">{{ filter.label }}</button>
      </div>
      <div class="interests-toolbar-right">
        <input v-model="searchQuery" type="search" placeholder="Search interests…" aria-label="Search interests" @input="scheduleSearch">
        <label class="interests-sort">Sort:
          <select v-model="sortOrder" @change="loadInterests">
            <option value="strength">Evidence strength</option><option value="recent">Recent activity</option><option value="name">Name</option>
          </select>
        </label>
      </div>
    </section>
    <p class="interests-help">Evidence strength shows preference magnitude, not confidence in a recommendation.</p>

    <div class="interests-content" :class="{ 'interests-content--inspecting': selectedInterestId != null }">
      <div class="interests-list-column">
    <section v-if="loading" class="interests-state" role="status" aria-live="polite">
      <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span> Loading interests…
    </section>
    <section v-else-if="error" class="interests-state interests-error" role="alert">
      <p>{{ error }}</p><button type="button" class="app-button app-button--outline-danger" @click="loadInterests">Try again</button>
    </section>
    <section v-else-if="!interests.length" class="interests-empty">
      <template v-if="summary?.total === 0">
        <h2>No interests learned yet</h2>
        <p>RSSMonster learns from favorites, feedback, outbound clicks, and meaningful reading behavior. Your interests will appear here as you use the reader.</p>
      </template>
      <template v-else><h2>No matching interests</h2><p>Try another search or filter.</p></template>
    </section>
    <section v-else class="interests-list" aria-label="Learned interests">
      <article v-for="interest in interests" :key="interest.id" class="interest-row"
        :class="{ 'interest-row--selected': selectedInterestId === interest.id }">
        <div class="interest-name-line">
          <h3>{{ interest.name }}</h3>
          <span class="interest-badge" :class="`interest-badge--${interest.polarity}`">{{ titleCase(interest.polarity) }}</span>
        </div>
        <div class="interest-strength">
          <div class="interest-strength-header"><span>Evidence strength</span>
            <strong>{{ interest.evidenceStrength ?? interest.rawWeight ?? interest.weight }}</strong>
          </div>
          <div v-if="interest.evidenceStrength != null" class="interest-strength-track" role="progressbar"
            :aria-label="`${interest.name} evidence strength`" :aria-valuenow="interest.evidenceStrength" aria-valuemin="0" aria-valuemax="100">
            <div class="interest-strength-fill" :class="{ 'interest-strength-fill--negative': interest.polarity === 'negative' }"
              :style="{ width: `${interest.evidenceStrength}%` }"></div>
          </div>
          <div v-if="interest.evidence" class="interest-evidence">
            <template v-for="field in evidenceFields" :key="field.key">
              <span v-if="interest.evidence[field.key] != null">{{ field.label }} {{ interest.evidence[field.key] }}</span>
            </template>
          </div>
        </div>
        <div class="interest-meta">
          <span>Last activity</span><strong>{{ formatRelativeDate(interest.lastActivityAt) || 'Unknown' }}</strong>
          <span class="interest-badge" :class="`interest-badge--${interest.lifecycle}`">{{ titleCase(interest.lifecycle) }}</span>
          <span v-if="interest.muted" class="interest-badge interest-badge--muted">Muted</span>
        </div>
        <div class="interest-actions">
          <button type="button" class="app-button app-button--secondary app-button--compact"
            :aria-label="`${interest.muted ? 'Unmute' : 'Mute'} ${interest.name}`"
            :disabled="mutatingInterestId != null" @click="toggleMute(interest)">{{ interest.muted ? 'Unmute' : 'Mute' }}</button>
          <button type="button" class="app-button app-button--secondary app-button--compact interest-inspect"
            :aria-label="`Inspect ${interest.name}`" :aria-expanded="selectedInterestId === interest.id"
            @click="inspectInterest(interest)">Inspect</button>
        </div>
        <p v-if="muteErrorId === interest.id" class="interest-mute-error" role="alert">Couldn’t update this interest. Try again.</p>
      </article>
    </section>

      </div>
      <InterestInspector v-if="selectedInterest" :interest="selectedInterest" @close="closeDetail" @open-article="$emit('open-article', $event)" />
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import InterestInspector from '../interests/InterestInspector.vue';
import SettingsPageIntro from './SettingsPageIntro.vue';
import { fetchInterests, setInterestMuted } from '../../api/interests.js';
import { formatRelativeDate } from '../../utils/date.js';
import { interestEvidenceFields as evidenceFields, interestStateLabel as titleCase } from '../../services/interestPresentation.js';

const props = defineProps({ interestId: { type: [Number, String], default: null } });
defineEmits(['open-article']);
const loading = ref(true);
const error = ref('');
const interests = ref([]);
const summary = ref(null);
const searchQuery = ref('');
const selectedFilter = ref('active');
const sortOrder = ref('strength');
const selectedInterestId = ref(null);
const selectedInterest = ref(null);
const settingsPage = ref(null);
const mutatingInterestId = ref(null);
const muteErrorId = ref(null);
let searchTimer;
let listController;
const filters = ['all', 'positive', 'negative', 'active', 'archived'].map(value => ({ value, label: titleCase(value) }));
const summaryCards = [
  { key: 'positive', label: 'Positive interests', help: 'Interests you engage with' },
  { key: 'negative', label: 'Negative interests', help: 'Interests you tend to avoid' },
  { key: 'active', label: 'Active', help: 'Recently active' },
  { key: 'archived', label: 'Archived', help: 'Not currently active' }
];

async function loadInterests() {
  clearTimeout(searchTimer);
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await fetchInterests({ search: searchQuery.value,
      polarity: ['positive', 'negative'].includes(selectedFilter.value) ? selectedFilter.value : 'all',
      lifecycle: ['active', 'archived'].includes(selectedFilter.value) ? selectedFilter.value : 'all', sort: sortOrder.value }, controller.signal);
    if (controller.signal.aborted) return;
    interests.value = data.interests;
    summary.value = data.summary;
  } catch {
    if (!controller.signal.aborted) error.value = 'We couldn’t load your interests. Please try again.';
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}
function scheduleSearch() {
  clearTimeout(searchTimer);
  listController?.abort();
  loading.value = true;
  searchTimer = setTimeout(loadInterests, 300);
}
function selectFilter(value) { selectedFilter.value = value; loadInterests(); }
async function toggleMute(interest) {
  if (mutatingInterestId.value != null) return;
  mutatingInterestId.value = interest.id;
  muteErrorId.value = null;
  try {
    const { data } = await setInterestMuted(interest.id, !interest.muted);
    interest.muted = data.interest.muted;
    const current = interests.value.find(item => String(item.id) === String(interest.id));
    if (current) current.muted = data.interest.muted;
  } catch {
    muteErrorId.value = interest.id;
  } finally {
    mutatingInterestId.value = null;
  }
}
function inspectInterest(interest) {
  selectedInterestId.value = interest.id;
  selectedInterest.value = interest;
}
function closeDetail() { selectedInterestId.value = null; selectedInterest.value = null; }
onMounted(async () => {
  await loadInterests();
  if (props.interestId == null || error.value) return;
  const interest = interests.value.find(item => String(item.id) === String(props.interestId));
  if (!interest) return;
  inspectInterest(interest);
  await nextTick();
  // The inspector focuses itself on the next tick; scroll after that focus settles.
  await nextTick();
  settingsPage.value?.querySelector('.interest-row--selected')?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
});
onBeforeUnmount(() => { clearTimeout(searchTimer); listController?.abort(); });
</script>

<style scoped>
.interests-content { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.interests-list-column { min-width: 0; }
@media (min-width: 1200px) {
  .interests-content--inspecting { grid-template-columns: minmax(0, 1fr) minmax(250px, 320px); }
  .interests-content--inspecting .interest-row { grid-template-columns: minmax(0, 1fr) auto; }
  .interests-content--inspecting .interest-strength, .interests-content--inspecting .interest-meta { grid-column: 1 / -1; }
  .interests-content--inspecting .interest-actions { grid-column: 2; grid-row: 1; }
}
.interests-help, .interests-empty p { color: var(--text-secondary); font-size: 13px; }

input, select { min-height: var(--control-height-default); padding: 6px 10px; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-control); color: var(--text-primary); font: inherit; }
.interests-toolbar-right input { width: min(280px, 32vw); min-width: 0; }
input:focus-visible, select:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
.interests-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
.interest-summary-card { display: flex; flex-direction: column; gap: 3px; min-height: 74px; padding: 12px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-card); }
.interest-summary-card span, .interest-summary-card small { color: var(--text-secondary); font-size: 12px; }
.interest-summary-card strong { font-size: 22px; }
.interest-summary-card small { font-size: 11px; }
.interests-toolbar, .interests-filters, .interests-toolbar-right, .interests-sort { display: flex; align-items: center; gap: 8px; }
.interests-toolbar { justify-content: space-between; gap: 16px; margin-bottom: 6px; }
.interests-filters { flex-wrap: wrap; gap: 6px; }
.interest-filter { border-radius: var(--radius-pill); }
.interests-sort { font-size: 13px; }
.interests-list { display: flex; flex-direction: column; gap: 6px; }
.interest-row { display: grid; grid-template-columns: minmax(160px, 1.15fr) minmax(170px, 1fr) minmax(90px, .55fr) auto; gap: 12px; align-items: center; min-height: 68px; padding: 10px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-card); }
.interest-row:hover { border-color: var(--border-strong); }
.interest-row--selected { border-color: var(--color-primary); background: var(--surface-selected); box-shadow: inset 3px 0 0 var(--color-primary); }
.interest-name-line { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 8px; min-width: 0; }
.interest-name-line h3 { margin: 0; font-size: 15px; line-height: 1.3; overflow-wrap: anywhere; }
.interest-badge { display: inline-flex; width: fit-content; padding: 3px 9px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--badge-tag-bg); color: var(--badge-tag-text); }
.interest-badge--positive, .interest-badge--active { background: var(--badge-quality-bg); color: var(--badge-quality-text); }
.interest-badge--negative { background: var(--badge-danger-bg); color: var(--badge-danger-text); }
.interest-badge--archived, .interest-badge--muted { background: var(--surface-chrome); color: var(--text-secondary); }
.interest-strength-header { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; color: var(--text-secondary); font-size: 12px; }
.interest-strength-header strong { color: var(--text-primary); }
.interest-strength-track { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-chrome); }
.interest-strength-fill { height: 100%; background: var(--color-primary); }
.interest-strength-fill--negative { background: var(--color-danger); }
.interest-evidence { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.interest-evidence span { padding: 3px 7px; border-radius: var(--radius-control); background: var(--surface-chrome); color: var(--text-secondary); font-size: 11px; }
.interest-meta { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-size: 12px; }
.interest-meta > span:first-child { color: var(--text-secondary); font-size: 11px; }
.interest-actions { display: flex; flex-wrap: wrap; align-items: center; justify-self: end; gap: 6px; }
.interest-mute-error { grid-column: 1 / -1; margin: 0; color: var(--color-danger); font-size: 12px; }
.interests-state { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; padding: 32px 16px; color: var(--text-secondary); }
.interests-error { border: 1px solid var(--border-danger); border-radius: var(--radius-control); background: color-mix(in srgb, var(--badge-danger-bg) 40%, var(--surface-card)); }
.interests-empty { padding: 48px 24px; border: 1px dashed var(--border-default); border-radius: var(--radius-control); text-align: center; }
.interests-empty h2 { font-size: 18px; }
.interests-empty p { max-width: 560px; margin: 0 auto; }
@media (max-width: 1199px) {
  .interests-content--inspecting { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 1100px) {
  .interests-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .interest-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
  .interest-meta { grid-column: 1; }
  .interest-actions { grid-column: 3; grid-row: 1 / span 2; }

}
@media (max-width: 1000px) {
  .interests-toolbar { align-items: stretch; flex-direction: column; }
  .interests-toolbar-right { width: 100%; }
  .interests-toolbar-right input { flex: 1; width: auto; }
}
@media (max-width: 760px) {
  .interests-toolbar-right { align-items: stretch; flex-direction: column; }
  .interests-toolbar-right input { width: 100%; box-sizing: border-box; }
  .interests-sort { justify-content: space-between; }
  .interest-row, .interests-content--inspecting .interest-row { grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 13px; }
  .interest-meta, .interest-actions, .interests-content--inspecting .interest-strength, .interests-content--inspecting .interest-meta, .interests-content--inspecting .interest-actions { grid-column: auto; grid-row: auto; }
  .interest-actions { justify-self: start; }
}
</style>
