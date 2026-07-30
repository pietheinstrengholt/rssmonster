<template>
  <section class="settings-section-state" role="status" aria-live="polite">
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    <p>Loading settings…</p>
  </section>
</template>

<style scoped>
.settings-section-state {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  gap: 10px;
  justify-content: center;
  min-height: 180px;
  padding: 32px;
}

.settings-section-state p {
  margin: 0;
}

@media (prefers-color-scheme: dark) {
  .settings-section-state {
    color: var(--text-secondary);
  }
}
</style>
