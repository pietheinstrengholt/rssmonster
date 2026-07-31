<template>
  <BaseDialog
    :size="size"
    :icon="dialogIcon"
    show-close
    :close-disabled="busy"
    @close="requestClose"
  >
    <template #title>{{ title }}</template>

    <div class="confirm-dialog__message" :aria-busy="busy ? 'true' : 'false'">
      <slot></slot>
    </div>

    <template #footer>
      <button
        type="button"
        class="base-dialog__button base-dialog__button--secondary btn btn-secondary confirm-dialog__cancel"
        :disabled="busy"
        autofocus
        @click="requestCancel"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="base-dialog__button btn confirm-dialog__confirm"
        :class="[confirmButtonClass, dialogButtonClass]"
        :disabled="busy"
        @click="requestConfirm"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </BaseDialog>
</template>

<script>
import BaseDialog from './BaseDialog.vue';

export default {
  name: 'ConfirmDialog',
  components: {
    BaseDialog
  },
  props: {
    title: {
      type: String,
      required: true
    },
    confirmLabel: {
      type: String,
      default: 'Confirm'
    },
    cancelLabel: {
      type: String,
      default: 'Cancel'
    },
    variant: {
      type: String,
      default: 'danger',
      // This function limits confirmations to established destructive visual treatments.
      validator(value) {
        return ['danger', 'warning'].includes(value);
      }
    },
    busy: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: 'md',
      // This function forwards only widths supported by the shared dialog shell.
      validator(value) {
        return ['sm', 'md', 'lg', 'xl'].includes(value);
      }
    }
  },
  emits: ['confirm', 'cancel', 'close'],
  computed: {
    // This function gives destructive confirmations a consistent shared header icon.
    dialogIcon() {
      return this.variant === 'warning' ? 'exclamation-triangle' : 'exclamation-triangle-fill';
    },
    // This function maps destructive intent to the shared dialog action treatment.
    dialogButtonClass() {
      return this.variant === 'warning'
        ? 'base-dialog__button--warning'
        : 'base-dialog__button--danger';
    },
    // This function maps destructive intent to the corresponding Bootstrap action treatment.
    confirmButtonClass() {
      return this.variant === 'warning' ? 'btn-warning' : 'btn-danger';
    }
  },
  methods: {
    // This function requests confirmation only while no operation is already in progress.
    requestConfirm() {
      if (this.busy) return;

      this.$emit('confirm');
    },
    // This function distinguishes an explicit cancel action from other close requests.
    requestCancel() {
      if (this.busy) return;

      this.$emit('cancel');
    },
    // This function forwards shell close requests unless an irreversible action is in progress.
    requestClose() {
      if (this.busy) return;

      this.$emit('close');
    }
  }
};
</script>
