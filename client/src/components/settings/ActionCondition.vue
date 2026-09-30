<template>
  <div class="action-condition">
    <label class="condition-mode"><input type="checkbox" :checked="advanced" :disabled="disabled" @change="changeMode($event.target.checked)" /> Advanced condition (regular expression)</label>
    <label :for="`action-condition-${id}`">{{ advanced ? 'Regular expression' : 'When an article contains' }}</label>
    <input :id="`action-condition-${id}`" class="app-form-control settings-control" type="text" :value="advanced ? modelValue : phrase" :placeholder="advanced ? 'e.g., /keyword|phrase/i' : 'e.g., climate change'" :disabled="disabled" :aria-describedby="`action-condition-help-${id}`" @input="update($event.target.value)" />
    <p :id="`action-condition-help-${id}`">{{ advanced ? 'Tests each title, content field, summary and link separately. Use a plain pattern or /pattern/flags.' : 'Matches this phrase anywhere in titles, content, summaries or links, ignoring capitalization. Punctuation is treated literally.' }}</p>
    <div v-if="$slots.default" class="condition-outcome"><slot /></div>
    <button type="button" class="app-button app-button--outline-secondary app-button--compact" :disabled="disabled || loading || !modelValue.trim()" @click="preview">{{ loading ? 'Checking articles…' : 'Preview matches' }}</button>
    <p class="preview-help">Preview checks up to 100 recent articles in your library, using your score filters. It does not change articles or save this action.</p>
    <InlineActionError v-if="error" :message="error" :busy="loading || disabled" @retry="preview" />
    <div v-if="result" class="condition-preview" role="status" aria-live="polite">
      <p v-if="!result.checked">No articles available to preview yet. Add a feed or refresh your subscriptions, then try again.</p>
      <template v-else>
        <p><strong>{{ result.matched }} {{ result.matched === 1 ? 'match' : 'matches' }}</strong> among {{ result.checked }} recent articles.</p>
        <p v-if="!result.matched">Try a different phrase or a broader condition. Future articles may still match.</p>
        <ul v-else><li v-for="article in result.articles" :key="article.id">{{ article.title || 'Untitled article' }}</li></ul>
        <p v-if="result.matched > result.articles.length">Showing the first {{ result.articles.length }} matches.</p>
      </template>
      <p>Based on saved article text. Incoming content and other actions may affect the final result.</p>
    </div>
  </div>
</template>

<script>
import { previewAction } from '../../api/actions';
import { expressionPhrase, phraseExpression } from '../../services/actionConditions.js';
import InlineActionError from '../shared/InlineActionError.vue';

export default {
  components: { InlineActionError },
  props: {
    modelValue: { type: String, default: '' },
    id: { type: Number, required: true },
    disabled: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  data() {
    return { advanced: expressionPhrase(this.modelValue) === null, loading: false, result: null, error: '', requestId: 0 };
  },
  computed: {
    phrase() { return expressionPhrase(this.modelValue) ?? ''; }
  },
  watch: {
    modelValue() {
      this.requestId++;
      this.loading = false;
      this.result = null;
      this.error = '';
      if (expressionPhrase(this.modelValue) === null) this.advanced = true;
    }
  },
  beforeUnmount() { this.requestId++; },
  methods: {
    update(value) { this.$emit('update:modelValue', this.advanced ? value : phraseExpression(value)); },
    changeMode(advanced) {
      this.advanced = advanced;
      if (!advanced && expressionPhrase(this.modelValue) === null) this.$emit('update:modelValue', '');
    },
    async preview() {
      if (this.disabled || this.loading || !this.modelValue.trim()) return;
      const requestId = ++this.requestId;
      this.loading = true;
      this.error = '';
      this.result = null;
      try {
        const response = await previewAction(this.modelValue);
        if (requestId === this.requestId) this.result = response.data;
      } catch (error) {
        if (requestId === this.requestId) this.error = error.response?.data?.error || 'Could not preview matches. Your condition is still here. Try again.';
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    }
  }
};
</script>

<style scoped>
.action-condition { grid-column: 1 / -1; min-width: 0; }
.action-condition label { display: block; margin-bottom: 6px; color: var(--text-primary); font-size: 13px; font-weight: 600; }
.action-condition .condition-mode { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-secondary); font-weight: 400; }
.action-condition > input { width: 100%; }
.action-condition p { margin: 8px 0 12px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.condition-outcome { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-block: 16px; }
@media (max-width: 879px) { .condition-outcome { grid-template-columns: 1fr; } }
.condition-preview { margin-top: 12px; padding: 12px; background: var(--surface-control); border: 1px solid var(--border-default); border-radius: var(--radius-control); overflow-wrap: anywhere; }
.condition-preview ul { margin: 8px 0; padding-left: 20px; }
.condition-preview li { margin-bottom: 8px; color: var(--text-primary); }
</style>
