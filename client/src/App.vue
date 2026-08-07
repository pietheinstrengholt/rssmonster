<template>
  <div class="app-root">
    <!-- Loading state during session validation -->
    <div v-if="isLoading" class="loading-container">
      <p>Loading...</p>
    </div>
    <!-- Login view -->
    <main v-else-if="!isAuthenticated" class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <header class="auth-brand">
          <img
            class="auth-logo"
            src="./assets/images/monster-ui-64.webp"
            srcset="./assets/images/monster-ui-64.webp 1x, ./assets/images/monster-ui-128.webp 2x"
            width="64"
            height="64"
            alt=""
          />
          <h1 id="auth-title">RSSMonster</h1>
          <p>Your intelligent RSS reader</p>
        </header>

        <form class="auth-form" @submit.prevent="submitAuthentication">
          <p class="auth-form-title" id="signin">{{ showSignup ? 'Create your account' : 'Sign in to RSSMonster' }}</p>
        
          <!-- Username input -->
          <div class="auth-field">
            <input class="app-form-control" type="text" id="username" v-model="username" />
            <label class="app-form-label" for="username">Username</label>
          </div>

          <!-- Password input -->
          <div class="auth-field">
            <input class="app-form-control" type="password" id="password" v-model="password" />
            <label class="app-form-label" for="password">Password</label>
          </div>

          <!-- Password repeat input (signup only) -->
          <div v-if="showSignup" class="auth-field">
            <input class="app-form-control" type="password" id="password_repeat" v-model="password_repeat" />
            <label class="app-form-label" for="password_repeat">Password (repeat)</label>
          </div>

          <!-- Submit button -->
          <button type="submit" class="auth-submit auth-submit--block" :disabled="isSubmitting">
            {{ isSubmitting ? (showSignup ? 'Registering...' : 'Signing in...') : (showSignup ? 'Register' : 'Sign in') }}
          </button>

          <p v-if="message" class="auth-message" role="status" aria-live="polite">{{ message }}</p>
        </form>

        <div class="auth-divider">
          <span>or</span>
        </div>

        <p v-if="showSignup" class="auth-register">Already a member? <a href="#!" @click.prevent="switchAuthMode(false)">Click here to sign in</a></p>
        <p v-else class="auth-register">Not a member? <a href="#!" @click.prevent="switchAuthMode(true)">Create an account</a></p>
      </section>

      <footer class="auth-footer">
        <strong>Self-hosted. Private. In control.</strong>
        <span>RSSMonster is open source software.</span>
      </footer>
    </main>
    <!-- Main app view -->
    <main v-else id="main">
      <app-shell @logout="logout"></app-shell>
    </main>
  </div>
</template>

<script>
import Cookies from 'js-cookie';
import { mapStores } from 'pinia';
import { defineAsyncComponent } from 'vue';
import { setAuthToken } from './api/client';
import * as authApi from './api/auth';
import AppShellLoadError from './components/shared/AppShellLoadError.vue';
import { loadAppShell } from './services/appShellLoader.js';
import { useAuthStore } from './store/auth.js';

// This function retries one transient shell failure before exposing the recoverable application error.
const handleAppShellLoadError = (error, retry, fail, attempts) => {
  console.error('App shell load error:', error);

  if (attempts < 2) {
    retry();
    return;
  }

  fail();
};

const AppShell = defineAsyncComponent({
  loader: loadAppShell,
  errorComponent: AppShellLoadError,
  delay: 0,
  onError: handleAppShellLoadError
});

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
      isLoading: true,
      isSubmitting: false
    };
  },
  async created() {
    window.removeEventListener('auth:expired', this.handleAuthExpired);
    window.addEventListener('auth:expired', this.handleAuthExpired);

    await this.checkSession();
    this.isLoading = false;
  },
  beforeUnmount() {
    window.removeEventListener('auth:expired', this.handleAuthExpired);
  },
  computed: {
    ...mapStores(useAuthStore)
  },
  methods: {
    // This function routes session expiry through the root session cleanup flow.
    handleAuthExpired() {
      console.warn('Session expired — logging out');
      this.logout();
    },
    // This function validates a saved token only while its session generation remains current.
    async checkSession() {
      const token = Cookies.get('token');

      if (!token) {
        await this.tryDevelopmentLogin();
        return;
      }

      loadAppShell().catch(error => {
        console.error('App shell preload error:', error);
      });

      const requestId = this.authStore.beginSessionRequest();

      try {
        const data = await authApi.validateSession(token);
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;

        authApi.applyAuthToken(token);

        this.authStore.setSession({
          token,
          role: data.user.role,
          userId: data.user.id
        });
        this.isAuthenticated = true;
      } catch (error) {
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        console.error('Session validation error:', error);
        this.logout();
      }
    },
    // This function bootstraps the configured development user while retaining normal login fallback.
    async tryDevelopmentLogin() {
      const requestId = this.authStore.beginSessionRequest();

      try {
        const response = await authApi.developmentLogin();
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        this.establishSession(response);
      } catch (error) {
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        this.logout();

        if (error.response?.status >= 500) {
          console.error('Development login error:', error);
          this.message = error.response.data?.message ||
            'Development login is unavailable.';
        }
      }
    },
    // This function submits the operation for the active authentication mode once.
    async submitAuthentication() {
      if (this.isSubmitting) return;

      this.isSubmitting = true;
      this.message = '';

      try {
        if (this.showSignup) {
          await this.register();
        } else {
          await this.login();
        }
      } finally {
        this.isSubmitting = false;
      }
    },
    // This function switches authentication modes without retaining stale feedback.
    switchAuthMode(showSignup) {
      this.showSignup = showSignup;
      this.message = '';
    },
    // This function authenticates the entered credentials and establishes the session.
    async login() {
      const requestId = this.authStore.beginSessionRequest();

      try {
        const credentials = {
          username: this.username,
          password: this.password
        };

        const response = await authApi.login(credentials);
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        this.message = response.message;

        if (!response?.token) return;
        this.establishSession(response);

        // clear form
        this.username = '';
        this.password = '';
      } catch (error) {
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
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
    // This function persists the standard server authentication response for every login flow.
    establishSession(response) {
      const expiresInDays = (response.expiresInSeconds || 86400) / 86400;

      Cookies.set('token', response.token, { expires: expiresInDays });
      setAuthToken(response.token);
      this.authStore.setSession({
        token: response.token,
        role: response.user.role,
        userId: response.user.id
      });
      this.isAuthenticated = true;
    },
    // This function creates an account and returns to sign-in after confirmed success.
    async register() {
      try {
        const credentials = {
          username: this.username,
          password: this.password,
          password_repeat: this.password_repeat
        };
        const response = await authApi.register(credentials);
        this.message = response.message;
        if (response.registered === true) {
          this.showSignup = false;
          this.username = '';
          this.password = '';
          this.password_repeat = '';
        }
      } catch (error) {
        console.error('Registration error:', error);

        // Explain connection failures when no response reached the browser.
        if (!error.response) {
          const isTimeout = error.code === 'ECONNABORTED' ||
            /timeout/i.test(error.message || '');

          this.message = isTimeout
            ? 'The registration request timed out. The server may be unavailable or busy. Please try again.'
            : 'Cannot connect to RSSMonster. Please check that the server is running and reachable.';
          return;
        }

        // Preserve useful validation messages returned by the server.
        if (error.response.data?.message && error.response.status < 500) {
          this.message = error.response.data.message;
          return;
        }

        // Explain server failures without exposing internal error details.
        if (error.response.status >= 500) {
          this.message =
            `The server encountered an error (HTTP ${error.response.status}) and could not complete registration. Please try again later.`;
          return;
        }

        this.message =
          `The server rejected the registration request (HTTP ${error.response.status}). Please check your details and try again.`;
      }
    },
    // This function clears Axios, Pinia, and cookie authentication state together.
    logout() {
      setAuthToken(null);

      this.authStore.clearSession();
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

<style scoped>
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
  border: 1px solid var(--border-default);
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
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0;
  text-align: center;
}

#signin {
  font-weight: 700;
}

.auth-page .auth-field {
  display: flex;
  flex-direction: column-reverse;
  gap: 7px;
  position: relative;
}

.auth-page .auth-field .app-form-control {
  background-color: var(--bg-input);
  border: 1px solid var(--border-control);
  border-radius: 8px;
  color: var(--text-primary);
  min-height: var(--control-height-touch);
  padding: 10px 12px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}

.auth-page .auth-field .app-form-control:focus-visible {
  background-color: var(--bg-input);
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
  color: var(--text-primary);
}

.auth-page .auth-field .app-form-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0;
}

.auth-submit {
  align-items: center;
  background-color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  color: var(--text-inverted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-weight: 700;
  justify-content: center;
  min-height: var(--control-height-touch);
  margin-top: 2px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
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

.auth-submit:disabled {
  cursor: default;
  opacity: 0.65;
}

.auth-submit--block {
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

.app-root {
  height: 100%;
}

#main {
  height: 100%;
}

:global(:root[data-theme='dark'] .auth-page) {
  background: var(--bg-page);
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .auth-card) {
  background: var(--bg-card);
  border-color: var(--border-default);
  box-shadow: 0 24px 80px var(--shadow-settings-dialog-dark-color);
}

:global(:root[data-theme='dark'] .auth-logo) {
  opacity: 0.92;
}

:global(:root[data-theme='dark'] .auth-brand h1),
:global(:root[data-theme='dark'] .auth-footer strong) {
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .auth-form-title) {
  color: var(--color-primary);
}

:global(:root[data-theme='dark'] .auth-brand p),
:global(:root[data-theme='dark'] .auth-register),
:global(:root[data-theme='dark'] .auth-footer),
:global(:root[data-theme='dark'] .auth-page .auth-field .app-form-label) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .auth-page .auth-field .app-form-control) {
  background-color: var(--bg-input);
  border-color: var(--border-control);
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .auth-page .auth-field .app-form-control:focus-visible) {
  background-color: var(--bg-input);
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .auth-submit) {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .auth-submit:hover),
:global(:root[data-theme='dark'] .auth-submit:focus) {
  background-color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .auth-message) {
  background: var(--bg-control);
  border-color: var(--border-default);
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .auth-divider) {
  color: var(--text-muted);
}

:global(:root[data-theme='dark'] .auth-divider::before),
:global(:root[data-theme='dark'] .auth-divider::after) {
  background: var(--border-subtle);
}

:global(:root[data-theme='dark'] .auth-register a) {
  color: var(--settings-orange-text);
}

:global(:root[data-theme='dark'] .auth-register a:hover),
:global(:root[data-theme='dark'] .auth-register a:focus) {
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
