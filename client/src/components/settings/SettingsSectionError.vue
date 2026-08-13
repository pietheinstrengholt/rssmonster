<template>
  <section class="settings-section-state settings-section-state--error" role="alert" aria-live="assertive" aria-atomic="true">
    <BootstrapIcon icon="exclamation-triangle" aria-hidden="true" />
    <div>
      <h3>Could not load this section</h3>
      <p>Choose another section and try again. If the problem continues, reopen Settings.</p>
    </div>
  </section>
</template>

<style scoped>
.settings-section-state {
  align-items: flex-start;
  background: var(--bg-muted);
  border: 1px solid var(--border-danger);
  border-radius: var(--radius-panel);
  color: var(--text-secondary);
  display: flex;
  gap: 12px;
  margin: 20px;
  padding: 18px;
}

.settings-section-state .bi {
  color: var(--settings-danger-text);
  flex: 0 0 auto;
  font-size: 20px;
  margin-top: 2px;
}

.settings-section-state h3 {
  color: var(--text-primary);
  font-size: 15px;
  margin: 0 0 4px;
}

.settings-section-state p {
  margin: 0;
}

:global(:root[data-theme='dark']) .settings-section-state {
  background: var(--bg-muted);
  border-color: var(--border-danger);
  color: var(--text-secondary);
}
</style>
