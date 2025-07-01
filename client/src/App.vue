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
    // Check if the user has a valid session
    this.checkSession();
  },
  methods: {
    async checkSession() {
      try {
        if (Cookies.get('token')) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${Cookies.get('token')}`;
          // Validate the session by checking the user's role
          await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/auth/validate")
            .then(response => {
              // If the session is valid, set the token and role in the store
              this.$store.auth.setToken(Cookies.get('token'));
              this.$store.auth.setRole(response.data.user.role);
            })
            .catch(error => {
              console.error("Error fetching users:", error);
              // If session is not valid, redirect to login
              if (error.response && error.response.data && error.response.data.message === "Your session is not valid!") {
                this.logout();
              }
            });
        } else {
          this.logout();
        }
      } catch (error) {
        console.log(error);
        if (error.response.data.message) {
            this.message = error.response.data.message;
        } 
      }
    },
    async logout() {
      try {
        // Clear the token and role from the store
        this.$store.auth.setToken(null);
        this.$store.auth.setRole(null);
        // Remove the token cookie
        Cookies.remove('token');
        // Redirect to login page
        this.$router.push('/login');
      } catch (error) {
        console.error("Logout error:", error);
      }
    }
  },
  watch: {
    async '$store.auth'() {
      this.checkSession();
    }
  }
};
</script>