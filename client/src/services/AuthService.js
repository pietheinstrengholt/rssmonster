// src/services/AuthService.js
import axios from 'axios';
const url = import.meta.env.VITE_VUE_APP_HOSTNAME + '/api/auth/';
export default {
  login(credentials) {
    return axios
      .post(url + 'login', credentials)
      .then(response => response.data);
  },
  signUp(credentials) {
    return axios
      .post(url + 'register', credentials)
      .then(response => response.data);
  }
};