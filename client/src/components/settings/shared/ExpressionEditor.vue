<template>
  <div class="expression-editor" :class="{ 'expression-editor--readonly': readonly }">
    <template v-if="readonly">
      <div class="expression-editor__preview">
        <span>{{ label }}</span>
        <code :class="{ 'input-invalid': !validation.valid }" :title="validation.error || modelValue">{{ modelValue }}</code>
        <button
          v-if="copyable"
          type="button"
          class="app-button app-button--icon-only expression-editor__copy"
          :title="copyLabel"
          :aria-label="copyLabel"
          @click="copyExpression"
        >
          <BootstrapIcon icon="copy" aria-hidden="true" />
        </button>
      </div>
      <p v-if="!validation.valid" class="expression-editor__validation" role="alert">
        <BootstrapIcon icon="exclamation-circle-fill" aria-hidden="true" />
        {{ validation.error }}
      </p>
    </template>

    <template v-else>
      <label class="expression-editor__field" :for="inputId">
        <span class="app-form-label">{{ label }}</span>
        <textarea
          :id="inputId"
          class="app-form-control"
          :value="modelValue"
          :rows="rows"
          :maxlength="maxlength"
          :placeholder="placeholder"
          spellcheck="false"
          :aria-invalid="showValidation && !validation.valid ? 'true' : 'false'"
          :aria-describedby="describedBy"
          @input="updateValue"
        ></textarea>
      </label>
      <div class="expression-editor__meta">
        <p :id="helpId" class="app-form-help">
          <slot name="help">Use Smart Folder expression syntax. Examples: <code>tag:ai</code>, <code>unread:true</code>, <code>quality:&gt;=0.6 sort:quality</code>.</slot>
        </p>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="requestValidation">
          Validate
        </button>
      </div>
      <p
        v-if="showValidation"
        :id="validationId"
        class="expression-editor__validation"
        :class="{ 'expression-editor__validation--valid': validation.valid }"
        :role="validation.valid ? 'status' : 'alert'"
      >
        <BootstrapIcon :icon="validation.valid ? 'check-circle-fill' : 'exclamation-circle-fill'" aria-hidden="true" />
        {{ validation.valid ? 'Valid expression' : validation.error }}
      </p>
    </template>
  </div>
</template>

<script>
import { useId } from 'vue';
import { validateSmartFolderQuery } from '../../../services/queryValidation.js';

export default {
  name: 'ExpressionEditor',
  emits: ['copied', 'update:modelValue', 'validation-change'],
  props: {
    modelValue: { type: String, default: '' },
    label: { type: String, default: 'Expression' },
    placeholder: { type: String, default: 'tag:ai quality:>=0.6 sort:quality' },
    rows: { type: Number, default: 5 },
    maxlength: { type: Number, default: 4096 },
    readonly: { type: Boolean, default: false },
    copyable: { type: Boolean, default: false },
    copyLabel: { type: String, default: 'Copy expression' },
    forceValidation: { type: Boolean, default: false }
  },
  setup() {
    return { expressionEditorId: useId() };
  },
  data() {
    return { validationRequested: false };
  },
  computed: {
    inputId() {
      return `expression-editor-${this.expressionEditorId}`;
    },
    helpId() {
      return `${this.inputId}-help`;
    },
    validationId() {
      return `${this.inputId}-validation`;
    },
    validation() {
      return validateSmartFolderQuery(this.modelValue);
    },
    showValidation() {
      return this.forceValidation || this.validationRequested;
    },
    describedBy() {
      return this.showValidation ? `${this.helpId} ${this.validationId}` : this.helpId;
    }
  },
  watch: {
    validation: {
      immediate: true,
      handler(validation) {
        this.$emit('validation-change', validation);
      }
    }
  },
  methods: {
    updateValue(event) {
      this.validationRequested = false;
      this.$emit('update:modelValue', event.target.value);
    },
    requestValidation() {
      this.validationRequested = true;
    },
    async copyExpression() {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(this.modelValue);
      this.$emit('copied', this.modelValue);
    }
  }
};
</script>

<style scoped>
.expression-editor {
  min-width: 0;
}

.expression-editor__field {
  display: block;
}

.expression-editor__field textarea {
  min-height: 126px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.expression-editor__meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.expression-editor__meta .app-form-help {
  margin-bottom: 0;
}

.expression-editor__meta code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.expression-editor__validation {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  color: var(--settings-danger-text);
  font-size: 12px;
}

.expression-editor__validation--valid {
  color: var(--settings-success-text);
}

.expression-editor__preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-card);
}

.expression-editor__preview > span {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.expression-editor__preview code {
  overflow: hidden;
  padding: 6px 9px;
  border-radius: var(--radius-control);
  background: var(--settings-query-code-bg);
  color: var(--settings-query-code-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(:root[data-theme='dark']) .expression-editor__preview {
  border-color: var(--border-default);
  background: var(--bg-modal);
}

@media (max-width: 760px) {
  .expression-editor__meta {
    align-items: stretch;
    flex-direction: column;
  }

  .expression-editor__meta .app-button {
    align-self: flex-start;
  }

  .expression-editor__preview {
    grid-template-columns: 1fr auto;
  }

  .expression-editor__preview > span {
    grid-column: 1 / -1;
  }
}
</style>
