<template>
  <div>{{ store.auth }}</div>
  <div class="form-box">
    <h1>Login</h1>
    <div class="form-group">
        <div class="form-group row">
            <label class="col-sm-2 col-form-label">Username</label>
            <div class="col-sm-10">
            <input class="form-control" type="text" placeholder="Username" v-model="username" />
            </div>
        </div>
        <div class="form-group row">
            <label  class="col-sm-2 col-form-label">Password</label>
            <div class="col-sm-10">
                <input class="form-control" type="password" placeholder="Password" v-model="password" />
            </div>
        </div>
        <div v-if="this.showSignup" class="form-group row">
            <label class="col-sm-2 col-form-label">Password</label>
            <div class="col-sm-10">
                <input class="form-control" type="password" placeholder="Password (repeat)" v-model="password_repeat" />
            </div>
        </div>
        <div class="form-group row">
            <div class="col-sm-10">
            <button v-if="this.showSignup" type="submit" class="btn btn-primary" @click="register" value="Login">Register</button>
            <button v-if="!this.showSignup" type="submit" class="btn btn-primary" @click="login" value="Login">Sign in</button>
            </div>
        </div>
        <!-- Buttons -->
        <div class="text-center">
            <p v-if="this.showSignup"><a href="#!" @click="this.showSignup = false">Click here to sign in</a></p>
            <p v-else>Not a member? <a href="#!" @click="Signup()">Register</a></p>
        </div>
        <p v-if="message">{{ message }}</p>
    </div>
  </div>
</template>

<style lang="scss">
@import "./assets/scss/global.scss";
</style>

<style>
.form-box {
  margin-left: 50px;
  margin-right: 50px;
}

.form-group.row {
  margin-top: 10px;
}
</style>

<script>
import store from "./store.js";
import AuthService from './services/AuthService.js';
import Cookies from 'js-cookie';
export default {
  data() {
    return {
      store: store,
      username: '',
      password: '',
      password_repeat: '',
      message: '',
      showSignup: false
    };
  },
  methods: {
    async login() {
      try {
        const credentials = {
          username: this.username,
          password: this.password
        };
        const response = await AuthService.login(credentials);
        this.message = response.message;

        //set status to loggedIn and redirect to home view
        this.store.auth.userId = response.user.id;
        this.store.auth.status = "LoggedIn";
        this.store.auth.token = response.token;
        Cookies.set('userId', response.user.id);
        Cookies.set('token', response.token);
        //refresh after one second
        setTimeout(function() {
          location.reload();
        }, 500);
      } catch (error) {
        console.log(error);
        if (error.response.data.message) {
            this.message = error.response.data.message;
        }
      }
    },
    async register() {
      try {
        const credentials = {
          username: this.username,
          password: this.password,
          password_repeat: this.password_repeat
        };
        const response = await AuthService.signUp(credentials);
        this.message = response.message;
        if (response.message = "Registered!") {
            this.showSignup = false;
        }
      } catch (error) {
        console.log(error);
        if (error.response.data.message) {
            this.message = error.response.data.message;
        }
      }
    },
    Signup() {
      this.showSignup = true;
      Cookies.remove('token');
      Cookies.remove('userId');
      this.store.auth.userId = null;
      this.store.auth.token = null;
      this.store.auth.status = null;
    }
  }
};
</script>