<template>
  <AppError type="overview" @retry="reloadApplication" />
</template>

<script>
import { defineAsyncComponent } from 'vue';

// This component preserves the existing lazy error boundary until shell loading actually fails.
const AppError = defineAsyncComponent(() => import('./AppError.vue'));

export default {
  name: 'AppShellLoadError',
  components: {
    AppError
  },
  methods: {
    // This function reloads the application so a failed authenticated-shell request can be retried cleanly.
    reloadApplication() {
      window.location.reload();
    }
  }
};
</script>
