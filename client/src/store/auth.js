import { defineStore } from 'pinia';

export const useStore = defineStore('auth', {
  state: () => ({
    token: null,
    role: null
  }),
  actions: {
    setToken(newValue) {
      this.token = newValue;
    },
    setRole(newValue) {
      this.role = newValue;
    },
    setAgenticFeaturesEnabled(newValue) {
      this.agenticFeaturesEnabled = newValue;
    }
  },
  getters: {
    getToken: state => state.token,
    getRole: state => state.role,
    isAgenticFeaturesEnabled: state => state.agenticFeaturesEnabled
  },
});

export default useStore