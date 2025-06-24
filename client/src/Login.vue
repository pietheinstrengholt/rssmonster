<template>
  <div id="form-box">
    <div id="title">
      <div id="monster">
        <p>RSSMonster</p>
      </div>
    </div>
    <div class="form-group" id="login">
        <p class="font-bold text-lg mb-4" id="signin">Sign in to RSSMonster</p>
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
        <p v-if="message">{{ message }}</p>
    </div>
    <br></br>
    <div class="text-center">
      <p v-if="this.showSignup"><a href="#!" @click="this.showSignup = false">Click here to sign in</a></p>
      <p v-else>Not a member? <a href="#!" @click="Signup()">Create an account</a></p>
    </div>
  </div>
</template>

<style lang="scss">
@import "./assets/scss/global.scss";
</style>

<style>
#monster {
  background: url('./assets/images/monster.png') 14px 30px no-repeat;
  background-size: 30px 30px;
  height: 90px;
}

#monster p {
  padding: 30px 0px 0px 50px;
  color: #111;
  font-size: 20px;
}

#signin {
  font-weight: bold;
}

#login {
  border-width: 1px;
  border-radius: 0.375rem;
  border-color: lightgrey;
  border-style: solid;
  padding: 10px;
}

#form-box {
  width: 50%;
  margin: auto;
  flex-grow: 1;
  align-items: center;
}

.form-group.row {
  margin-top: 10px;
}
</style>

<script>
import AuthService from './services/AuthService.js';

export default {
  data() {
    return {
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

        //set token in store and redirect to home
        if (response) {
          this.$store.auth.setToken(response.token);
          this.$router.push('/');
        }

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
    }
  }
};
</script>