<template>
  <div ref="contextBar" class="unread-selection-context" :class="{ 'unread-selection-context--reader': readerMode }">
    <div class="unread-selection-context__surface">
      <div class="unread-selection-context__summary">
        <span class="unread-selection-context__meta">
          Based on <strong>{{ articleCount.toLocaleString() }}</strong> {{ articleCount === 1 ? 'article' : 'articles' }} from <strong>{{ sourceCount.toLocaleString() }}</strong> {{ sourceCount === 1 ? 'source' : 'sources' }}
        </span>
        <div class="unread-selection-context__date-group">
          <span class="unread-selection-context__divider" aria-hidden="true"></span>
          <AppDropdown ref="dateDropdown" class="unread-selection-context__date-filter">
            <template #trigger="{ triggerProps }">
              <button v-bind="triggerProps" type="button" class="unread-selection-context__date-trigger" :aria-label="`Article date range: ${selectedDateRangeOption.label}`">
                <BootstrapIcon icon="calendar3" context="control" aria-hidden="true" />
                <span>{{ selectedDateRangeOption.label }}</span>
                <BootstrapIcon icon="chevron-down" context="control" aria-hidden="true" />
              </button>
            </template>
            <template #menu="{ menuProps }">
              <div v-bind="menuProps">
                <button v-for="option in dateRangeOptions" :key="option.value" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': selectionStore.dateRange === option.value }" role="menuitemradio" :aria-checked="selectionStore.dateRange === option.value" @click="selectDateRange(option.value)">
                  <span class="unread-selection-context__date-check" aria-hidden="true">{{ selectionStore.dateRange === option.value ? '✓' : '' }}</span>
                  {{ option.label }}
                </button>
              </div>
            </template>
          </AppDropdown>
          <div class="unread-selection-context__age-cutoff" role="group" aria-label="Article age">
            <button
              v-for="option in ageCutoffOptions"
              :key="option.value"
              type="button"
              class="unread-selection-context__age-button"
              :aria-pressed="selectionStore.ageCutoff === option.value"
              @click="selectAgeCutoff(option.value)"
            >{{ option.label }}</button>
          </div>
          <time v-if="dateContext" :datetime="dateContext.isoDate">{{ dateContext.longLabel }}</time>
        </div>
      </div>
      <form v-if="editingCustomDate" class="unread-selection-context__custom-date" aria-label="Custom article date range" @submit.prevent="applyCustomRange" @keydown.esc.stop.prevent="cancelCustomRange">
        <label>Start date <input ref="customStartInput" v-model="customStart" type="date" required :max="customEnd || undefined" /></label>
        <label>End date <input v-model="customEnd" type="date" required :min="customStart || undefined" /></label>
        <button type="submit" class="unread-selection-context__age-button" :disabled="!customRangeValid">Apply</button>
        <button type="button" class="unread-selection-context__age-button" @click="cancelCustomRange">Cancel</button>
      </form>
    </div>
  </div>
</template>

<script>
import { computed, nextTick, ref } from 'vue';
import { useSelectionStore } from '../../store/selection.js';
import AppDropdown from '../shared/AppDropdown.vue';
import { articleDateRangeOptions, resolveArticleDateRange } from '../../services/articleDateRange.js';
import { ageCutoffOptionsForOldest } from '../../services/articleAgeCutoff.js';
import { useStickyArticleDate } from '../../composables/useStickyArticleDate.js';
import { articleDateContext } from '../../utils/date.js';

export default {
  name: 'UnreadSelectionContext',
  components: { AppDropdown },
  props: {
    articleCount: { type: Number, required: true },
    sourceCount: { type: Number, required: true },
    oldestPublishedAt: { type: [String, Date], default: null },
    readerMode: { type: Boolean, default: false },
    articles: { type: Array, default: () => [] },
    getArticleElement: { type: Function, default: () => null }
  },
  setup(props) {
    const contextBar = ref(null);
    const selectionStore = useSelectionStore();
    const dateDropdown = ref(null);
    const customStartInput = ref(null);
    const editingCustomDate = ref(false);
    const customStart = ref('');
    const customEnd = ref('');
    const customRangeValid = computed(() => Boolean(resolveArticleDateRange('custom', { start: customStart.value, end: customEnd.value })));
    const cancelCustomRange = () => {
      editingCustomDate.value = false;
      nextTick(() => dateDropdown.value?.getTrigger()?.focus());
    };
    const selectAgeCutoff = value => {
      editingCustomDate.value = false;
      selectionStore.setAgeCutoff(value);
    };
    const selectDateRange = value => {
      if (value === 'custom') {
        customStart.value = selectionStore.customDateRange.start;
        customEnd.value = selectionStore.customDateRange.end;
        editingCustomDate.value = true;
        nextTick(() => customStartInput.value?.focus());
      } else {
        editingCustomDate.value = false;
        selectionStore.setDateRange(value);
      }
    };
    const applyCustomRange = () => {
      if (selectionStore.setDateRange('custom', { start: customStart.value, end: customEnd.value })) cancelCustomRange();
    };
    const { activeDate } = useStickyArticleDate(props, contextBar);
    return {
      contextBar,
      selectionStore,
      dateDropdown,
      customStartInput,
      editingCustomDate,
      customStart,
      customEnd,
      customRangeValid,
      selectDateRange,
      selectAgeCutoff,
      applyCustomRange,
      cancelCustomRange,
      dateRangeOptions: articleDateRangeOptions,
      selectedDateRangeOption: computed(() => articleDateRangeOptions.find(option => option.value === selectionStore.dateRange)),
      ageCutoffOptions: computed(() => ageCutoffOptionsForOldest(props.oldestPublishedAt)),
      dateContext: computed(() => articleDateContext(activeDate.value))
    };
  }
};
</script>

<style scoped>
.unread-selection-context {
  width: 100%;
  padding: 0.5rem 0.875rem;
  background: var(--reader-list-item-background);
  border-bottom: 1px solid var(--reader-list-item-border);
}
.unread-selection-context--reader { padding-inline: 0; }
.unread-selection-context__surface {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--briefing-context-border);
  border-radius: var(--radius-control);
  background: var(--briefing-context-surface);
  color: var(--briefing-supporting-text);
  font-size: var(--font-size-ui-default);
  line-height: 1.4;
}
.unread-selection-context__summary,
.unread-selection-context__date-group { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; min-width: 0; }
.unread-selection-context__summary { flex: 1 1 auto; }
.unread-selection-context__meta strong { color: var(--text-primary); font-weight: 600; }
.unread-selection-context__divider { width: 1px; height: 1.25rem; flex: 0 0 auto; background: var(--border-subtle); }
.unread-selection-context--reader .unread-selection-context__divider { display: none; }
.unread-selection-context--reader .unread-selection-context__date-group > time { flex-basis: 100%; }
.unread-selection-context__date-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: var(--control-height-compact);
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--color-transparent);
  font: inherit;
  cursor: pointer;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-link);
  font-weight: 600;
  white-space: nowrap;
}
.unread-selection-context__date-filter { flex: 0 0 auto; }
.unread-selection-context__date-trigger:hover { background: var(--briefing-context-action-hover-surface); }
.unread-selection-context__date-trigger:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.unread-selection-context__date-filter .app-dropdown__item { --app-dropdown-hover-background: var(--surface-hover); --app-dropdown-hover-color: var(--text-primary); --app-dropdown-active-background: var(--color-primary-soft); --app-dropdown-active-color: var(--color-link); }
.unread-selection-context__date-check { display: inline-block; width: 1rem; text-align: center; }
.unread-selection-context__custom-date { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem; flex-basis: 100%; }
.unread-selection-context__custom-date label { display: grid; gap: 0.25rem; }
.unread-selection-context__custom-date input { min-height: var(--control-height-compact); max-width: 100%; padding: 0.25rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-compact); background: var(--surface-card); color: var(--text-primary); font: inherit; }
.unread-selection-context__custom-date input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.unread-selection-context__custom-date button:disabled { opacity: 0.6; cursor: default; }
.unread-selection-context__age-cutoff { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
.unread-selection-context__age-button {
  min-height: var(--control-height-compact);
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.unread-selection-context__age-button:hover { border-color: var(--color-link); color: var(--color-link); }
.unread-selection-context__age-button[aria-pressed='true'] { border-color: var(--color-primary); background: var(--color-primary); color: var(--text-inverted); }
.unread-selection-context__age-button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
@media (max-width: 1069px), (max-height: 560px) and (min-width: 480px) {
  .unread-selection-context__date-group > time { display: none; }
}
@media (max-width: 875px), (max-height: 560px) and (min-width: 480px) {
  .unread-selection-context__meta { display: none; }
}
@media (max-width: 767px), (max-height: 560px) and (min-width: 480px) {
  .unread-selection-context { padding: 0.375rem 0.5rem; }
  .unread-selection-context__surface { gap: 0.375rem; padding: 0.5rem; }
  .unread-selection-context__divider { display: none; }
  .unread-selection-context__summary { flex: 0 1 auto; }
  .unread-selection-context__date-group,
  .unread-selection-context__age-cutoff { gap: 0.25rem; }
  .unread-selection-context__date-trigger,
  .unread-selection-context__age-button { height: var(--control-height-compact); padding-inline: 0.5rem; }
}
:global(:root[data-theme='dark'] .unread-selection-context) { background: var(--surface-page); border-bottom-color: var(--border-subtle); }
</style>
