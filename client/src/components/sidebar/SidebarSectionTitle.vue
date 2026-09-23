<template>
  <div class="sidebar-section-header">
    <p class="sidebar-section-title">
      <BootstrapIcon v-if="icon" :icon="icon" context="control" decorative />
      {{ title }}
    </p>
  </div>
</template>

<script>
export default {
  props: {
    icon: { type: String, default: '' },
    title: {
      type: String,
      required: true
    }
  }
};
</script>

<style scoped>
p.sidebar-section-title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--sidebar-section-title-text);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.25;
  margin-left: var(--space-3);
  margin-top: var(--space-3);
  margin-bottom: var(--space-1);
}

</style>
