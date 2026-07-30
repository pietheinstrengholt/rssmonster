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
    title() {
      return {
        offline: 'You are offline',
        unauthorized: 'Session expired'
      }[this.type] || 'RSSMonster is unavailable';
    },
    message() {
      return {
        offline: 'Cannot reach the RSSMonster backend.',
        unauthorized: 'Please log in again.'
      }[this.type] || 'Reload the page or try again shortly.';
    },
    retry() {
      return this.type === 'offline';
    }
  }
};
</script>
