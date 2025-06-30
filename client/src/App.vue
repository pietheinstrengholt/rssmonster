<template>
  <main>
    <RouterView />
  </main>
</template>

<script>
import Cookies from 'js-cookie';
import axios from 'axios';

export default {
  created: async function() {
    //Check if cookies are set. If so, validate the session
    if (Cookies.get('token')) {
      this.$store.auth.setToken(Cookies.get('token'));
      this.checkSession();
    } else {
      //if no cookies are set, redirect to login
      this.$router.push('/login');
    }
  },
  methods: {
    async checkSession() {
      try {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;


        axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/auth/validate")
          .then(response => {
            this.$store.auth.setRole(response.data.user.role);
          })
          .catch(error => {
            console.error("Error fetching users:", error);
          });

        /* axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/auth/validate").then(response => {
          })
          .then(response => {
            //session if valid, redirect to home
            console.log(response);
            this.$router.push('/');
          }
        ).catch((error) => {
          //if session is not valid, redirect to login
          if (error.response.data.message === "Your session is not valid!") {
            this.$router.push('/login');
          }
        }); */
      } catch (error) {
        console.log(error);
        if (error.response.data.message) {
            this.message = error.response.data.message;
        } 
      }
    }
  },
  watch: {
    async '$store.auth'(auth) {
      if (auth.token) {
        await Cookies.set('token', auth.token);
      } else {
        await Cookies.remove('token');
        await Cookies.remove('role');
        await this.$router.push('/login');
      }
    }
  }
};
</script>