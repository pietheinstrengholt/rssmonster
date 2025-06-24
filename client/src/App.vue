<template>
  <main>
    <RouterView />
  </main>
</template>

<script>
import Cookies from 'js-cookie';
import axios from 'axios';

export default {
  mounted() {
    console.log("Store: " + this.$store.auth.token);
    console.log("Cookie: " + Cookies.get('token'));
  },
  created: async function() {
    //Check if cookies are set. If so, validate the session
    if (Cookies.get('token')) {
      this.$store.auth.setToken(Cookies.get('token'))
      this.checkSession();
    } else {
      //if no cookies are set, redirect to login
      this.$router.push('/login');
    }
  },
  methods: {
    async checkSession() {
      try {
        console.log("check session");
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
        axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/auth/validate").then(response => {
          })
          .then(response => {
            //session if valid, redirect to home
            this.$router.push('/');
          }
        ).catch((error) => {
          //if session is not valid, redirect to login
          if (error.response.data.message === "Your session is not valid!") {
            this.$router.push('/login');
          }
        });
      } catch (error) {
        console.log(error);
        if (error.response.data.message) {
            this.message = error.response.data.message;
        }
      }
    }
  },
  watch: {
    '$store.auth.token'(token) { 
      console.log("Token has changed");
      console.log(this.$store.auth.token);
      if (token) {
        Cookies.set('token', token);
      } else {
        Cookies.remove('token');
        this.$router.push('/login');
      }
    }
  }
};
</script>