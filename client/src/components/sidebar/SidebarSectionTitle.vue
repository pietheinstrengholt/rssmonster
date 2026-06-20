<template>
  <div class="title-box">
    <p class="title">{{ title }}</p>
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
p.title {
  color: var(--text-primary);
  margin-left: 14px;
  margin-top: 10px;
  margin-bottom: 5px;
}

@media (prefers-color-scheme: dark) {
  p.title {
    color: var(--text-inverted);
  }
}
</style>