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
        
        <!-- Username input -->
        <div class="form-outline mb-4">
          <input class="form-control" type="text" id="username" v-model="username" />
          <label class="form-label" for="username">Username</label>
        </div>

        <!-- Password input -->
        <div class="form-outline mb-4">
          <input class="form-control" type="password" id="password" v-model="password" @keyup.enter="!showSignup ? login() : null" />
          <label class="form-label" for="password">Password</label>
        </div>

        <!-- Password repeat input (signup only) -->
        <div v-if="showSignup" class="form-outline mb-4">
          <input class="form-control" type="password" id="password_repeat" v-model="password_repeat" />
          <label class="form-label" for="password_repeat">Password (repeat)</label>
        </div>

        <!-- Submit button -->
        <button v-if="showSignup" type="submit" class="btn btn-primary btn-block mb-4" @click="register" value="Register">Register</button>
        <button v-if="!showSignup" type="submit" class="btn btn-primary btn-block mb-4" @click="login" value="Login">Sign in</button>

        <p v-if="message" class="text-center mt-2">{{ message }}</p>
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
import Cookies from 'js-cookie';
import { setAuthToken } from './api/client';
import * as authApi from './api/auth';

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
    window.addEventListener('auth:expired', this.handleAuthExpired);

    await this.checkSession();
    this.isLoading = false;
  },
  beforeUnmount() {
    window.removeEventListener('auth:expired', this.handleAuthExpired);
  },
  methods: {
    handleAuthExpired() {
      console.warn('Session expired — logging out');
      this.logout();
    },
    async checkSession() {
      const token = Cookies.get('token');

      if (!token) {
        this.isAuthenticated = false;
        return;
      }

      try {
        const data = await authApi.validateSession(token);

        authApi.applyAuthToken(token);

        this.$store.auth.setToken(token);
        this.$store.auth.setRole(data.user.role);
        this.isAuthenticated = true;
      } catch (error) {
        console.error('Session validation error:', error);
        this.logout();
      }
    },
    async login() {
      try {
        const credentials = {
          username: this.username,
          password: this.password
        };

        const response = await authApi.login(credentials);
        this.message = response.message;

        if (!response?.token) return;

        const expiresInDays = (response.expiresInSeconds || 86400) / 86400;

        Cookies.set('token', response.token, { expires: expiresInDays });

        setAuthToken(response.token);

        this.$store.auth.setToken(response.token);
        this.$store.auth.setRole(response.user.role);
        this.$store.auth.setAgenticFeaturesEnabled(
          response.agenticFeaturesEnabled || false
        );

        this.isAuthenticated = true;

        // clear form
        this.username = '';
        this.password = '';
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
        const response = await authApi.register(credentials);
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
      setAuthToken(null); // 👈 CLEAR API CLIENT TOKEN

      this.$store.auth.setToken(null);
      this.$store.auth.setRole(null);
      Cookies.remove('token');

      this.isAuthenticated = false;
      this.username = '';
      this.password = '';
      this.password_repeat = '';
      this.showSignup = false;
      this.message = '';
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

.form-outline {
  position: relative;
}

.form-outline .form-control {
  min-height: 40px;
  padding: 10px 12px;
}

.form-outline .form-label {
  position: absolute;
  top: 0;
  left: 12px;
  padding: 0 4px;
  background-color: #dee2e6;
  color: #666;
  font-size: 14px;
  transform: translateY(-50%);
  pointer-events: none;
  transition: all 0.2s ease;
}

.btn-block {
  width: 100%;
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

div.form-group.row {
  margin-bottom: 1rem;
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

  .form-outline .form-label {
    background-color: #2a2a2a;
    color: #aaa;
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
  #login {
    padding-top: 10px;
  }
  button.btn-primary {
    width: auto;
    margin-right: 10px;
  }
}
</style>