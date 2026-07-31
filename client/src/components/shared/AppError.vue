<!-- components/AppError.vue -->
<template>
  <div class="app-error">
    <h1>{{ title }}</h1>
    <p>{{ message }}</p>

    <button v-if="retry" @click="$emit('retry')" class="btn btn-primary">
      Retry
    </button>
  </div>
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
    // This function exposes retry for overview failures that preserve the active session.
    retry() {
      return this.type === 'offline' || this.type === 'overview';
    }
  }
};
</script>
