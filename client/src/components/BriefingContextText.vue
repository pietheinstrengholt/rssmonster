<template>
  <aside class="briefing-context" role="note">
    <div class="briefing-context-text">
      <template v-if="isLoading">{{ loadingText }}</template>
      <template v-else-if="hasContext">
        Based on
        <strong>{{ formatCountLabel(articleCount, 'article') }}</strong>
        from
        <strong>{{ formatCountLabel(sourceCount, 'source') }}</strong><template v-if="hasDetails">,</template><slot></slot>
      </template>
      <template v-else-if="hasError">{{ errorText }}</template>
      <template v-else>{{ emptyText }}</template>
    </div>

    <button
      type="button"
      class="briefing-tune-action"
      @click="$store.data.setShowModal(modalName)"
    >
      <i class="bi bi-sliders2" aria-hidden="true"></i>
      <span>{{ actionLabel }}</span>
    </button>
  </aside>
</template>

<script>
export default {
  name: 'BriefingContextText',
  props: {
    articleCount: {
      type: Number,
      default: null
    },
    sourceCount: {
      type: Number,
      default: null
    },
    isLoading: {
      type: Boolean,
      default: false
    },
    hasError: {
      type: Boolean,
      default: false
    },
    hasDetails: {
      type: Boolean,
      default: false
    },
    loadingText: {
      type: String,
      default: 'Loading selection context…'
    },
    errorText: {
      type: String,
      default: 'Selection context is temporarily unavailable.'
    },
    emptyText: {
      type: String,
      default: 'No selection context is available.'
    },
    actionLabel: {
      type: String,
      required: true
    },
    modalName: {
      type: String,
      required: true
    }
  },
  computed: {
    // This function returns whether both selection statistics are available.
    hasContext() {
      return this.articleCount !== null && this.sourceCount !== null;
    }
  },
  methods: {
    // This function formats a statistic with locale separators and singular/plural wording.
    formatCountLabel(value, label) {
      const count = Number(value) || 0;
      const formattedCount = new Intl.NumberFormat().format(count);
      return `${formattedCount} ${label}${count === 1 ? '' : 's'}`;
    }
  }
};
</script>

<style scoped>
.briefing-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  margin: 0;
  padding: 0.75rem 0.875rem;
  color: #4b5563;
  background-color: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-style: normal;
  line-height: 1.4;
}

.briefing-context-text {
  min-width: 0;
}

.briefing-context strong {
  color: inherit;
  font-weight: 600;
}

.briefing-tune-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  color: #2563eb;
  background: transparent;
  border: 0;
  border-radius: 0.375rem;
  font: inherit;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.briefing-tune-action:hover {
  color: #1d4ed8;
  background-color: rgba(37, 99, 235, 0.08);
}

.briefing-tune-action:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

@media (max-width: 575.98px) and (orientation: portrait) {
  .briefing-context {
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.45;
  }
}

:global(:root[data-theme='dark'] .briefing-context) {
  color: var(--text-secondary, #9ca3af);
  background-color: var(--bg-control, #222836);
  border-color: var(--border-color, #2a3342);
}

:global(:root[data-theme='dark'] .briefing-context strong) {
  color: var(--text-primary, #e5e7eb);
}

:global(:root[data-theme='dark'] .briefing-tune-action) {
  color: var(--color-link, #60a5fa);
}

:global(:root[data-theme='dark'] .briefing-tune-action:hover) {
  color: var(--color-link-hover, #93c5fd);
  background-color: rgba(96, 165, 250, 0.12);
}

:global(:root[data-theme='dark'] .briefing-tune-action:focus-visible) {
  color: var(--color-link-hover, #93c5fd);
  outline-color: var(--border-focus, #60a5fa);
}
</style>
