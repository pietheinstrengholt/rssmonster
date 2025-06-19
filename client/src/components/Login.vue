<template>
  <div class="form-box">
    <h1>Login</h1>
    <div class="form-group">
        <div class="form-group row">
            <label for="inputEmail3" class="col-sm-2 col-form-label">Username</label>
            <div class="col-sm-10">
            <input class="form-control" type="text" placeholder="Username" v-model="username" />
            </div>
        </div>
        <div class="form-group row">
            <label for="inputPassword3" class="col-sm-2 col-form-label">Password</label>
            <div class="col-sm-10">
                <input class="form-control" type="password" placeholder="Password" v-model="password" />
            </div>
        </div>
        <div v-if="this.signup" class="form-group row">
            <label for="inputPassword3" class="col-sm-2 col-form-label">Password</label>
            <div class="col-sm-10">
                <input class="form-control" type="password" placeholder="Password (repeat)" v-model="password_repeat" />
            </div>
        </div>
        <div class="form-group row">
            <div class="col-sm-10">
            <button v-if="this.signup" type="submit" class="btn btn-primary" @click="register" value="Login">Register</button>
            <button v-if="!this.signup" type="submit" class="btn btn-primary" @click="login" value="Login">Sign in</button>
            </div>
        </div>
        <!-- Buttons -->
        <div class="text-center">
            <p v-if="this.signup"><a href="#!" @click="this.signup = false">Click here to sign in</a></p>
            <p v-else>Not a member? <a href="#!" @click="this.signup = true">Register</a></p>
        </div>
        <p v-if="message">{{ message }}</p>
    </div>
  </div>
</template>
<script>
import store from "../store";
import AuthService from '../services/AuthService.js';
export default {
  data() {
    return {
      store: store,
      username: '',
      password: '',
      password_repeat: '',
      message: '',
      signup: false
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
        const token = response.token;
        const user = response.user;
        this.store.auth.user = user;
        this.store.auth.status = "LoggedIn";
        this.store.auth.token = token;
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
            this.signup = false;
        }
      } catch (error) {
        console.log(error);
        if (error.response.data.message) {
            this.message = error.response.data.message;
        }
      }
    }
  }
};
</script>

<style>
.form-box {
  margin-left: 50px;
  margin-right: 50px;
}

.form-group.row {
  margin-top: 10px;
}

</style>