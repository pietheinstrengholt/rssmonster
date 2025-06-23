<template>
  <main>
    <RouterView />
  </main>
</template>

<script>
import store from "./store";
import Cookies from 'js-cookie';
import axios from 'axios';

//set header
axios.defaults.headers.common['Authorization'] = `Bearer ${store.auth.token}`;

//axios interceptor use
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response.status === 400) {
      if (error.response.data.message === "Your session is not valid!") {
        store.auth.token = null;
      }
    }
  
    return Promise.reject(error);
  }
);

export default {
  data() {
    return {
      store: store
    };
  },
  created: async function() {
    //Check if cookies are set. If so, validate the session
    if (Cookies.get('token') && Cookies.get('userId')) {
      store.auth.token = Cookies.get('token');
      store.auth.userId = Cookies.get('userId');
      this.checkSession();
    }
  },
  methods: {
    async checkSession() {
      try {
        console.log("check session");
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