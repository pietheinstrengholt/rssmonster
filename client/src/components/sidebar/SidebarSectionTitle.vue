<template>
  <div class="sidebar-section-header">
    <p class="sidebar-section-title">{{ title }}</p>
  </div>
</template>

<script>
export default {
  props: {
    title: {
      type: String,
      required: true
    }
  }
};
</script>

<style scoped>
p.sidebar-section-title {
  color: var(--sidebar-section-title-text);
  font-size: 0.8125rem;
  font-weight: 500;
  margin-left: var(--space-3);
  margin-top: var(--space-5);
  margin-bottom: var(--space-1);
}

</style>
