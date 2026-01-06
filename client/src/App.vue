<template>
  <div id="app">
    <!-- Loading state during session validation -->
    <div v-if="isLoading" class="loading-container">
      <p>Loading...</p>
    </div>
    <!-- Login view -->
    <div v-else-if="!isAuthenticated" id="form-box">
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
          <label class="col-sm-2 col-form-label">Password</label>
          <div class="col-sm-10">
            <input class="form-control" type="password" placeholder="Password" v-model="password" @keyup.enter="!showSignup ? login() : null" />
          </div>
        </div>
        <div v-if="showSignup" class="form-group row">
          <label class="col-sm-2 col-form-label">Password</label>
          <div class="col-sm-10">
            <input class="form-control" type="password" placeholder="Password (repeat)" v-model="password_repeat" />
          </div>
        </div>
        <div class="form-group row">
          <div class="col-sm-10">
            <button v-if="showSignup" type="submit" class="btn btn-primary" @click="register" value="Register">Register</button>
            <button v-if="!showSignup" type="submit" class="btn btn-primary" @click="login" value="Login">Sign in</button>
          </div>
        </div>
        <p v-if="message">{{ message }}</p>
      </div>
      <br></br>
      <div class="text-center">
        <p v-if="showSignup"><a href="#!" @click="showSignup = false">Click here to sign in</a></p>
        <p v-else>Not a member? <a href="#!" @click="showSignup = true">Create an account</a></p>
      </div>
    </div>
    <!-- Main app view -->
    <main v-else>
      <app-shell></app-shell>
    </main>
  </div>
</template>

<script>
import AppShell from './AppShell.vue';
import AuthService from './services/AuthService.js';
import Cookies from 'js-cookie';
import axios from 'axios';

export default {
  components: {
    appShell: AppShell
  },
  data() {
    return {
      username: '',
      password: '',
      password_repeat: '',
      message: '',
      showSignup: false,
      isAuthenticated: false,
      isLoading: true
    };
  },
  async created() {
    // Check if the user has a valid session
    await this.checkSession();
    // Mark loading as complete
    this.isLoading = false;
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
              this.isAuthenticated = true;
            })
            .catch(error => {
              console.error("Session validation error:", error);
              // If session is not valid, logout
              this.logout();
            });
        } else {
          this.isAuthenticated = false;
        }
      } catch (error) {
        console.error("Session check error:", error);
        this.isAuthenticated = false;
      }
    },
    async login() {
      try {
        const credentials = {
          username: this.username,
          password: this.password
        };
        const response = await AuthService.login(credentials);
        this.message = response.message;

        if (response) {
          // Convert expiresInSeconds to days for cookie (default to 1 day if not provided)
          const expiresInDays = (response.expiresInSeconds || 86400) / 86400;
          Cookies.set('token', response.token, { expires: expiresInDays });
          this.$store.auth.setToken(response.token);
          this.$store.auth.setRole(response.user.role);
          this.isAuthenticated = true;
          this.$store.auth.setAgenticFeaturesEnabled(response.agenticFeaturesEnabled || false);
          // Clear form fields
          this.username = '';
          this.password = '';
        }
      } catch (error) {
        console.error("Login error:", error);
        if (error.response?.data?.message) {
          this.message = error.response.data.message;
        } else {
          this.message = 'Login failed. Please try again.';
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
        if (response.message === 'Registered!') {
          this.showSignup = false;
          this.username = '';
          this.password = '';
          this.password_repeat = '';
        }
      } catch (error) {
        console.error("Registration error:", error);
        if (error.response?.data?.message) {
          this.message = error.response.data.message;
        } else {
          this.message = 'Registration failed. Please try again.';
        }
      }
    },
    logout() {
      // Clear the token and role from the store
      this.$store.auth.setToken(null);
      this.$store.auth.setRole(null);
      // Remove the token cookie
      Cookies.remove('token');
      // Reset form and authentication state
      this.isAuthenticated = false;
      this.username = '';
      this.password = '';
      this.password_repeat = '';
      this.showSignup = false;
      this.message = '';
    }
  },
  watch: {
    '$store.auth.token'() {
      if (!this.$store.auth.token) {
        this.logout();
      }
    }
  }
};
</script>

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
  padding: 20px;
  background-color: #dee2e6;
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

.form-group.row input {
  margin-left: 20px;
  margin-right: 0;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-size: 1.2rem;
  color: #666;
}

html, body, #app {
  height: 100%;
}

@media (prefers-color-scheme: dark) {
  #form-box {
    color: #fff;
  }

  #monster p {
    color: #fff;
  }

  #login {
    background: #2a2a2a;
    border-color: #444;
  }

  .form-control {
    background-color: #1a1a1a;
    color: #fff;
    border-color: #555;
  }

  .form-control:focus {
    background-color: #1a1a1a;
    color: #fff;
    border-color: #4a7fc7;
    box-shadow: 0 0 0 2px rgba(74, 127, 199, 0.2);
  }

  .form-control::placeholder {
    color: #888;
  }

  .btn-primary {
    background-color: #4a7fc7;
    border-color: #4a7fc7;
  }

  .btn-primary:hover {
    background-color: #3a6fb7;
    border-color: #3a6fb7;
  }

  a {
    color: #4a7fc7;
  }

  a:hover {
    color: #3a6fb7;
  }
}

@media (max-width: 600px) {
  #form-box {
    width: 100%;
    margin: 0;
    padding: 0 10px;
  }
  .form-group.row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    margin-top: 10px;
  }
  .form-group.row label {
    margin-bottom: 5px;
    margin-left: 10px;
    margin-right: 10px;
    text-align: left;
    width: auto;
  }
  .form-group.row .col-sm-10 {
    width: 100%;
    margin-left: 0;
    padding: 0 10px;
  }
  .form-group.row input {
    margin-left: 0;
    margin-right: 0;
    width: 100%;
    box-sizing: border-box;
  }
  #login {
    padding: 10px;
  }
  button.btn-primary {
    width: auto;
    margin-right: 10px;
  }
}
</style>