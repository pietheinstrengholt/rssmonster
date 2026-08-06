<template>
  <BaseDialog
    :size="size"
    icon="sliders2"
    show-close
    :close-label="closeLabel"
    :close-disabled="saving"
    @close="requestClose"
  >
    <template #title>
      <span class="preferences-dialog__title">{{ title }}</span>
    </template>

    <template #description>
      {{ description }}
    </template>

    <slot></slot>

    <template #footer>
      <div class="preferences-dialog__footer">
        <div v-if="hasFooterStart" class="preferences-dialog__footer-start">
          <slot name="footer-start"></slot>
        </div>

        <div class="preferences-dialog__footer-actions">
          <button
            class="app-button app-button--secondary preferences-dialog__button preferences-dialog__button--secondary"
            type="button"
            :disabled="saving"
            @click="requestClose"
          >
            {{ cancelLabel }}
          </button>
          <button
            class="app-button app-button--primary preferences-dialog__button preferences-dialog__button--primary"
            type="submit"
            :form="formId"
            :disabled="submitDisabled || saving"
            :aria-busy="saving ? 'true' : 'false'"
          >
            {{ saving ? pendingLabel : confirmLabel }}
          </button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script>
import BaseDialog from './BaseDialog.vue';

export default {
  name: 'PreferencesDialogShell',
  components: {
    BaseDialog
  },
  props: {
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    formId: {
      type: String,
      required: true
    },
    size: {
      type: String,
      default: 'md'
    },
    closeLabel: {
      type: String,
      default: 'Close preferences'
    },
    cancelLabel: {
      type: String,
      default: 'Cancel'
    },
    confirmLabel: {
      type: String,
      default: 'Save changes'
    },
    pendingLabel: {
      type: String,
      default: 'Saving…'
    },
    saving: {
      type: Boolean,
      default: false
    },
    submitDisabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['close'],
  computed: {
    // Renders optional leading footer content without changing feature behavior.
    hasFooterStart() {
      return Boolean(this.$slots['footer-start']);
    }
  },
  methods: {
    // Prevents user dismissal while the owning feature is saving.
    requestClose() {
      if (this.saving) return;

      this.$emit('close');
    }
  }
};
</script>

<style scoped>
.preferences-dialog__footer {
  display: flex;
  width: 100%;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
}

.preferences-dialog__footer-start {
  min-width: 0;
}

.preferences-dialog__footer-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-left: auto;
}

@media (max-width: 575.98px) {
  .preferences-dialog__footer,
  .preferences-dialog__footer-actions {
    width: 100%;
  }

  .preferences-dialog__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .preferences-dialog__footer-actions {
    order: -1;
  }

  .preferences-dialog__footer-actions .app-button {
    flex: 1;
  }
}
</style>
