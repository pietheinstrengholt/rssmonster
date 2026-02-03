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
      }[this.type] || 'Something went wrong';
    },
    message() {
      return {
        offline: 'Cannot reach the RSSMonster backend.',
        unauthorized: 'Please log in again.'
      }[this.type] || 'Unexpected error occurred.';
    },
    retry() {
      return this.type === 'offline';
    }
  }
};
</script>
