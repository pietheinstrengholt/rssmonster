<template>
  <div class="settings-page account-settings">
    <SettingsPageIntro
      eyebrow="Settings — Account"
      icon="person-circle"
      title="Account"
      title-id="account-settings-title"
    >
      Manage your sign-in details, recovery address, and emailed daily briefings.
    </SettingsPageIntro>

    <form class="account-settings__form" @submit.prevent="saveAccount">
      <section class="account-settings__section" aria-labelledby="account-identity-title">
        <h3 id="account-identity-title">Sign-in details</h3>
        <label for="account-username">Username</label>
        <input
          id="account-username"
          v-model="username"
          class="app-form-control settings-control"
          type="text"
          autocomplete="username"
          readonly
        />
        <p class="account-settings__hint">Your username cannot be changed.</p>

        <div class="account-settings__grid">
          <div>
            <label for="account-password">New password</label>
            <input
              id="account-password"
              v-model="password"
              class="app-form-control settings-control"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
              placeholder="Leave blank to keep current password"
            />
          </div>
          <div>
            <label for="account-password-repeat">Repeat new password</label>
            <input
              id="account-password-repeat"
              v-model="passwordRepeat"
              class="app-form-control settings-control"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
            />
          </div>
        </div>
        <p v-if="passwordMismatch" class="account-settings__validation" role="alert">
          Both passwords must match.
        </p>
      </section>

      <section class="account-settings__section" aria-labelledby="account-email-title">
        <h3 id="account-email-title">Email address</h3>
        <p class="account-settings__description">
          Used for password recovery and daily briefings.
        </p>
        <label for="account-email">Email address</label>
        <input
          id="account-email"
          v-model="email"
          class="app-form-control settings-control"
          type="email"
          autocomplete="email"
          maxlength="320"
          :required="emailServiceEnabled"
        />
        <p class="account-settings__status">
          Status: <strong>{{ verificationStatus }}</strong>
        </p>
        <button
          class="app-button app-button--secondary settings-control account-settings__verify"
          type="button"
          :disabled="busy || !emailServiceEnabled || !savedEmail || email !== savedEmail || isVerified"
          @click="sendVerification"
        >
          Send verification email
        </button>
      </section>

      <section class="account-settings__section" aria-labelledby="account-digest-title">
        <h3 id="account-digest-title">Daily briefing email</h3>
        <p v-if="!emailServiceEnabled" class="account-settings__notice">
          Email delivery is not enabled on this server.
        </p>
        <p v-else-if="!isVerified" class="account-settings__notice">
          Verify your email address before enabling daily briefing emails.
        </p>

        <label class="account-settings__check" for="account-digest-enabled">
          <input
            id="account-digest-enabled"
            v-model="emailDigestEnabled"
            type="checkbox"
            :disabled="!emailServiceEnabled || !isVerified"
          />
          Email my daily briefing
        </label>

        <div class="account-settings__grid account-settings__schedule">
          <div>
            <label for="account-digest-time">Delivery time</label>
            <input
              id="account-digest-time"
              v-model="emailDigestTime"
              class="app-form-control settings-control"
              type="time"
              required
            />
          </div>
          <div>
            <label for="account-digest-timezone">Timezone</label>
            <input
              id="account-digest-timezone"
              v-model="emailDigestTimezone"
              class="app-form-control settings-control"
              type="text"
              list="account-timezones"
              maxlength="64"
              required
            />
            <datalist id="account-timezones">
              <option v-for="timezone in timezones" :key="timezone" :value="timezone" />
            </datalist>
          </div>
        </div>

        <label class="account-settings__check" for="account-digest-skip-empty">
          <input
            id="account-digest-skip-empty"
            v-model="emailDigestSkipWhenEmpty"
            type="checkbox"
          />
          Skip the email when the briefing is empty
        </label>
        <button
          class="app-button app-button--secondary settings-control account-settings__digest-test"
          type="button"
          :disabled="busy || !emailServiceEnabled || !isVerified || email !== savedEmail"
          @click="sendDigestTest"
        >
          Send test daily briefing
        </button>
      </section>

      <div class="account-settings__actions">
        <button
          class="app-button app-button--primary settings-control"
          type="submit"
          :disabled="busy || passwordMismatch"
        >
          Save changes
        </button>
      </div>
    </form>
    <p
      v-if="message"
      :role="messageType === 'error' ? 'alert' : 'status'"
      :class="[
        'account-settings__message',
        `account-settings__message--${messageType}`
      ]"
      aria-live="polite"
    >
      {{ message }}
    </p>
  </div>
</template>

<script>
import {
  getAccountSettings,
  requestEmailVerification,
  sendDailyBriefingTest,
  updateAccountSettings
} from '../../api/auth.js';
import SettingsPageIntro from './SettingsPageIntro.vue';

const getBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

const getSupportedTimezones = () => {
  try {
    return Intl.supportedValuesOf?.('timeZone') || [];
  } catch {
    return [];
  }
};

export default {
  name: 'SettingsAccount',
  components: { SettingsPageIntro },
  data() {
    return {
      username: '',
      email: '',
      savedEmail: '',
      emailVerifiedAt: null,
      emailServiceEnabled: false,
      emailDigestEnabled: false,
      emailDigestTime: '08:00',
      emailDigestTimezone: '',
      emailDigestSkipWhenEmpty: true,
      password: '',
      passwordRepeat: '',
      timezones: getSupportedTimezones(),
      busy: false,
      message: '',
      messageType: 'success'
    };
  },
  computed: {
    isVerified() {
      return Boolean(this.savedEmail && this.emailVerifiedAt);
    },
    verificationStatus() {
      if (!this.savedEmail) return 'No email configured';
      return this.isVerified ? 'Verified' : 'Not verified';
    },
    passwordMismatch() {
      return Boolean(this.password || this.passwordRepeat) && this.password !== this.passwordRepeat;
    }
  },
  async created() {
    await this.loadAccount();
  },
  methods: {
    applySettings(settings, { suggestTimezone = false } = {}) {
      this.username = settings.username || '';
      this.email = settings.email || '';
      this.savedEmail = settings.email || '';
      this.emailVerifiedAt = settings.emailVerifiedAt || null;
      this.emailServiceEnabled = Boolean(settings.emailServiceEnabled);
      this.emailDigestEnabled = Boolean(settings.emailDigestEnabled);
      this.emailDigestTime = settings.emailDigestTime || '08:00';
      const suggestedTimezone = suggestTimezone && !settings.emailDigestConfigured
        ? getBrowserTimezone()
        : '';
      this.emailDigestTimezone = suggestedTimezone
        || settings.emailDigestTimezone
        || settings.serverTimezone
        || 'UTC';
      this.emailDigestSkipWhenEmpty = settings.emailDigestSkipWhenEmpty !== false;
    },
    async loadAccount() {
      this.busy = true;
      try {
        const settings = await getAccountSettings();
        this.applySettings(settings, { suggestTimezone: true });
      } catch (error) {
        console.error('Account settings load error:', error);
        this.message = 'Could not load your account settings.';
        this.messageType = 'error';
      } finally {
        this.busy = false;
      }
    },
    async saveAccount() {
      if (this.busy || this.passwordMismatch) return;
      this.busy = true;
      this.message = '';
      try {
        const settings = await updateAccountSettings({
          email: this.email,
          password: this.password,
          passwordRepeat: this.passwordRepeat,
          emailDigestEnabled: this.emailDigestEnabled,
          emailDigestTime: this.emailDigestTime,
          emailDigestTimezone: this.emailDigestTimezone,
          emailDigestSkipWhenEmpty: this.emailDigestSkipWhenEmpty
        });
        this.applySettings(settings);
        this.password = '';
        this.passwordRepeat = '';
        this.message = settings.message;
        this.messageType = 'success';
        if (settings.passwordChanged) window.dispatchEvent(new Event('auth:expired'));
      } catch (error) {
        console.error('Account settings save error:', error);
        this.message = error.response?.data?.message || 'Could not save your account settings.';
        this.messageType = 'error';
      } finally {
        this.busy = false;
      }
    },
    async sendVerification() {
      if (this.busy || !this.savedEmail || this.email !== this.savedEmail || this.isVerified) return;
      this.busy = true;
      this.message = '';
      try {
        const response = await requestEmailVerification();
        this.message = response.message;
        this.messageType = 'success';
      } catch (error) {
        console.error('Email verification request error:', error);
        this.message = error.response?.data?.message || 'Could not send a verification email.';
        this.messageType = 'error';
      } finally {
        this.busy = false;
      }
    },
    async sendDigestTest() {
      if (
        this.busy ||
        !this.emailServiceEnabled ||
        !this.isVerified ||
        this.email !== this.savedEmail
      ) return;
      this.busy = true;
      this.message = '';
      try {
        const response = await sendDailyBriefingTest();
        this.message = response.message;
        this.messageType = 'success';
      } catch (error) {
        console.error('Daily briefing test error:', error);
        this.message = error.response?.data?.message || 'Could not send a daily briefing test.';
        this.messageType = 'error';
      } finally {
        this.busy = false;
      }
    }
  }
};
</script>

<style scoped>
.account-settings__form {
  max-width: 680px;
  padding: 28px;
}

.account-settings__section + .account-settings__section {
  border-top: 1px solid var(--border-subtle);
  margin-top: 28px;
  padding-top: 28px;
}

.account-settings__section h3 {
  color: var(--text-primary);
  font-size: 16px;
  margin: 0 0 16px;
}

#account-email-title,
#account-digest-title {
  margin-top: 5px;
}

.account-settings__description,
.account-settings__hint,
.account-settings__notice,
.account-settings__status {
  color: var(--text-secondary);
  font-size: 13px;
}

.account-settings__description { margin: -8px 0 16px; }
.account-settings__hint,
.account-settings__status { margin: 8px 0 0; }
.account-settings__notice { margin: 0 0 16px; }

.account-settings__form label:not(.account-settings__check) {
  color: var(--text-secondary);
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 7px;
}

.account-settings__grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 20px;
}

.account-settings__check {
  align-items: center;
  color: var(--text-primary);
  display: flex;
  gap: 9px;
  margin-top: 16px;
}

.account-settings__validation {
  color: var(--settings-danger-text);
  font-size: 13px;
  margin: 8px 0 0;
}

.account-settings__verify { margin-top: 16px; }
.account-settings__digest-test { margin-top: 20px; }

.account-settings__actions {
  border-top: 1px solid var(--border-subtle);
  margin-top: 28px;
  padding-top: 24px;
}

.account-settings__message {
  border-radius: var(--radius-control);
  font-size: 13px;
  font-weight: 700;
  margin: 0 28px;
  padding: 12px 14px;
}

.account-settings__message--success {
  background: var(--settings-success-bg);
  color: var(--settings-success-text);
}

.account-settings__message--error {
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

@media (max-width: 640px) {
  .account-settings__grid { grid-template-columns: 1fr; }
}
</style>
