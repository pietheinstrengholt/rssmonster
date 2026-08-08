<template>
  <article class="settings-metric-card">
    <span class="settings-metric-label">{{ label }}</span>
    <strong>{{ value }}</strong>
  </article>
</template>

<style scoped>
.settings-metric-card {
  padding: 16px;
}
</style>

<script>
export default {
  name: 'SettingsMetric',
  props: {
    label: {
      type: String,
      required: true
    },
    value: {
      type: [Number, String],
      required: true
    }
  }
};
</script>
