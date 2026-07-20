<template>
  <div class="daily-briefing-intro">
    <aside class="briefing-context" role="note">
      <div class="briefing-context-text">
        <template v-if="isLoading">Loading briefing context…</template>
        <template v-else-if="context">
          Based on
          <strong>{{ formatCountLabel(context.articleCount, 'article') }}</strong>
          from
          <strong>{{ formatCountLabel(context.sourceCount, 'source') }}</strong>,
          across
          <strong>{{ formatCountLabel(context.eventCount, 'event') }}</strong>
          including
          <strong>{{ formatCountLabel(context.newEventCount, 'new event') }}</strong>,
          <strong>{{ formatCountLabel(context.topicCount, 'topic') }}</strong>
          and
          <strong>{{ formatCountLabel(context.islandCount, 'interest area') }}</strong>
        </template>
        <template v-else-if="loadError">Briefing context is temporarily unavailable.</template>
        <template v-else>No briefing context is available for this period.</template>
      </div>

      <button
        type="button"
        class="briefing-tune-action"
        @click="$store.data.setShowModal('BriefingPreferences')"
      >
        <i class="bi bi-sliders2" aria-hidden="true"></i>
        <span>Tune your briefing</span>
      </button>
    </aside>

    <section
      class="briefing-morning-summary"
      aria-labelledby="briefing-morning-title"
    >
      <div class="briefing-morning-summary-icon" aria-hidden="true">
        <i class="bi bi-sunrise-fill"></i>
      </div>

      <div class="briefing-morning-summary-content">
        <h2
          id="briefing-morning-title"
          class="briefing-morning-summary-title"
        >
          The stories shaping your morning
        </h2>

        <div v-if="!readerMode" class="briefing-morning-summary-text">
          <p v-if="isLoading">Loading the stories shaping your briefing…</p>
          <p v-else-if="loadError">The morning summary is temporarily unavailable.</p>
          <template v-else>
            <p
              v-for="item in summaryItems"
              :key="`${item.eventId}-${item.representativeArticleId}`"
            >
              <strong class="briefing-summary-headline">{{ item.headline }}</strong>
              <span v-if="item.text" class="briefing-summary-excerpt">{{ item.text }}</span>
            </p>
            <p v-if="!summaryItems.length">No briefing summary is available for this period.</p>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { fetchDailyBriefing } from '../api/articles';

export default {
  props: {
    readerMode: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      briefing: null,
      isLoading: true,
      loadError: false,
      activeRequestId: 0
    };
  },
  computed: {
    // This function maps the existing briefing query to the API period convention.
    briefingPeriod() {
      const search = String(this.$store.data.currentSelection.search || '').toLowerCase();
      return search.includes('@today') ? '24h' : '7d';
    },
    // This function maps the existing unread query filter to the API status convention.
    briefingStatus() {
      const search = String(this.$store.data.currentSelection.search || '').toLowerCase();
      return search.includes('unread:true') ? 'unread' : 'all';
    },
    // This function provides one reactive key for reloading all configured Briefing filters.
    briefingRequestSignature() {
      const revision = Number(this.$store.data.currentSelection.briefingRevision || 0);
      return `${this.briefingPeriod}:${this.briefingStatus}:${revision}`;
    },
    // This function returns the context statistics from the latest briefing response.
    context() {
      return this.briefing?.context || null;
    },
    // This function returns the structured morning-summary items from the latest response.
    summaryItems() {
      return this.briefing?.morningSummary?.items || [];
    }
  },
  watch: {
    // This function reloads the briefing if a configured selection filter changes.
    briefingRequestSignature() {
      this.loadBriefing();
    }
  },
  created() {
    this.loadBriefing();
  },
  beforeUnmount() {
    this.activeRequestId++;
  },
  methods: {
    // This function loads the structured context and morning summary for the active period.
    async loadBriefing() {
      const requestId = ++this.activeRequestId;
      this.isLoading = true;
      this.loadError = false;

      try {
        const response = await fetchDailyBriefing({
          period: this.briefingPeriod,
          status: this.briefingStatus
        });

        if (requestId !== this.activeRequestId) return;
        this.briefing = response.data;
      } catch (error) {
        if (requestId !== this.activeRequestId) return;
        console.error('Error loading Daily Briefing:', error);
        this.briefing = null;
        this.loadError = true;
      } finally {
        if (requestId === this.activeRequestId) {
          this.isLoading = false;
        }
      }
    },
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
.daily-briefing-intro {
  width: 100%;
  flex: 0 0 auto;
  padding: 0.875rem;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.briefing-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  margin: 0 0 0.875rem;
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
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.briefing-tune-action:hover {
  color: #1d4ed8;
  background-color: rgba(37, 99, 235, 0.08);
  text-decoration: none;
}

.briefing-tune-action:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.briefing-morning-summary {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 1rem;
  color: #374151;
  background: linear-gradient(
    90deg,
    rgba(255, 247, 237, 0.96) 0%,
    rgba(255, 251, 245, 0.82) 48%,
    rgba(255, 247, 237, 0.96) 100%
  );
  border: 1px solid #fed7aa;
  border-radius: 0.5rem;
}

.briefing-morning-summary-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  color: #f97316;
  font-size: 2rem;
  line-height: 1;
}

.briefing-morning-summary-content {
  min-width: 0;
}

.briefing-morning-summary-title {
  margin: 0 0 0.375rem;
  color: #111827;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.25;
}

.briefing-morning-summary-text {
  display: grid;
  gap: 0.2rem;
  color: #4b5563;
  font-size: 0.875rem;
  line-height: 1.45;
}

.briefing-morning-summary-text p {
  margin: 0;
}

.briefing-summary-headline {
  display: block;
  color: #111827;
  font-weight: 600;
}

.briefing-summary-excerpt {
  display: block;
  margin-top: 0.125rem;
}

@media (max-width: 575.98px) and (orientation: portrait) {
  .daily-briefing-intro {
    padding: 0.75rem;
  }

  .briefing-context {
    margin-bottom: 0.75rem;
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .briefing-morning-summary {
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    padding: 0.875rem;
  }

  .briefing-morning-summary-icon {
    width: 2rem;
    height: 2rem;
    font-size: 1.5rem;
  }

  .briefing-morning-summary-title {
    font-size: 1rem;
  }

  .briefing-morning-summary-text {
    font-size: 0.8125rem;
  }

  .briefing-summary-excerpt {
    display: none;
  }
}

:global(:root[data-theme='dark'] .daily-briefing-intro) {
  color: var(--text-primary);
  background-color: var(--dark-page-surface, #0b0f14);
  border-bottom-color: var(--border-color, #2a3342);
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
  background-color: transparent;
}

:global(:root[data-theme='dark'] .briefing-tune-action:hover) {
  color: var(--color-link-hover, #93c5fd);
  background-color: rgba(96, 165, 250, 0.12);
}

:global(:root[data-theme='dark'] .briefing-tune-action:focus-visible) {
  color: var(--color-link-hover, #93c5fd);
  outline-color: var(--border-focus, #60a5fa);
}

:global(:root[data-theme='dark'] .briefing-morning-summary) {
  color: var(--text-secondary, #9ca3af);
  background: linear-gradient(
    90deg,
    rgba(67, 42, 29, 0.7) 0%,
    rgba(42, 34, 31, 0.82) 50%,
    rgba(67, 42, 29, 0.7) 100%
  );
  border-color: #7c4a2d;
}

:global(:root[data-theme='dark'] .briefing-morning-summary-icon) {
  color: #fb923c;
}

:global(:root[data-theme='dark'] .briefing-morning-summary-title) {
  color: var(--text-primary, #e5e7eb);
}

:global(:root[data-theme='dark'] .briefing-summary-headline) {
  color: var(--text-primary, #e5e7eb);
}

:global(:root[data-theme='dark'] .briefing-morning-summary-text),
:global(:root[data-theme='dark'] .briefing-summary-excerpt) {
  color: var(--text-secondary, #9ca3af);
}
</style>
