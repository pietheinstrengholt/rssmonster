<template>
  <div id="app">
    <!-- Loading state during session validation -->
    <div v-if="isLoading" class="loading-container">
      <p>Loading...</p>
    </div>
    <!-- Login view -->
    <main v-else-if="!isAuthenticated" class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <header class="auth-brand">
          <img class="auth-logo" src="./assets/images/monster.png" alt="" />
          <h1 id="auth-title">RSSMonster</h1>
          <p>Your intelligent RSS reader</p>
        </header>

        <form class="auth-form" @submit.prevent>
          <p class="auth-form-title" id="signin">{{ showSignup ? 'Create your account' : 'Sign in to RSSMonster' }}</p>
        
          <!-- Username input -->
          <div class="form-outline">
            <input class="form-control" type="text" id="username" v-model="username" />
            <label class="form-label" for="username">Username</label>
          </div>

          <!-- Password input -->
          <div class="form-outline">
            <input class="form-control" type="password" id="password" v-model="password" @keyup.enter="!showSignup ? login() : null" />
            <label class="form-label" for="password">Password</label>
          </div>

          <!-- Password repeat input (signup only) -->
          <div v-if="showSignup" class="form-outline">
            <input class="form-control" type="password" id="password_repeat" v-model="password_repeat" />
            <label class="form-label" for="password_repeat">Password (repeat)</label>
          </div>

          <!-- Submit button -->
          <button v-if="showSignup" type="submit" class="auth-submit btn btn-primary btn-block" @click="register" value="Register">Register</button>
          <button v-if="!showSignup" type="submit" class="auth-submit btn btn-primary btn-block" @click="login" value="Login">Sign in</button>

          <p v-if="message" class="auth-message">{{ message }}</p>
        </form>

        <div class="auth-divider">
          <span>or</span>
        </div>

        <p v-if="showSignup" class="auth-register">Already a member? <a href="#!" @click="showSignup = false">Click here to sign in</a></p>
        <p v-else class="auth-register">Not a member? <a href="#!" @click="showSignup = true">Create an account</a></p>
      </section>

      <footer class="auth-footer">
        <strong>Self-hosted. Private. In control.</strong>
        <span>RSSMonster is open source software.</span>
      </footer>
    </main>
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
        console.error('Login error:', error);

        // Backend unreachable / network error
        if (!error.response) {
          this.message =
            'Cannot connect to RSSMonster. Please check if the server is running.';
          return;
        }

        // Auth error
        if (error.response.status === 401) {
          this.message = 'Incorrect username or password.';
          return;
        }

        // Server-side error
        if (error.response.status >= 500) {
          this.message =
            'The server encountered an error. Please try again later.';
          return;
        }

        // Fallback
        this.message = error.response?.data?.message ||
          'Login failed. Please try again.';
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
.auth-page {
  align-items: center;
  background: var(--bg-page);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  padding: 48px 20px;
}

.auth-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 24px 80px var(--shadow-card-subtle-color);
  max-width: 680px;
  padding: 36px;
  width: 100%;
}

.auth-brand {
  margin-bottom: 30px;
  text-align: center;
}

.auth-logo {
  display: block;
  height: 64px;
  margin: 0 auto 18px;
  width: 64px;
}

.auth-brand h1 {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.15;
  margin: 0;
}

.auth-brand p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  margin: 8px 0 0;
}

.auth-form {
  display: grid;
  gap: 18px;
}

.auth-form-title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0;
  text-align: center;
}

#signin {
  font-weight: 700;
}

.auth-page .form-outline {
  display: flex;
  flex-direction: column-reverse;
  gap: 7px;
  position: relative;
}

.auth-page .form-outline .form-control {
  background-color: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 8px;
  color: var(--text-primary);
  min-height: 44px;
  padding: 10px 12px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}

.auth-page .form-outline .form-control:focus {
  background-color: var(--bg-input);
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
  color: var(--text-primary);
}

.auth-page .form-outline .form-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0;
}

.auth-submit {
  align-items: center;
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  border-radius: 8px;
  color: var(--text-inverted);
  display: inline-flex;
  font-weight: 700;
  justify-content: center;
  min-height: 44px;
  margin-top: 2px;
}

.auth-submit:hover,
.auth-submit:focus {
  background-color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--text-inverted);
}

.auth-submit:focus-visible {
  box-shadow: var(--shadow-focus-primary);
}

.btn-block {
  width: 100%;
}

.auth-message {
  background: var(--bg-muted);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
  padding: 10px 12px;
  text-align: center;
}

.auth-divider {
  align-items: center;
  color: var(--text-muted);
  display: flex;
  font-size: 12px;
  gap: 12px;
  line-height: 1;
  margin: 26px 0 22px;
}

.auth-divider::before,
.auth-divider::after {
  background: var(--border-subtle);
  content: "";
  flex: 1;
  height: 1px;
}

.auth-register {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  text-align: center;
}

.auth-register a {
  color: var(--color-brand);
  font-weight: 700;
  text-decoration: none;
}

.auth-register a:hover,
.auth-register a:focus {
  color: var(--settings-orange-hover-text);
  text-decoration: underline;
}

.auth-footer {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 5px;
  line-height: 1.4;
  margin-top: 22px;
  text-align: center;
}

.auth-footer strong {
  color: var(--text-primary);
  font-weight: 700;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-size: 1.2rem;
  color: var(--text-muted);
}

html, body, #app {
  height: 100%;
}

div.form-group.row {
  margin-bottom: 1rem;
}

:root[data-theme='dark'] .auth-page {
  background: var(--bg-page);
  color: var(--text-primary);
}

:root[data-theme='dark'] .auth-card {
  background: var(--bg-card);
  border-color: var(--border-color);
  box-shadow: 0 24px 80px var(--shadow-settings-dialog-dark-color);
}

:root[data-theme='dark'] .auth-logo {
  opacity: 0.92;
}

:root[data-theme='dark'] .auth-brand h1,
:root[data-theme='dark'] .auth-form-title,
:root[data-theme='dark'] .auth-footer strong {
  color: var(--text-primary);
}

:root[data-theme='dark'] .auth-brand p,
:root[data-theme='dark'] .auth-register,
:root[data-theme='dark'] .auth-footer,
:root[data-theme='dark'] .auth-page .form-outline .form-label {
  color: var(--text-secondary);
}

:root[data-theme='dark'] .auth-page .form-outline .form-control {
  background-color: var(--bg-input);
  border-color: var(--border-input);
  color: var(--text-primary);
}

:root[data-theme='dark'] .auth-page .form-outline .form-control:focus {
  background-color: var(--bg-input);
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
  color: var(--text-primary);
}

:root[data-theme='dark'] .auth-submit {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--text-inverted);
}

:root[data-theme='dark'] .auth-submit:hover,
:root[data-theme='dark'] .auth-submit:focus {
  background-color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--text-inverted);
}

:root[data-theme='dark'] .auth-message {
  background: var(--bg-control);
  border-color: var(--border-color);
  color: var(--text-secondary);
}

:root[data-theme='dark'] .auth-divider {
  color: var(--text-muted);
}

:root[data-theme='dark'] .auth-divider::before,
:root[data-theme='dark'] .auth-divider::after {
  background: var(--border-color);
}

:root[data-theme='dark'] .auth-register a {
  color: var(--settings-orange-text);
}

:root[data-theme='dark'] .auth-register a:hover,
:root[data-theme='dark'] .auth-register a:focus {
  color: var(--settings-orange-hover-text);
}

@media (max-width: 600px) {
  .auth-page {
    justify-content: flex-start;
    padding: 28px 16px;
  }

  .auth-card {
    border-radius: 14px;
    padding: 28px 20px;
  }

  .auth-brand {
    margin-bottom: 24px;
  }

  .auth-brand h1 {
    font-size: 26px;
  }
}
</style>
