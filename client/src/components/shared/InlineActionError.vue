<template>
  <div class="inline-action-error" role="alert">
    <p>{{ message }}</p>
    <button type="button" class="app-button app-button--secondary app-button--compact" :disabled="busy" @click="$emit('retry')">{{ busy ? 'Retrying…' : 'Retry' }}</button>
  </div>
</template>

<script>
export default {
  props: {
    message: { type: String, required: true },
    busy: { type: Boolean, default: false }
  },
  emits: ['retry']
};
</script>

<style scoped>
.inline-action-error { flex: 1 0 100%; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-block: 1rem; padding: 0.75rem; border: 1px solid var(--border-danger); border-radius: var(--radius-control); color: var(--text-danger); }
.inline-action-error p { flex: 1 1 15rem; margin: 0; }
</style>
