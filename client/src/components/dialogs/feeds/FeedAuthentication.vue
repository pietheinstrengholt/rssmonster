<template>
  <section class="feed-authentication" :aria-labelledby="`${id}-heading`">
    <h3 :id="`${id}-heading`">Authentication</h3>
    <p class="app-form-help">Optional settings for feeds that require HTTP authentication.</p>
    <label class="app-form-label" :for="`${id}-type`">Authentication type</label>
    <select :id="`${id}-type`" class="app-form-select" :value="modelValue.authenticationType || ''" @change="changeType">
      <option value="">None</option>
      <option value="basic">HTTP Basic</option>
    </select>
    <template v-if="modelValue.authenticationType === 'basic'">
      <label class="app-form-label" :for="`${id}-username`">Username</label>
      <input :id="`${id}-username`" class="app-form-control" type="text" autocomplete="off" placeholder="Enter username"
        :value="modelValue.authenticationUsername" :aria-invalid="Boolean(errors.authenticationUsername)"
        :aria-describedby="errors.authenticationUsername ? `${id}-username-error` : undefined"
        @input="update('authenticationUsername', $event.target.value)" />
      <p v-if="errors.authenticationUsername" :id="`${id}-username-error`" class="feed-authentication__error" role="alert">{{ errors.authenticationUsername }}</p>
      <label class="app-form-label" :for="`${id}-password`">Password</label>
      <div class="feed-authentication__password">
        <input :id="`${id}-password`" class="app-form-control" :type="showPassword ? 'text' : 'password'" autocomplete="new-password"
          :placeholder="passwordStored ? '••••••••••••' : 'Enter password'" :value="modelValue.authenticationPassword"
          :aria-invalid="Boolean(errors.authenticationPassword)" :aria-describedby="`${id}-password-help`"
          @input="update('authenticationPassword', $event.target.value)" />
        <button type="button" class="app-button app-button--outline-secondary" :aria-label="showPassword ? 'Hide password' : 'Show password'"
          :aria-pressed="showPassword" @click="showPassword = !showPassword">
          <BootstrapIcon :icon="showPassword ? 'eye-slash' : 'eye'" context="control" aria-hidden="true" />
        </button>
      </div>
      <div :id="`${id}-password-help`">
        <p v-if="errors.authenticationPassword" class="feed-authentication__error" role="alert">{{ errors.authenticationPassword }}</p>
        <p v-if="passwordStored" class="app-form-help">Leave unchanged if empty.</p>
      </div>
      <p class="app-form-help"><BootstrapIcon icon="info-circle" aria-hidden="true" /> Credentials are used only when fetching this feed.</p>
    </template>
  </section>
</template>

<script>
export default {
  name: 'FeedAuthentication',
  props: {
    modelValue: { type: Object, required: true },
    id: { type: String, required: true },
    passwordStored: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'change'],
  data: () => ({ showPassword: false, errors: {} }),
  methods: {
    changeType(event) {
      this.showPassword = false;
      this.errors = {};
      this.$emit('update:modelValue', { authenticationType: event.target.value || null, authenticationUsername: '', authenticationPassword: '' });
      this.$emit('change');
    },
    update(field, value) {
      this.errors = { ...this.errors, [field]: '' };
      this.$emit('update:modelValue', { ...this.modelValue, [field]: value });
      this.$emit('change');
    },
    validate() {
      this.errors = {};
      if (this.modelValue.authenticationType !== 'basic') return true;
      if (!this.modelValue.authenticationUsername?.trim()) this.errors.authenticationUsername = 'Enter a username.';
      if (!this.modelValue.authenticationPassword && !this.passwordStored) this.errors.authenticationPassword = 'Enter a password.';
      return Object.keys(this.errors).length === 0;
    }
  }
};
</script>

<style scoped>
.feed-authentication { margin-block: 0.75rem; min-width: 0; }
.feed-authentication h3 { font-size: 0.9375rem; color: var(--text-primary); margin: 0; }
.feed-authentication .app-form-label { display: block; margin-block: 0.75rem 0.375rem; }
.feed-authentication .app-form-select {
  border-radius: var(--radius-compact);
  font-size: 0.8125rem;
  color-scheme: light;
}
.feed-authentication option { font: inherit; }
.feed-authentication option:checked {
  background-color: var(--surface-selected);
  color: var(--text-primary);
}
:global(:root[data-theme='dark'] .feed-authentication .app-form-select) { color-scheme: dark; }
.feed-authentication__password { display: flex; gap: 0.375rem; }
.feed-authentication__password input { min-width: 0; flex: 1; }
.feed-authentication__error { color: var(--text-error); font-size: 0.8125rem; margin-block: 0.375rem; }
</style>
