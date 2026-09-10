<template>
  <div class="app-root">
    <app-install-prompt />
    <p v-if="emailVerificationMessage || oidcMessage" class="email-verification-banner" role="status">
      {{ emailVerificationMessage || oidcMessage }}
    </p>
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

        <a v-if="oidcEnabled && !passwordResetMode && !emailEnrollmentMode"
          class="auth-provider" :href="oidcLoginUrl">
          <span class="auth-provider-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5M15 12H3" /></svg></span>
          <span class="auth-provider-label">Sign in with identity provider</span>
          <span class="auth-provider-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg></span>
        </a>

        <form v-if="localAuthEnabled || emailEnrollmentMode" class="auth-form" aria-labelledby="signin" @submit.prevent="submitAuthentication">
          <p :class="oidcEnabled && !showSignup && !passwordResetMode && !emailEnrollmentMode ? 'auth-section-divider' : 'auth-form-title'" id="signin"><span>{{ authFormTitle }}</span></p>
        
          <!-- Username input -->
          <div v-if="!passwordResetMode && !emailEnrollmentMode" class="auth-field">
            <label class="app-form-label" for="username">Username</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg></span>
              <input class="app-form-control auth-input" type="text" id="username" v-model="username" autocomplete="username" placeholder="Enter your username" />
            </div>
          </div>

          <!-- Password input -->
          <div v-if="!passwordResetMode && !emailEnrollmentMode" class="auth-field">
            <label class="app-form-label" for="password">Password</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
              <input class="app-form-control auth-input auth-input--with-action" :type="visiblePasswords['password'] ? 'text' : 'password'" id="password" v-model="password" :autocomplete="showSignup ? 'new-password' : 'current-password'" placeholder="Enter your password" />
              <button type="button" class="auth-input-action" :aria-label="visiblePasswords['password'] ? 'Hide password' : 'Show password'" :aria-pressed="Boolean(visiblePasswords['password'])" aria-controls="password" @click="visiblePasswords['password'] = !visiblePasswords['password']">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /><path v-if="visiblePasswords['password']" d="m3 3 18 18" /></svg>
              </button>
            </div>
          </div>

          <!-- Password repeat input (signup only) -->
          <div v-if="showSignup && registrationEmailEnabled && !passwordResetMode" class="auth-field">
            <label class="app-form-label" for="email">Email address</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
              <input class="app-form-control auth-input" type="email" id="email" v-model="email" autocomplete="email" required placeholder="Enter your email address" />
            </div>
          </div>

          <div v-if="showSignup && !passwordResetMode" class="auth-field">
            <label class="app-form-label" for="password_repeat">Password (repeat)</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
              <input class="app-form-control auth-input auth-input--with-action" :type="visiblePasswords['password_repeat'] ? 'text' : 'password'" id="password_repeat" v-model="password_repeat" autocomplete="new-password" placeholder="Repeat your password" />
              <button type="button" class="auth-input-action" :aria-label="visiblePasswords['password_repeat'] ? 'Hide repeat password' : 'Show repeat password'" :aria-pressed="Boolean(visiblePasswords['password_repeat'])" aria-controls="password_repeat" @click="visiblePasswords['password_repeat'] = !visiblePasswords['password_repeat']">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /><path v-if="visiblePasswords['password_repeat']" d="m3 3 18 18" /></svg>
              </button>
            </div>
          </div>

          <div v-if="passwordResetMode === 'request'" class="auth-field">
            <label class="app-form-label" for="reset-email">Email address</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
              <input class="app-form-control auth-input" type="email" id="reset-email" v-model="resetEmail" autocomplete="email" required placeholder="Enter your email address" />
            </div>
          </div>

          <template v-if="passwordResetMode === 'confirm'">
            <div class="auth-field">
              <label class="app-form-label" for="reset-password">New password</label>
              <div class="auth-input-wrapper">
                <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
                <input class="app-form-control auth-input auth-input--with-action" :type="visiblePasswords['reset-password'] ? 'text' : 'password'" id="reset-password" v-model="resetPassword" autocomplete="new-password" required placeholder="Enter your new password" />
                <button type="button" class="auth-input-action" :aria-label="visiblePasswords['reset-password'] ? 'Hide new password' : 'Show new password'" :aria-pressed="Boolean(visiblePasswords['reset-password'])" aria-controls="reset-password" @click="visiblePasswords['reset-password'] = !visiblePasswords['reset-password']">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /><path v-if="visiblePasswords['reset-password']" d="m3 3 18 18" /></svg>
                </button>
              </div>
            </div>
            <div class="auth-field">
              <label class="app-form-label" for="reset-password-repeat">Repeat new password</label>
              <div class="auth-input-wrapper">
                <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
                <input class="app-form-control auth-input auth-input--with-action" :type="visiblePasswords['reset-password-repeat'] ? 'text' : 'password'" id="reset-password-repeat" v-model="resetPasswordRepeat" autocomplete="new-password" required placeholder="Repeat your new password" />
                <button type="button" class="auth-input-action" :aria-label="visiblePasswords['reset-password-repeat'] ? 'Hide repeat new password' : 'Show repeat new password'" :aria-pressed="Boolean(visiblePasswords['reset-password-repeat'])" aria-controls="reset-password-repeat" @click="visiblePasswords['reset-password-repeat'] = !visiblePasswords['reset-password-repeat']">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /><path v-if="visiblePasswords['reset-password-repeat']" d="m3 3 18 18" /></svg>
                </button>
              </div>
            </div>
          </template>

          <div v-if="emailEnrollmentMode" class="auth-field">
            <label class="app-form-label" for="enrollment-email">Email address</label>
            <div class="auth-input-wrapper">
              <span class="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
              <input class="app-form-control auth-input" type="email" id="enrollment-email" v-model="enrollmentEmail" autocomplete="email" required placeholder="Enter your email address" />
            </div>
          </div>

          <!-- Submit button -->
          <button v-if="!emailEnrollmentVerified" type="submit" class="auth-submit auth-submit--block" :disabled="isSubmitting">
            <span>{{ authSubmitLabel }}</span>
            <svg v-if="!isSubmitting && !showSignup && !passwordResetMode && !emailEnrollmentMode" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </button>

          <button
            v-if="emailEnrollmentMode && enrollmentEmail && enrollmentEmail === enrollmentSavedEmail && !emailEnrollmentVerified"
            type="button"
            class="auth-submit auth-submit--block auth-submit--secondary"
            :disabled="isSubmitting"
            @click="resendEmailEnrollment"
          >
            Resend verification email
          </button>

          <p v-if="message" class="auth-message" role="status" aria-live="polite">{{ message }}</p>
        </form>

        <p v-if="!localAuthEnabled && !emailEnrollmentMode && message" class="auth-message" role="status">{{ message }}</p>

        <div v-if="localAuthEnabled || emailEnrollmentMode" class="auth-divider" :class="{ 'auth-divider--spacer': oidcEnabled && !showSignup && !passwordResetMode && !emailEnrollmentMode }" aria-hidden="true">
          <span>or</span>
        </div>

        <p v-if="emailEnrollmentMode" class="auth-register"><a href="#!" @click.prevent="leaveEmailEnrollment">Back to sign in</a></p>
        <p v-else-if="passwordResetMode" class="auth-register"><a href="#!" @click.prevent="leavePasswordReset">Back to sign in</a></p>
        <p v-else-if="showSignup" class="auth-register">Already a member? <a href="#!" @click.prevent="switchAuthMode(false)">Click here to sign in</a></p>
        <template v-else-if="localAuthEnabled">
          <p v-if="registrationEnabled" class="auth-register">Not a member? <a href="#!" @click.prevent="switchAuthMode(true)">Create an account</a></p>
          <p class="auth-register auth-register--secondary"><a href="#!" @click.prevent="startPasswordReset">Forgot password?</a></p>
        </template>
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
import * as authApi from './api/auth';
import AppShellLoadError from './components/shared/AppShellLoadError.vue';
import InstallPrompt from './components/shared/InstallPrompt.vue';
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
    appShell: AppShell,
    appInstallPrompt: InstallPrompt
  },
  data() {
    return {
      username: '',
      email: '',
      password: '',
      visiblePasswords: {},
      password_repeat: '',
      message: '',
      showSignup: false,
      isAuthenticated: false,
      isLoading: true,
      isSubmitting: false,
      emailVerificationMessage: '',
      passwordResetMode: null,
      passwordResetToken: '',
      resetEmail: '',
      resetPassword: '',
      resetPasswordRepeat: '',
      registrationEmailEnabled: false,
      registrationEnabled: false,
      localAuthEnabled: true,
      developmentLoginEnabled: false,
      oidcEnabled: false,
      oidcMessage: '',
      emailEnrollmentMode: false,
      emailEnrollmentToken: '',
      enrollmentEmail: '',
      enrollmentSavedEmail: '',
      emailEnrollmentVerified: false,
      emailEnrollmentPoll: null
    };
  },
  async created() {
    window.removeEventListener('auth:expired', this.handleAuthExpired);
    window.addEventListener('auth:expired', this.handleAuthExpired);

    await this.confirmEmailFromLocation?.();
    this.loadPasswordResetFromLocation?.();
    await this.loadAuthConfiguration?.();
    if (!await this.completeOidcFromLocation?.()) await this.checkSession();
    this.isLoading = false;
  },
  beforeUnmount() {
    window.removeEventListener('auth:expired', this.handleAuthExpired);
    this.stopEmailEnrollmentPolling?.();
  },
  computed: {
    oidcLoginUrl() {
      return authApi.getOidcLoginUrl();
    },
    ...mapStores(useAuthStore),
    authFormTitle() {
      if (this.emailEnrollmentMode) return 'Verify your email address';
      if (this.passwordResetMode === 'request') return 'Reset your password';
      if (this.passwordResetMode === 'confirm') return 'Choose a new password';
      return this.showSignup ? 'Create your account' : 'Sign in to RSSMonster';
    },
    authSubmitLabel() {
      if (this.emailEnrollmentMode) {
        return this.isSubmitting ? 'Sending...' : 'Save and send verification';
      }
      if (this.passwordResetMode === 'request') {
        return this.isSubmitting ? 'Sending...' : 'Send reset email';
      }
      if (this.passwordResetMode === 'confirm') {
        return this.isSubmitting ? 'Updating...' : 'Update password';
      }
      if (this.showSignup) return this.isSubmitting ? 'Registering...' : 'Register';
      return this.isSubmitting ? 'Signing in...' : 'Sign in';
    }
  },
  methods: {
    async completeOidcFromLocation() {
      const url = new URL(window.location.href);
      const parameters = new URLSearchParams(url.hash.slice(1));
      const code = parameters.get('oidc-code');
      const failed = parameters.has('oidc-error');
      if (!code && !failed) return false;
      parameters.delete('oidc-code');
      parameters.delete('oidc-error');
      url.hash = parameters.toString();
      window.history.replaceState({}, '', url);
      if (failed) {
        this.message = 'Provider sign-in failed. Please try again or link your account from Account settings first.';
        return true;
      }
      const requestId = this.authStore.beginSessionRequest();
      try {
        const response = await authApi.exchangeOidcCode(code);
        if (!this.authStore.isSessionRequestCurrent(requestId)) return true;
        this.message = response.message;
        if (response.emailVerificationRequired === true) {
          this.emailEnrollmentMode = true;
          this.emailEnrollmentToken = response.emailEnrollmentToken;
          this.enrollmentEmail = response.email || '';
          this.enrollmentSavedEmail = response.email || '';
          this.emailEnrollmentVerified = false;
          this.startEmailEnrollmentPolling();
          return true;
        }
        if (response.token) {
          this.establishSession(response);
          if (response.oidcLinked) this.oidcMessage = 'Provider account linked. You can now use provider sign-in.';
          return true;
        }
      } catch {
        if (!this.authStore.isSessionRequestCurrent(requestId)) return true;
        this.message = 'Provider sign-in could not be completed. Please start again.';
      }
      return true;
    },
    async loadAuthConfiguration() {
      try {
        const configuration = await authApi.getAuthConfiguration();
        this.registrationEmailEnabled = configuration.emailEnabled === true;
        this.localAuthEnabled = configuration.localAuthEnabled !== false;
        this.developmentLoginEnabled = configuration.developmentLoginEnabled === true;
        this.registrationEnabled = this.localAuthEnabled && configuration.registrationEnabled !== false;
        if (!this.localAuthEnabled) this.leavePasswordReset();
        this.oidcEnabled = configuration.oidcEnabled === true;
        if (!this.registrationEnabled) this.showSignup = false;
      } catch {
        this.developmentLoginEnabled = false;
        this.registrationEmailEnabled = false;
        this.registrationEnabled = false;
        this.oidcEnabled = false;
        this.showSignup = false;
      }
    },
    // This function routes session expiry through the root session cleanup flow.
    handleAuthExpired() {
      console.warn('Session expired — logging out');
      this.logout();
    },
    async confirmEmailFromLocation() {
      const url = new URL(window.location.href);
      const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ''));
      const token = hashParameters.get('verify-email-token');
      if (!token) return;
      hashParameters.delete('verify-email-token');
      url.hash = hashParameters.toString();
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      try {
        const response = await authApi.confirmEmailVerification(token);
        this.emailVerificationMessage = response.message;
      } catch (error) {
        this.emailVerificationMessage = error.response?.data?.message ||
          'This verification link is invalid or has expired.';
      }
    },
    loadPasswordResetFromLocation() {
      const url = new URL(window.location.href);
      const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ''));
      const token = hashParameters.get('reset-password-token');
      if (!token) return;
      this.passwordResetToken = token;
      this.passwordResetMode = 'confirm';
      hashParameters.delete('reset-password-token');
      url.hash = hashParameters.toString();
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
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

        this.authStore.setSession({
          token,
          role: data.user.role,
          userId: data.user.id
        });
        this.isAuthenticated = true;
      } catch (error) {
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        console.error('Session validation error:', error);
        this.logout({ preservePasswordReset: Boolean(this.passwordResetMode) });
      }
    },
    // This function bootstraps the configured development user while retaining normal login fallback.
    async tryDevelopmentLogin() {
      if (!this.developmentLoginEnabled || this.localAuthEnabled === false) return;
      const requestId = this.authStore.beginSessionRequest();

      try {
        const response = await authApi.developmentLogin();
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        this.establishSession(response);
      } catch (error) {
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        this.logout({ preservePasswordReset: Boolean(this.passwordResetMode) });

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
        if (this.emailEnrollmentMode) {
          await this.submitEmailEnrollment();
        } else if (this.passwordResetMode === 'request') {
          await this.requestPasswordReset();
        } else if (this.passwordResetMode === 'confirm') {
          await this.confirmPasswordReset();
        } else if (this.showSignup) {
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
      if (showSignup && (!this.registrationEnabled || this.localAuthEnabled === false)) return;
      this.passwordResetMode = null;
      this.showSignup = showSignup;
      this.message = '';
    },
    startPasswordReset() {
      if (this.localAuthEnabled === false) return;
      this.showSignup = false;
      this.passwordResetMode = 'request';
      this.message = '';
    },
    leavePasswordReset() {
      this.passwordResetMode = null;
      this.passwordResetToken = '';
      this.resetPassword = '';
      this.resetPasswordRepeat = '';
      this.message = '';
    },
    async requestPasswordReset() {
      if (this.localAuthEnabled === false) return;
      try {
        const response = await authApi.requestPasswordReset(this.resetEmail);
        this.message = response.message;
      } catch (error) {
        this.message = error.response?.status === 429
          ? 'Too many reset requests. Please try again later.'
          : 'The reset request could not be completed. Please try again later.';
      }
    },
    async confirmPasswordReset() {
      if (this.localAuthEnabled === false) return;
      try {
        const response = await authApi.confirmPasswordReset({
          token: this.passwordResetToken,
          password: this.resetPassword,
          passwordRepeat: this.resetPasswordRepeat
        });
        this.passwordResetMode = null;
        this.passwordResetToken = '';
        this.resetPassword = '';
        this.resetPasswordRepeat = '';
        this.message = response.message;
      } catch (error) {
        this.message = error.response?.data?.message ||
          'This password reset link is invalid or has expired.';
      }
    },
    // This function authenticates the entered credentials and establishes the session.
    async login() {
      if (this.localAuthEnabled === false) return;
      const requestId = this.authStore.beginSessionRequest();

      try {
        const credentials = {
          username: this.username,
          password: this.password
        };

        const response = await authApi.login(credentials);
        if (!this.authStore.isSessionRequestCurrent(requestId)) return;
        this.message = response.message;

        if (response.emailVerificationRequired === true) {
          this.emailEnrollmentMode = true;
          this.emailEnrollmentToken = response.emailEnrollmentToken;
          this.enrollmentEmail = response.email || '';
          this.enrollmentSavedEmail = response.email || '';
          this.emailEnrollmentVerified = false;
          this.password = '';
          this.startEmailEnrollmentPolling();
          return;
        }

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
    async submitEmailEnrollment() {
      try {
        const response = await authApi.updateEmailEnrollment(
          this.emailEnrollmentToken,
          this.enrollmentEmail
        );
        this.enrollmentEmail = response.email;
        this.enrollmentSavedEmail = response.email;
        this.emailEnrollmentVerified = response.verified;
        this.message = response.message;
        this.startEmailEnrollmentPolling();
      } catch (error) {
        this.message = error.response?.data?.message ||
          'Could not save or send verification for this email address.';
      }
    },
    async resendEmailEnrollment() {
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      try {
        const response = await authApi.resendEmailEnrollment(this.emailEnrollmentToken);
        this.message = response.message;
        this.startEmailEnrollmentPolling();
      } catch (error) {
        this.message = error.response?.data?.message ||
          'Could not resend the verification email.';
      } finally {
        this.isSubmitting = false;
      }
    },
    async checkEmailEnrollmentStatus() {
      try {
        const status = await authApi.getEmailEnrollmentStatus(this.emailEnrollmentToken);
        this.emailEnrollmentVerified = status.verified;
        if (status.verified) {
          this.message = 'Email address verified. Return to sign in to continue.';
          this.stopEmailEnrollmentPolling();
        }
      } catch (error) {
        if (error.response?.status === 401) {
          this.message = 'This verification session expired. Return to sign in and try again.';
          this.stopEmailEnrollmentPolling();
        }
      }
    },
    startEmailEnrollmentPolling() {
      this.stopEmailEnrollmentPolling();
      if (!this.emailEnrollmentToken || this.emailEnrollmentVerified) return;
      this.checkEmailEnrollmentStatus();
      this.emailEnrollmentPoll = window.setInterval(
        this.checkEmailEnrollmentStatus,
        3000
      );
    },
    stopEmailEnrollmentPolling() {
      if (this.emailEnrollmentPoll !== null) {
        window.clearInterval(this.emailEnrollmentPoll);
        this.emailEnrollmentPoll = null;
      }
    },
    leaveEmailEnrollment() {
      this.stopEmailEnrollmentPolling();
      this.emailEnrollmentMode = false;
      this.emailEnrollmentToken = '';
      this.enrollmentEmail = '';
      this.enrollmentSavedEmail = '';
      this.emailEnrollmentVerified = false;
      this.message = '';
    },
    // This function persists the standard server authentication response for every login flow.
    establishSession(response) {
      const expiresInDays = (response.expiresInSeconds || 86400) / 86400;

      Cookies.set('token', response.token, {
        expires: expiresInDays,
        sameSite: 'strict',
        secure: window.location.protocol === 'https:'
      });
      this.authStore.setSession({
        token: response.token,
        role: response.user.role,
        userId: response.user.id
      });
      this.isAuthenticated = true;
    },
    // This function creates an account and returns to sign-in after confirmed success.
    async register() {
      if (!this.registrationEnabled || this.localAuthEnabled === false) return;
      try {
        const credentials = {
          username: this.username,
          password: this.password,
          password_repeat: this.password_repeat,
          ...(this.registrationEmailEnabled ? { email: this.email } : {})
        };
        const response = await authApi.register(credentials);
        this.message = response.message;
        if (response.registered === true) {
          this.showSignup = false;
          this.username = '';
          this.email = '';
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
    logout({ preservePasswordReset = false } = {}) {
      this.authStore.clearSession();
      Cookies.remove('token');

      this.isAuthenticated = false;
      this.username = '';
      this.email = '';
      this.password = '';
      this.password_repeat = '';
      this.showSignup = false;
      if (!preservePasswordReset) {
        this.passwordResetMode = null;
        this.passwordResetToken = '';
        this.resetEmail = '';
        this.resetPassword = '';
        this.resetPasswordRepeat = '';
      }
      this.stopEmailEnrollmentPolling?.();
      this.emailEnrollmentMode = false;
      this.emailEnrollmentToken = '';
      this.enrollmentEmail = '';
      this.enrollmentSavedEmail = '';
      this.emailEnrollmentVerified = false;
      this.message = '';
    }
  }
};
</script>

<style scoped>
.email-verification-banner {
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
  margin: 0;
  padding: 12px 20px;
  text-align: center;
}

.auth-page {
  align-items: center;
  background: var(--surface-page);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  padding: 40px 20px;
  box-sizing: border-box;
}

.auth-card {
  background: var(--surface-card);
  box-sizing: border-box;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  box-shadow: 0 12px 40px var(--shadow-card-subtle-color);
  max-width: 620px;
  padding: 42px 52px 40px;
  width: 100%;
}

.auth-brand {
  margin-bottom: 36px;
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
  flex-direction: column;
  gap: 7px;
  position: relative;
}

.auth-page .auth-field .app-form-control {
  background-color: var(--bg-input);
  border: 1px solid var(--border-control);
  border-radius: 10px;
  color: var(--text-primary);
  min-height: 52px;
  width: 100%;
  padding: 12px 14px 12px 44px;
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
  border-radius: 10px;
  color: var(--text-inverted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-weight: 700;
  justify-content: center;
  gap: 10px;
  min-height: 52px;
  padding: 12px 16px;
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

.auth-provider {
  align-items: center;
  background: var(--surface-card);
  border: 1px solid var(--border-control);
  border-radius: 10px;
  box-shadow: 0 2px 6px var(--shadow-card-subtle-color);
  color: var(--text-primary);
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 20px;
  gap: 12px;
  min-height: 56px;
  padding: 14px 16px;
  text-decoration: none;
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.auth-provider:hover {
  background: var(--surface-chrome);
  border-color: var(--border-focus);
  box-shadow: 0 4px 12px var(--shadow-card-subtle-color);
}

.auth-provider:focus-visible,
.auth-input-action:focus-visible,
.auth-register a:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 3px;
  box-shadow: var(--shadow-focus-primary);
}

.auth-provider-label {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
}

.auth-provider-icon,
.auth-provider-chevron {
  color: var(--text-secondary);
  display: flex;
}

.auth-provider + .auth-form {
  margin-top: 30px;
}

.auth-section-divider {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  font-size: 13px;
  gap: 14px;
  line-height: 1.5;
  margin: 0 0 6px;
  text-align: center;
}

.auth-section-divider::before,
.auth-section-divider::after {
  background: var(--border-subtle);
  content: "";
  flex: 1;
  height: 1px;
}

.auth-input-wrapper {
  position: relative;
}

.auth-input-icon {
  align-items: center;
  color: var(--text-tertiary);
  display: flex;
  left: 14px;
  pointer-events: none;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.auth-page .auth-field .auth-input--with-action {
  padding-right: 52px;
}

.auth-page .auth-field .auth-input::placeholder {
  color: var(--text-tertiary);
  opacity: 1;
}

.auth-input-action {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  justify-content: center;
  min-height: var(--control-height-touch);
  width: var(--control-height-touch);
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.auth-input-action:hover {
  background: var(--surface-chrome);
  color: var(--text-primary);
}

.auth-provider + .auth-message {
  margin-top: 18px;
}

.auth-message {
  background: var(--surface-chrome);
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
  color: var(--text-tertiary);
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

.auth-divider--spacer::before,
.auth-divider--spacer::after,
.auth-divider--spacer span {
  display: none;
}

.auth-divider--spacer {
  margin: 24px 0 0;
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

.auth-register + .auth-register {
  margin-top: 8px;
}

.auth-register--secondary a {
  font-size: 13px;
  font-weight: 500;
}

.auth-footer {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 5px;
  line-height: 1.4;
  margin-top: 24px;
  text-align: center;
}

.auth-footer strong {
  color: var(--text-primary);
  font-weight: 700;
}

.auth-footer span {
  font-size: 12px;
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
  background: var(--surface-page);
  color: var(--text-primary);
}

:global(:root[data-theme='dark'] .auth-card) {
  background: var(--surface-card);
  border-color: var(--border-default);
  box-shadow: 0 12px 40px var(--shadow-settings-dialog-dark-color);
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
  background: var(--surface-control);
  border-color: var(--border-default);
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .auth-divider) {
  color: var(--text-tertiary);
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
    margin-bottom: 30px;
  }

  .auth-brand h1 {
    font-size: 26px;
  }
}
</style>
