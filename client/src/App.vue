<template>
  <main>
    <RouterView />
  </main>
</template>

<script>
import store from "./store";

export default {
  created: async function() {
    if (store.auth.status) {
        this.$router.push('/');
    } else {
        this.$router.push('/login');
    }
  }
};
</script>