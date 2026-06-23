<template>
  <div class="sidebar-section-header">
    <p class="sidebar-section-title">{{ title }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  }
});
</script>

<style scoped>
p.sidebar-section-title {
  color: var(--text-primary);
  margin-left: 14px;
  margin-top: 10px;
  margin-bottom: 5px;
}

@media (prefers-color-scheme: dark) {
  p.sidebar-section-title {
    color: var(--text-inverted);
  }
}
</style>
