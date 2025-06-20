<template>
  <main>
    <RouterView />
  </main>
</template>

<script>
import store from "./store";
import Cookies from 'js-cookie';

export default {
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
  }
};
</script>