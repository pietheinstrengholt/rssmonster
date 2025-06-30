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
    }
  },
  getters: {
    getToken: state => {
      return state.token
    },
    getRole: state => {
      return state.role
    }
  },
});

export default useStore