import { defineStore } from 'pinia';

export const useStore = defineStore('auth', {
  // This function creates a logged-out authentication state.
  state: () => ({
    token: null,
    role: null,
    agenticFeaturesEnabled: false
  }),
  actions: {
    // This function applies every authenticated-session field from login or validation.
    setSession({ token, role, agenticFeaturesEnabled = false }) {
      this.token = token;
      this.role = role;
      this.agenticFeaturesEnabled = Boolean(agenticFeaturesEnabled);
    },
    // This function clears every authenticated-session field on logout or expiry.
    clearSession() {
      this.token = null;
      this.role = null;
      this.agenticFeaturesEnabled = false;
    },
    // This function stores or clears the active authentication token.
    setToken(newValue) {
      this.token = newValue;
    },
    // This function stores or clears the current authorization role.
    setRole(newValue) {
      this.role = newValue;
    },
    // This function records whether optional agentic features are available.
    setAgenticFeaturesEnabled(newValue) {
      this.agenticFeaturesEnabled = newValue;
    }
  },
  getters: {
    // This function returns the active authentication token.
    getToken: state => state.token,
    // This function returns the current authorization role.
    getRole: state => state.role,
    // This function returns whether agentic features are enabled.
    isAgenticFeaturesEnabled: state => state.agenticFeaturesEnabled
  },
});

export default useStore
