import store from "../store";
import Cookies from 'js-cookie';
import axios from 'axios';
const url = import.meta.env.VITE_VUE_APP_HOSTNAME + '/api/auth/';
axios.defaults.headers.common['Authorization'] = `Bearer ${store.auth.token}`;

export default {
  validateSession(error) {
    console.log(error.response.data.message);
    if (error.response.data.message == "Your session is not valid!") {
        this.closeSession();
    }
  },
  closeSession() {
    Cookies.remove('token');
    Cookies.remove('userId');
    store.auth.userId = null;
    store.auth.token = null;
    store.auth.status = null;
    parent.location.hash = "/login";
  },
  createSession(response) {
    store.auth.userId = response.user.id;
    store.auth.status = "LoggedIn";
    store.auth.token = response.token;
    Cookies.set('userId', response.user.id);
    Cookies.set('token', response.token);
    parent.location.hash = "/";
  },
  checkSession() {
    axios
      .post(url + 'secret-route')
      .then(response => response.data).catch((error) => {
            this.closeSession;
        }
    );
  }
};