<template>
  <main>
    <RouterView />
  </main>
</template>

<script>
import store from "./store";
import Cookies from 'js-cookie';

export default {
  data() {
    return {
      store: store
    };
  },
  created: async function() {
    if (!(Cookies.get('token') && Cookies.get('userId'))) {
        // Cookie is not set, redirect the user to the login page
        this.$router.push('/login');
    } else {
        // Cookie is set, we can redirect the user to home
        store.auth.token = Cookies.get('token');
        store.auth.userId = Cookies.get('userId');
        store.auth.status = "LoggedIn";
        this.$router.push('/');
    }
  },
  watch: {
    "store.auth.token": {
      handler: function(token) {
        if (token) {
          Cookies.set('userId', this.store.auth.userId);
          Cookies.set('token', token);
          this.$router.push('/');
        }
        if (token === null) {
          store.auth.userId = null;
          store.auth.status = null;
          Cookies.remove('token');
          Cookies.remove('userId');
          this.$router.push('/login');
        }
      },
      deep: true
    }
  }
};
</script>