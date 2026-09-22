<template>
  <div class="category-clustering-field">
    <label class="app-form-label" :for="id">Event clustering</label>
    <select
      :id="id"
      v-model="selectedBehavior"
      class="app-form-select"
      :disabled="disabled"
      :aria-describedby="recommendation ? `${id}-help` : undefined"
    >
      <option :value="null">Server default</option>
      <option value="aggressive">Aggressive</option>
      <option value="moderate">Moderate</option>
      <option value="conservative">Conservative</option>
    </select>
    <div v-if="recommendation" :id="`${id}-help`" class="app-form-help">
      {{ recommendation }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'CategoryClusteringSelect',
  props: {
    id: { type: String, required: true },
    modelValue: { type: String, default: null },
    disabled: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  computed: {
    selectedBehavior: {
      get() { return this.modelValue; },
      set(value) { this.$emit('update:modelValue', value); }
    },
    recommendation() {
      return {
        aggressive: 'Recommended for high-volume news',
        moderate: 'Recommended for sports, gaming, and technology',
        conservative: 'Recommended for blogs and niche feeds'
      }[this.modelValue] || '';
    }
  }
};
</script>

<style scoped>
.category-clustering-field {
  margin-top: 1.5rem;
}
</style>
