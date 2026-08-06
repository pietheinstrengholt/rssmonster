<template>
  <section class="settings-section-state" role="status" aria-live="polite" aria-atomic="true">
    <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
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

</style>
