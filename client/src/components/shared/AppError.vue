<!-- components/AppError.vue -->
<template>
  <section class="app-error" role="alert" aria-live="assertive" aria-atomic="true" aria-labelledby="app-error-title">
    <div class="app-error__icon" aria-hidden="true">
      <BootstrapIcon icon="exclamation-circle" />
    </div>

    <h1 id="app-error-title" class="app-error__title">{{ title }}</h1>
    <p class="app-error__message">{{ message }}</p>
    <p v-if="retry" class="app-error__guidance">{{ guidance }}</p>

    <button v-if="retry" type="button" class="app-button app-button--primary app-error__retry" @click="$emit('retry')">
      <BootstrapIcon icon="arrow-clockwise" aria-hidden="true" />
      Retry
    </button>
  </section>
</template>

<script>
export default {
  props: {
    type: String
  },
  computed: {
    // This function returns the heading for the current application failure type.
    title() {
      return {
        offline: 'You are offline',
        unauthorized: 'Session expired',
        overview: 'Could not load RSSMonster'
      }[this.type] || 'RSSMonster is unavailable';
    },
    // This function returns recovery guidance for the current application failure type.
    message() {
      return {
        offline: 'Cannot reach the RSSMonster backend.',
        unauthorized: 'Please log in again.',
        overview: 'The server returned an error while loading your overview.'
      }[this.type] || 'Reload the page or try again shortly.';
    },
    // This function gives a practical next step for failures the user can retry.
    guidance() {
      return this.type === 'offline'
        ? 'Check your connection and confirm that the server is running.'
        : 'Try again. If the problem continues, check the server logs.';
    },
    // This function exposes retry for overview failures that preserve the active session.
    retry() {
      return this.type === 'offline' || this.type === 'overview';
    }
  }
};
</script>

<style scoped>
.app-error {
  align-items: center;
  box-sizing: border-box;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0;
  min-height: clamp(26rem, 68vh, 40rem);
  padding: clamp(3rem, 10vh, 6rem) 1.5rem;
  text-align: center;
}

.app-error__icon {
  align-items: center;
  background: var(--bg-danger-subtle);
  border: 1px solid var(--border-danger);
  border-radius: var(--radius-pill);
  color: var(--color-danger);
  display: flex;
  font-size: 1.75rem;
  height: 3.5rem;
  justify-content: center;
  margin-bottom: 1.5rem;
  width: 3.5rem;
}

.app-error__title {
  font-size: clamp(1.5rem, 3vw, 1.75rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
  max-width: 34rem;
}

.app-error__message {
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.55;
  margin: 0.75rem 0 0;
  max-width: 32rem;
}

.app-error__guidance {
  color: var(--text-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
  margin: 0.375rem 0 0;
  max-width: 32rem;
}

.app-error__retry {
  margin-top: 1.5rem;
  min-width: 7rem;
}

@media (max-width: 767px) {
  .app-error {
    min-height: calc(100dvh - 3.5rem);
    padding: 3rem 1.25rem;
  }
}

:global(:root[data-theme='dark'] .app-error__icon) {
  background: var(--bg-danger-subtle);
  border-color: var(--border-danger);
  color: var(--text-danger);
}
</style>
