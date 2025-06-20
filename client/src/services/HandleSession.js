import store from "../store";
import Cookies from 'js-cookie';

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
    setTimeout(function() {
        location.reload();
    }, 500);
  },
  createSession(response) {
    store.auth.userId = response.user.id;
    store.auth.status = "LoggedIn";
    store.auth.token = response.token;
    Cookies.set('userId', response.user.id);
    Cookies.set('token', response.token);
  }
};