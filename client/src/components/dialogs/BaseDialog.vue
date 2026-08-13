<template>
  <div class="base-dialog__overlay">
    <section
      ref="dialog"
      class="base-dialog__panel"
      :class="`base-dialog__panel--${size}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="hasDescription ? descriptionId : undefined"
      tabindex="-1"
    >
      <header class="base-dialog__header">
        <div class="base-dialog__heading">
          <h2 :id="titleId" class="base-dialog__title">
            <span v-if="icon" class="base-dialog__title-icon" aria-hidden="true">
              <BootstrapIcon :icon="icon" />
            </span>
            <slot name="title"></slot>
          </h2>
          <p
            v-if="hasDescription"
            :id="descriptionId"
            class="base-dialog__description"
            :class="{ 'base-dialog__description--with-icon': icon }"
          >
            <slot name="description"></slot>
          </p>
        </div>
        <div v-if="hasHeaderActions" class="base-dialog__header-actions">
          <slot name="header-actions"></slot>
          <button
            v-if="showClose"
            type="button"
            class="app-icon-button app-icon-button--compact base-dialog__close"
            :aria-label="closeLabel"
            :disabled="closeDisabled"
            @click="requestClose"
          >
            <BootstrapIcon icon="x-lg" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="base-dialog__body">
        <slot></slot>
      </div>

      <footer v-if="hasFooter" class="base-dialog__footer">
        <slot name="footer"></slot>
      </footer>
    </section>
  </div>
</template>

<script>
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export default {
  name: 'BaseDialog',
  props: {
    size: {
      type: String,
      default: 'md',
      // This function limits dialog widths to the variants supported by the shared shell.
      validator(value) {
        return ['sm', 'md', 'lg', 'xl'].includes(value);
      }
    },
    icon: {
      type: String,
      default: ''
    },
    showClose: {
      type: Boolean,
      default: false
    },
    closeLabel: {
      type: String,
      default: 'Close dialog'
    },
    closeDisabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['close'],
  // This function creates focus restoration and scroll-lock state for this dialog instance.
  data() {
    return {
      previouslyFocusedElement: null,
      previousBodyOverflow: ''
    };
  },
  computed: {
    // This function provides a stable accessible title relationship for this dialog instance.
    titleId() {
      return `base-dialog-title-${this.$.uid}`;
    },
    // This function provides a stable accessible description relationship when one is supplied.
    descriptionId() {
      return `base-dialog-description-${this.$.uid}`;
    },
    // This function avoids rendering empty description markup and ARIA references.
    hasDescription() {
      return Boolean(this.$slots.description);
    },
    // This function renders optional controls without coupling the shell to a close-button design.
    hasHeaderActions() {
      return this.showClose || Boolean(this.$slots['header-actions']);
    },
    // This function avoids rendering an empty footer when a dialog has no actions.
    hasFooter() {
      return Boolean(this.$slots.footer);
    }
  },
  // This function remembers the focused opener before the dialog enters the document.
  beforeMount() {
    this.previouslyFocusedElement = document.activeElement;
  },
  // This function locks page scrolling, owns keyboard handling, and moves focus into the dialog.
  mounted() {
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this.handleDocumentKeydown);
    this.$nextTick(() => this.focusInitialElement());
  },
  // This function removes global effects before the dialog leaves the document.
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleDocumentKeydown);
    document.body.style.overflow = this.previousBodyOverflow;
  },
  // This function restores focus to the connected element that opened the dialog.
  unmounted() {
    if (
      this.previouslyFocusedElement?.isConnected &&
      typeof this.previouslyFocusedElement.focus === 'function'
    ) {
      this.previouslyFocusedElement.focus();
    }
  },
  methods: {
    // This function emits the component's store-agnostic close request.
    requestClose() {
      this.$emit('close');
    },
    // This function returns currently usable focus targets inside the dialog.
    getFocusableElements() {
      const dialog = this.$refs.dialog;
      if (!dialog) return [];

      return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return !element.hidden &&
            !element.closest('[hidden], [aria-hidden="true"]') &&
            element.tabIndex >= 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden';
        });
    },
    // This function moves initial focus to an explicit target, the first control, or the panel.
    focusInitialElement() {
      const dialog = this.$refs.dialog;
      if (!dialog) return;

      const autofocusElement = dialog.querySelector('[autofocus]');
      const focusTarget = autofocusElement || this.getFocusableElements()[0] || dialog;
      focusTarget.focus();
    },
    // This function closes on Escape and keeps Tab navigation within the active dialog.
    handleDocumentKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = this.$refs.dialog;
      const focusableElements = this.getFocusableElements();
      if (!dialog || focusableElements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsOutsideDialog = !dialog.contains(activeElement);

      if (event.shiftKey && (activeElement === firstElement || focusIsOutsideDialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || focusIsOutsideDialog)) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
};
</script>

<style scoped>
.base-dialog__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--layer-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--overlay-backdrop);
}

.base-dialog__panel {
  display: flex;
  width: 100%;
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-modal);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-modal);
}

.base-dialog__panel--sm {
  max-width: 400px;
}

.base-dialog__panel--md {
  max-width: 40rem;
}

.base-dialog__panel--lg {
  max-width: 800px;
}

.base-dialog__panel--xl {
  max-width: 1140px;
}

.base-dialog__header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.125rem;
  border-bottom: 1px solid var(--border-subtle);
}

.base-dialog__heading {
  min-width: 0;
  flex: 1;
}

.base-dialog__header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.base-dialog__title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  color: var(--text-primary);
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.3;
}

.base-dialog__title-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: var(--radius-compact);
  font-size: 1.1rem;
}

.base-dialog__description {
  margin: 0.2rem 0 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.base-dialog__description--with-icon {
  margin-left: 2.75rem;
}

.base-dialog__close:disabled,
:deep(.base-dialog__button:disabled) {
  cursor: wait;
  opacity: 0.6;
}

.base-dialog__body {
  padding: 1rem 1.125rem;
  overflow-y: auto;
}

.base-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.875rem 1.125rem;
  border-top: 1px solid var(--border-subtle);
}

:deep(.base-dialog__button) {
  min-width: 5.5rem;
  min-height: 2.25rem;
  padding: 0.4rem 0.875rem;
  border: 1px solid var(--color-transparent);
  border-radius: var(--radius-compact);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.25;
  cursor: pointer;
}

:deep(.base-dialog__button--secondary) {
  color: var(--text-primary);
  background: var(--bg-card);
  border-color: var(--border-control);
}

:deep(.base-dialog__button--secondary:hover:not(:disabled)) {
  background: var(--bg-hover);
}

:deep(.base-dialog__button--primary) {
  color: var(--text-inverted);
  background: var(--color-primary);
  border-color: var(--color-primary);
}

:deep(.base-dialog__button--primary:hover:not(:disabled)) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

:deep(.base-dialog__button--danger) {
  color: var(--text-inverted);
  background: var(--color-danger);
  border-color: var(--color-danger);
}

:deep(.base-dialog__button--warning) {
  color: var(--text-inverted);
  background: var(--color-warning);
  border-color: var(--color-warning);
}

:global(:root[data-theme='dark']) .base-dialog__panel {
  background: var(--bg-modal);
  border-color: var(--border-default);
  box-shadow: 0 4px 12px var(--shadow-settings-dialog-dark-color);
}

:global(:root[data-theme='dark'] .base-dialog__title-icon) {
  background: var(--color-primary-surface-dark);
}

:global(:root[data-theme='dark']) :deep(.base-dialog__button--secondary) {
  color: var(--text-primary);
  background: var(--bg-control);
  border-color: var(--border-control);
}

@media (max-width: 575.98px) {
  .base-dialog__overlay {
    padding: 0.75rem;
  }

  .base-dialog__panel {
    max-height: calc(100vh - 1.5rem);
    max-height: calc(100dvh - 1.5rem);
  }
}
</style>
