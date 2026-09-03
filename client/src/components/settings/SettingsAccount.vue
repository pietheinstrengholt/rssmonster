<template>
  <div class="settings-page account-settings">
    <SettingsPageIntro
      eyebrow="Settings — Account"
      icon="person-circle"
      title="Email address"
      title-id="account-settings-title"
    >
      Add and verify the address used for password recovery and daily briefings.
    </SettingsPageIntro>

    <form class="account-settings__form" @submit.prevent="saveEmail">
      <label for="account-email">Email address</label>
      <input
        id="account-email"
        v-model="email"
        class="app-form-control settings-control"
        type="email"
        autocomplete="email"
        maxlength="320"
        required
      />
      <p class="account-settings__status">
        Status: <strong>{{ verificationStatus }}</strong>
      </p>
      <div class="account-settings__actions">
        <button class="app-button app-button--primary settings-control" type="submit" :disabled="busy">
          Save email
        </button>
        <button
          class="app-button app-button--secondary settings-control"
          type="button"
          :disabled="busy || !savedEmail || isVerified"
          @click="sendVerification"
        >
          Send verification email
        </button>
      </div>
    </form>
    <p v-if="message" :role="messageType === 'error' ? 'alert' : 'status'" class="account-settings__message">
      {{ message }}
    </p>
  </div>
</template>

<script>
import {
  getEmailSettings,
  requestEmailVerification,
  updateEmail
} from '../../api/auth.js';
import SettingsPageIntro from './SettingsPageIntro.vue';

export default {
  name: 'SettingsAccount',
  components: { SettingsPageIntro },
  data() {
    return {
      email: '',
      savedEmail: '',
      emailVerifiedAt: null,
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
    }
  },
  async created() {
    await this.loadEmail();
  },
  methods: {
    async loadEmail() {
      this.busy = true;
      try {
        const settings = await getEmailSettings();
        this.email = settings.email || '';
        this.savedEmail = settings.email || '';
        this.emailVerifiedAt = settings.emailVerifiedAt || null;
      } catch (error) {
        console.error('Email settings load error:', error);
        this.message = 'Could not load your email settings.';
        this.messageType = 'error';
      } finally {
        this.busy = false;
      }
    },
    async saveEmail() {
      if (this.busy) return;
      this.busy = true;
      this.message = '';
      try {
        const settings = await updateEmail(this.email);
        this.email = settings.email;
        this.savedEmail = settings.email;
        this.emailVerifiedAt = settings.emailVerifiedAt;
        this.message = settings.message;
        this.messageType = 'success';
      } catch (error) {
        console.error('Email settings save error:', error);
        this.message = error.response?.data?.message || 'Could not save your email address.';
        this.messageType = 'error';
      } finally {
        this.busy = false;
      }
    },
    async sendVerification() {
      if (this.busy || !this.savedEmail || this.isVerified) return;
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
    }
  }
};
</script>

<style scoped>
.account-settings__form {
  max-width: 620px;
  padding: 28px;
}

.account-settings__form label {
  color: var(--text-secondary);
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 7px;
}

.account-settings__status {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 10px 0 0;
}

.account-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}

.account-settings__message {
  margin: 0 28px;
}
</style>
