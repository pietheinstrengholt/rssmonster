<template>
  <Teleport to="body" :disabled="!compact">
    <component :is="compact ? BaseDialog : 'aside'" ref="panel" class="interest-inspector"
      :class="{ 'interest-inspector--overlay': compact }" :show-close="compact"
      close-label="Close interest details" :aria-labelledby="compact ? undefined : 'interest-inspector-title'"
      :tabindex="compact ? undefined : -1" @close="$emit('close')" @keydown.esc.stop="$emit('close')">
      <template #title>{{ selectedInterest.name }}</template>
      <header v-if="!compact" class="interest-inspector-header">
        <h2 id="interest-inspector-title">{{ selectedInterest.name }}</h2>
        <button type="button" class="app-icon-button" aria-label="Close interest details" @click="$emit('close')">×</button>
      </header>
      <div class="interest-inspector-badges">
        <span class="interest-badge" :class="`interest-badge--${selectedInterest.polarity}`">{{ interestStateLabel(selectedInterest.polarity) }}</span>
        <span class="interest-badge" :class="`interest-badge--${selectedInterest.lifecycle}`">{{ interestStateLabel(selectedInterest.lifecycle) }}</span>
        <span v-if="interest.muted" class="interest-badge interest-badge--muted">Muted</span>
      </div>
      <div v-if="detailLoading" class="inspector-state" role="status" aria-label="Loading interest details">
        <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span> Loading interest…
      </div>
      <div v-else-if="detailError" class="inspector-state inspector-error" role="alert">
        <p>Unable to load interest details.</p><button type="button" class="app-button app-button--outline-danger" @click="loadDetail">Retry</button>
      </div>
      <template v-else-if="detail">
        <section class="inspector-section inspector-summary">
          <div class="inspector-field-header"><span>Evidence strength</span><strong>{{ detail.evidenceStrength ?? detail.rawWeight ?? detail.weight }}</strong></div>
          <div v-if="detail.evidenceStrength != null" class="inspector-track" role="progressbar" :aria-label="`${detail.name} evidence strength`"
            :aria-valuenow="detail.evidenceStrength" aria-valuemin="0" aria-valuemax="100">
            <div :class="{ 'inspector-fill--negative': detail.polarity === 'negative' }" :style="{ width: `${detail.evidenceStrength}%` }"></div>
          </div>
          <span class="inspector-label">Last activity</span><strong>{{ formatRelativeDate(detail.lastActivityAt) || 'Unknown' }}</strong>
        </section>
        <section class="inspector-section">
          <h3>Why this interest?</h3><p>{{ interestExplanation(detail) }}</p>
        </section>
        <section v-if="evidenceRows.length" class="inspector-section">
          <h3>Evidence breakdown</h3>
          <div v-for="row in evidenceRows" :key="row.key" class="inspector-evidence-row">
            <span>{{ row.label }}</span><div class="inspector-track" aria-hidden="true"><div :style="{ width: `${row.value / maxEvidence * 100}%` }"></div></div><strong>{{ row.value }}</strong>
          </div>
          <p class="inspector-help">Bars compare counts within this interest, not their scoring weights.</p>
        </section>
        <section class="inspector-section">
          <h3>Example articles</h3>
          <div v-if="detail.representativeArticles?.length" class="interest-example-list">
            <button v-for="article in detail.representativeArticles" :key="article.id" type="button" class="interest-example" @click="$emit('open-article', article.id)">
              <img v-if="usableHttpUrl(article.imageUrl) && !failedImages.has(article.id)" :src="usableHttpUrl(article.imageUrl)" alt="" loading="lazy" @error="failedImages.add(article.id)">
              <span v-else class="interest-example-image-empty" aria-hidden="true"></span>
              <span class="interest-example-content"><strong>{{ article.title }}</strong><span class="interest-example-meta"><span>{{ article.feed?.feedName }}</span><span>{{ formatRelativeDate(article.publishedAt) }}</span></span></span>
            </button>
          </div>
          <p v-else>No example articles are currently available for this interest.</p>
        </section>
      </template>
    </component>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BaseDialog from '../dialogs/BaseDialog.vue';
import { useMediaQuery } from '../../composables/useMediaQuery.js';
import { fetchInterest } from '../../api/interests.js';
import { formatRelativeDate } from '../../utils/date.js';
import { usableHttpUrl } from '../../utils/content.js';
import { interestEvidenceFields, interestExplanation, interestStateLabel } from '../../services/interestPresentation.js';

const props = defineProps({ interest: { type: Object, required: true } });
defineEmits(['close', 'open-article']);
const compact = useMediaQuery('(max-width: 1199px)', () => window.innerWidth < 1200);
const panel = ref(null);
const detail = ref(null);
const detailLoading = ref(true);
const detailError = ref(false);
const failedImages = ref(new Set());
const selectedInterest = computed(() => detail.value || props.interest);
const evidenceRows = computed(() => interestEvidenceFields.filter(field => detail.value?.evidence?.[field.key] != null)
  .map(field => ({ ...field, value: detail.value.evidence[field.key] })));
const maxEvidence = computed(() => Math.max(1, ...evidenceRows.value.map(row => row.value)));
let controller;
let opener = document.activeElement;
async function loadDetail() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  detailLoading.value = true;
  detailError.value = false;
  detail.value = null;
  failedImages.value = new Set();
  try {
    const { data } = await fetchInterest(props.interest.id, request.signal);
    if (!request.signal.aborted) detail.value = data.interest;
  } catch {
    if (!request.signal.aborted) detailError.value = true;
  } finally {
    if (!request.signal.aborted) detailLoading.value = false;
  }
}
watch(() => props.interest.id, () => { opener = document.activeElement; loadDetail(); }, { immediate: true });
onMounted(() => nextTick(() => { if (!compact.value) panel.value?.focus(); }));
onBeforeUnmount(() => { controller?.abort(); if (opener?.isConnected) opener.focus(); });
</script>

<style scoped>
/* Fit inside the Settings dialog after its header, content padding, and sticky offset. */
.interest-inspector { position: sticky; top: 12px; align-self: start; max-height: min(660px, calc(100dvh - 188px)); overflow-y: auto; overscroll-behavior-y: contain; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-card); color: var(--text-primary); }
.interest-inspector-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 10px; }
.interest-inspector-header h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.interest-inspector-badges { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 18px 14px; }
.interest-badge { padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--badge-tag-bg); color: var(--badge-tag-text); }
.interest-badge--positive, .interest-badge--active { background: var(--badge-quality-bg); color: var(--badge-quality-text); }
.interest-badge--negative { background: var(--badge-danger-bg); color: var(--badge-danger-text); }
.interest-badge--muted { background: var(--surface-chrome); color: var(--text-secondary); }
.inspector-section { padding: 16px 18px; border-top: 1px solid var(--border-subtle); }
.inspector-section h3 { margin: 0 0 10px; font-size: 14px; }
.inspector-section p { font-size: 13px; line-height: 1.55; margin: 0; color: var(--text-secondary); }
.inspector-summary { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.inspector-label { margin-top: 10px; color: var(--text-secondary); font-size: 12px; }
.inspector-field-header { display: flex; justify-content: space-between; gap: 10px; }
.inspector-track { height: 6px; border-radius: 999px; overflow: hidden; background: var(--surface-chrome); }
.inspector-track > div { height: 100%; background: var(--color-primary); }
.inspector-track > .inspector-fill--negative { background: var(--color-danger); }
.inspector-evidence-row { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(0, 1fr) auto; gap: 9px; align-items: center; margin-bottom: 10px; font-size: 12px; }
.inspector-section .inspector-help { font-size: 11px; }
.inspector-state { display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: 12px; padding: 24px 18px; color: var(--text-secondary); }
.inspector-error { background: var(--badge-danger-bg); color: var(--badge-danger-text); }
.interest-example-list { display: flex; flex-direction: column; gap: 8px; }
.interest-example { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: start; gap: 10px; width: 100%; padding: 6px; border: 0; border-radius: var(--radius-control); background: var(--color-transparent); color: inherit; text-align: left; cursor: pointer; }
.interest-example:hover { background: var(--surface-hover); }
.interest-example:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
.interest-example img, .interest-example-image-empty { width: 64px; height: 48px; border-radius: var(--radius-compact); object-fit: cover; background: var(--surface-chrome); }
.interest-example-content { min-width: 0; }
.interest-example strong { font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.interest-example-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; color: var(--text-secondary); font-size: 11px; }
.interest-inspector--overlay { position: fixed; inset: 0; max-height: none; border: 0; border-radius: 0; padding: 0; }
.interest-inspector--overlay :deep(.base-dialog__panel) { width: 100%; max-width: none; height: 100dvh; max-height: none; border-radius: 0; }
.interest-inspector--overlay :deep(.base-dialog__header) { padding-top: max(16px, env(safe-area-inset-top)); }
.interest-inspector--overlay :deep(.base-dialog__body) { padding: 0 0 env(safe-area-inset-bottom); }
</style>
