<template>
  <aside v-show="!detailsOpen" class="action-error-notice" :class="{ 'action-error-notice--success': success }" :role="success ? 'status' : 'alert'" aria-atomic="true">
    <BootstrapIcon class="action-error-notice__icon" :icon="success ? 'check-circle-fill' : 'exclamation-circle-fill'" aria-hidden="true" />
    <div class="action-error-notice__messages">
      <button v-if="!success && diagnostics" type="button" class="action-error-notice__details" aria-haspopup="dialog" @click="openDetails">{{ message }}<span>View error details</span></button>
      <p v-else>{{ message }}</p>
      <p v-if="acknowledgment" class="action-error-notice__acknowledgment" role="status">{{ acknowledgment }}</p>
    </div>
    <button v-if="!success && retryAvailable" type="button" class="app-button app-button--secondary app-button--compact" :disabled="retrying" @click="$emit('retry')">{{ retrying ? 'Retrying…' : 'Retry' }}</button>
    <button
      class="action-error-notice__dismiss"
      type="button"
      :aria-label="success ? 'Dismiss notification' : 'Dismiss error'"
      @click="$emit('dismiss')"
    >
      <BootstrapIcon icon="x-lg" aria-hidden="true" />
    </button>
  </aside>
  <Teleport to="body">
    <BaseDialog v-if="detailsOpen" show-close size="lg" @close="detailsOpen = false">
      <template #title>Error details</template>
      <template #description>Copy these details and share them when reporting this error.</template>
      <label class="action-error-details__label" for="action-error-report">Diagnostic report</label>
      <textarea id="action-error-report" class="app-form-control action-error-details__report" readonly :value="openedDiagnostics" @focus="$event.target.select()"></textarea>
      <p v-if="copyStatus" role="status">{{ copyStatus }}</p>
      <template #footer>
        <button type="button" class="app-button app-button--secondary" @click="detailsOpen = false">Close</button>
        <button type="button" class="app-button app-button--primary" @click="copyDetails">Copy details</button>
      </template>
    </BaseDialog>
  </Teleport>
</template>

<script>
import BaseDialog from '../dialogs/BaseDialog.vue';

export default {
  name: 'ActionErrorNotice',
  components: { BaseDialog },
  emits: ['dismiss', 'retry'],
  // Keep the report available until the reader explicitly closes or dismisses it.
  data() { return { detailsOpen: false, openedDiagnostics: '', copyStatus: '' }; },
  props: {
    diagnostics: { type: String, default: '' },
    acknowledgment: { type: String, default: '' },
    retryAvailable: { type: Boolean, default: false },
    retrying: { type: Boolean, default: false },
    success: { type: Boolean, default: false },
    message: {
      type: String,
      required: true
    }
  },
  methods: {
    // Keep the selected report stable even if another background failure arrives while it is open.
    openDetails() { this.openedDiagnostics = this.diagnostics; this.copyStatus = ''; this.detailsOpen = true; },
    // Readers can still select the report manually when browser clipboard access is unavailable.
    async copyDetails() {
      try {
        await navigator.clipboard.writeText(this.openedDiagnostics);
        this.copyStatus = 'Details copied.';
      } catch {
        this.copyStatus = 'Could not copy automatically. Select the report above and copy it manually.';
      }
    }
  }
};
</script>

<style scoped>
.action-error-notice {
  align-items: flex-start;
  background: var(--surface-card);
  border: 1px solid var(--border-danger);
  border-left: 3px solid var(--border-danger-strong);
  border-radius: var(--radius-control);
  bottom: 20px;
  box-shadow: var(--shadow-modal);
  color: var(--text-primary);
  display: flex;
  gap: 10px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 12px 12px 12px 14px;
  position: fixed;
  right: 20px;
  z-index: var(--layer-notification);
}

.action-error-notice__icon {
  color: var(--text-danger);
  flex: 0 0 auto;
  margin-top: 2px;
}

.action-error-notice__messages {
  flex: 1;
  min-width: 0;
}

.action-error-notice__details {
  background: var(--color-transparent);
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-ui-default);
  line-height: 1.4;
  padding: 0;
  text-align: start;
}

.action-error-notice__details span {
  display: block;
  text-decoration: underline;
  color: var(--text-secondary);
}

.action-error-notice__details:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.action-error-details__label { display: block; margin-bottom: 8px; }
.action-error-details__report { width: 100%; min-height: 40vh; resize: vertical; font-family: monospace; }

.action-error-notice p {
  font-size: var(--font-size-ui-default);
  line-height: 1.4;
  margin: 0;
}

.action-error-notice .action-error-notice__acknowledgment {
  color: var(--color-success);
  margin-top: 8px;
}

.action-error-notice__dismiss {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  color: var(--text-secondary);
  display: inline-flex;
  flex: 0 0 auto;
  height: 28px;
  justify-content: center;
  margin: -5px -5px -5px 0;
  padding: 0;
  width: 28px;
}

.action-error-notice__dismiss:hover {
  color: var(--text-primary);
}

@media (max-width: 879px) {
  .action-error-notice {
    bottom: 16px;
    left: 16px;
    right: 16px;
  }
}

:global(:root[data-theme='dark']) .action-error-notice {
  background: var(--surface-chrome);
  border-color: var(--border-danger);
  border-left-color: var(--border-danger-strong);
}
.action-error-notice--success,
:global(:root[data-theme='dark']) .action-error-notice--success {
  border-color: var(--border-success);
  border-left-color: var(--border-success-strong);
}
.action-error-notice--success .action-error-notice__icon { color: var(--color-success); }
</style>
